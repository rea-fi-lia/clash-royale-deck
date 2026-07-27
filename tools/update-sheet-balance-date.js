#!/usr/bin/env node
/*
 * バランス調整（確定版）の適用日を、監修スプレッドシートの右端「バランス更新日」列に記入する。
 * 対象タブ: タグ表v2 / ポテンシャル。列が無ければ右端に新設する。既存列は一切触らない。
 *
 * 例:
 *   node tools/update-sheet-balance-date.js \
 *     --stats /tmp/card-stats.json \
 *     --changes tools/balance/season-84-final.json tools/balance/season-85-final.json \
 *     [--dry]
 *
 * 必要なもの: GOOGLE_APPLICATION_CREDENTIALS（未指定なら ~/.config/crdb/google-service-account.json）
 *             サービスアカウントがシートの編集者に共有されていること。
 */
const fs = require('fs');
const os = require('os');
const path = require('path');
const crypto = require('crypto');

const SPREADSHEET_ID = '1cjX3ptT0g0qjfwhoTBKbzRfXGZUNGLy_jspMSRCDPyU';
const TABS = [
  { title: 'タグ', nameHeader: 'カード名' },
  { title: 'ポテンシャル', nameHeader: 'カード名' },
];
const DATE_HEADER = 'バランス更新日';
const SCOPES = 'https://www.googleapis.com/auth/spreadsheets';

function argAll(name) {
  const out = []; const i = process.argv.indexOf(name);
  if (i < 0) return out;
  for (let k = i + 1; k < process.argv.length && !process.argv[k].startsWith('--'); k++) out.push(process.argv[k]);
  return out;
}
function b64url(x){return Buffer.from(x).toString('base64').replace(/=/g,'').replace(/\+/g,'-').replace(/\//g,'_');}
async function req(url, opt={}){
  const r=await fetch(url,opt); const t=await r.text();
  if(!r.ok) throw new Error((opt.method||'GET')+' '+url+' -> '+r.status+' '+t.slice(0,300));
  return t?JSON.parse(t):null;
}
async function token(){
  const kp=process.env.GOOGLE_APPLICATION_CREDENTIALS||path.join(os.homedir(),'.config/crdb/google-service-account.json');
  const key=JSON.parse(fs.readFileSync(kp,'utf8'));
  const now=Math.floor(Date.now()/1000);
  const unsigned=b64url(JSON.stringify({alg:'RS256',typ:'JWT'}))+'.'+b64url(JSON.stringify({iss:key.client_email,scope:SCOPES,aud:key.token_uri,iat:now,exp:now+3600}));
  const sig=crypto.createSign('RSA-SHA256').update(unsigned).sign(key.private_key);
  const body=new URLSearchParams({grant_type:'urn:ietf:params:oauth:grant-type:jwt-bearer',assertion:unsigned+'.'+b64url(sig)});
  const t=await req(key.token_uri,{method:'POST',headers:{'Content-Type':'application/x-www-form-urlencoded'},body});
  return t.access_token;
}
function colLetter(i){ let s=''; i++; while(i>0){ const m=(i-1)%26; s=String.fromCharCode(65+m)+s; i=Math.floor((i-1)/26);} return s; }

async function main(){
  const dry = process.argv.includes('--dry');
  const statsPath = argAll('--stats')[0];
  const changeFiles = argAll('--changes');
  if(!statsPath||!changeFiles.length){ console.error('usage: --stats <card-stats.json> --changes <c.json...> [--dry]'); process.exit(1); }

  const stats=JSON.parse(fs.readFileSync(statsPath,'utf8'));
  const jpBySlug={}; for(const c of stats.cards||[]) jpBySlug[c.slug]=c.jp;

  // slug/名前 → 適用日（後の調整が上書き＝最新日付が残る）
  const dateByJp={};
  const notes=[];
  for(const f of changeFiles){
    const m=JSON.parse(fs.readFileSync(f,'utf8'));
    for(const ch of m.changes||[]){
      const jp=jpBySlug[ch.slug];
      if(jp) dateByJp[jp]=m.liveAt;
    }
    for(const o of m.outOfScope||[]){
      if(o.jp) dateByJp[o.jp]=m.liveAt; // 例: スケルトンラッシュ（フィールド外だが調整はあった）
      else notes.push(`範囲外(シート名不明): ${o.name} (${o.label})`);
    }
  }
  // 新カード
  const ronin=stats.cards.find(c=>c.slug==='ronin');
  if(ronin&&ronin.addedAt) dateByJp[ronin.jp]=ronin.addedAt;

  const tk=await token();
  const H={Authorization:'Bearer '+tk,'Content-Type':'application/json'};
  const base=`https://sheets.googleapis.com/v4/spreadsheets/${SPREADSHEET_ID}`;
  const meta=await req(`${base}?fields=sheets.properties(sheetId,title,gridProperties.columnCount)`,{headers:H});
  const propsByTitle={};
  for(const s of meta.sheets||[]) propsByTitle[s.properties.title]=s.properties;

  for(const tab of TABS){
    const range=encodeURIComponent(`${tab.title}!A1:BZ400`);
    const data=await req(`${base}/values/${range}`,{headers:H});
    const rows=data.values||[];
    if(!rows.length){ console.log(`${tab.title}: 空`); continue; }
    const headers=rows[0].map(v=>String(v||'').trim());
    const nameCol=headers.findIndex(h=>h.startsWith(tab.nameHeader));
    if(nameCol<0){ console.log(`${tab.title}: カード名列なし`); continue; }
    let dateCol=headers.findIndex(h=>h===DATE_HEADER);
    const newCol=dateCol<0;
    if(newCol) dateCol=headers.length; // 右端に新設

    const props=propsByTitle[tab.title];
    if(props && dateCol>=props.gridProperties.columnCount && !dry){
      await req(`${base}:batchUpdate`,{method:'POST',headers:H,body:JSON.stringify({requests:[{appendDimension:{sheetId:props.sheetId,dimension:'COLUMNS',length:dateCol-props.gridProperties.columnCount+1}}]})});
      console.log(`  ${tab.title}: グリッドを${dateCol+1}列に拡張`);
    }
    const updates=[];
    if(newCol) updates.push({range:`${tab.title}!${colLetter(dateCol)}1`,values:[[DATE_HEADER]]});
    let hit=0;
    for(let r=1;r<rows.length;r++){
      const nm=String((rows[r]||[])[nameCol]||'').trim();
      if(!nm) continue;
      const d=dateByJp[nm];
      if(!d) continue;
      const cur=String((rows[r]||[])[dateCol]||'').trim();
      if(cur===d) continue;
      updates.push({range:`${tab.title}!${colLetter(dateCol)}${r+1}`,values:[[d]]});
      hit++;
    }
    console.log(`${tab.title}: 列=${colLetter(dateCol)}(${newCol?'新設':'既存'}) 記入対象=${hit}件`);
    if(dry){ console.log('  --dry のため書き込みスキップ'); continue; }
    if(updates.length){
      await req(`${base}/values:batchUpdate`,{method:'POST',headers:H,body:JSON.stringify({valueInputOption:'RAW',data:updates})});
      console.log(`  書き込み完了 (${updates.length}セル)`);
    }
  }
  // シートに行が無かった対象の報告
  const allRanges=await Promise.all(TABS.map(t=>req(`${base}/values/${encodeURIComponent(t.title+'!A1:BZ400')}`,{headers:H})));
  const namesInSheets=new Set();
  allRanges.forEach((d,i)=>{
    const rows=d.values||[]; if(!rows.length)return;
    const nc=rows[0].map(v=>String(v||'').trim()).findIndex(h=>h.startsWith(TABS[i].nameHeader));
    rows.slice(1).forEach(r=>namesInSheets.add(String((r||[])[nc]||'').trim()));
  });
  const missing=Object.keys(dateByJp).filter(n=>!namesInSheets.has(n));
  if(missing.length) console.log('シートに行が無い対象:', missing.join(' / '));
  if(notes.length) console.log(notes.join('\n'));
}
main().catch(e=>{console.error(e.message);process.exit(1);});
