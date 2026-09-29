// Official absolute values are applied AFTER community data. Never compound ratios.
const {readCatalogue} = require('./card-catalogue.cjs');
const {articleDigest} = require('./balance-verification.cjs');
const reviewed = require('../catalogue/balance-checks.json');
const NEWS = 'https://supercell.com/en/games/clashroyale/blog/';
const text = n => n?.nodeType === 'text' ? n.value : (n?.content || []).map(text).join('');
const id = c => [c.slug,c.form,c.key,c.level || 0].join('/');
const normalize = s => s.toLowerCase().replace(/[^a-z0-9]/g,'');
const ATTRS = new Set(['Hit Speed','First Hit Speed','Range','Sight Range','Freeze Duration','Ability Duration','Slow Duration','Stun Duration','Rage Duration','Knockback','Spear Range','Bomb Bounce Distance','Crown Tower Damage Reduction']);
const STATS = new Set(['Damage','Area Damage','Hitpoints','Shield Hitpoints','Crown Tower Damage','Death Damage','Spawn Damage','Skeletrooper Landing Damage','Warp Damage','Goblin Brawler Hitpoints']);
function parseArticle(html, source, now = new Date()) {
  const raw = html.match(/<script id="__NEXT_DATA__"[^>]*>([\s\S]*?)<\/script>/)?.[1];
  const page = JSON.parse(raw || '{}').props?.pageProps;
  if (!page?.title || !Array.isArray(page.bodyCollection)) throw Error('Official article structure changed');
  if (!/balance/i.test(page.title) || /work.in.progress|preview|proposed|draft|merge/i.test(page.title)) return {checks:[],pending:[],scheduled:[],ignored:true};
  const year = new Date(page.publishDate).getUTCFullYear();
  if (!Number.isInteger(year)) throw Error('Official publication date missing');
  const allText = page.bodyCollection.map(b=>[b.title,text(b.text?.json),text(b.featureText?.json)].join(' ')).join('\n');
  const hasLevel11 = /(?:scaled at|level)\s*(?:Level\s*)?11/i.test(allText);
  const catalogue = readCatalogue().cards;
  const checks=[], pending=[], scheduled=[];
  let effectiveAt = null;
  for (const block of page.bodyCollection) {
    if (block.text?.json) {
      for(const node of block.text.json.content || []) {
        if (!/^heading/.test(node.nodeType)) continue;
        const m=text(node).match(/Balance (?:Update|Changes?)\s*[–—:-]\s*([A-Z][a-z]+)\s+(\d{1,2})(?:st|nd|rd|th)?(?:,?\s+(20\d\d))?/);
        if(m) {const d=new Date(`${m[1]} ${m[2]}, ${m[3] || year} 00:00:00 GMT`);effectiveAt=Number.isFinite(+d)?d.toISOString().slice(0,10):null;}
      }
    }
    if (!block.featureText?.json) continue;
    let title=String(block.title || '').trim(), form='n';
    if(/^Hero /i.test(title)){form='h';title=title.replace(/^Hero /i,'');}
    if(/ Evolution$/i.test(title)){form='e';title=title.replace(/ Evolution$/i,'');}
    title=title.replace(/\s*\(Ground & Air\)\s*$/i,'');
    const card=catalogue.find(c=>normalize(c.english)===normalize(title));
    const lines=(block.featureText.json.content || []).flatMap(n=>text(n).split(/\r?\n/)).filter(s=>s.trim());
    if(!card?.forms[form] || !effectiveAt) {pending.push({title,reason:!effectiveAt?'Effective date missing':'Unknown card/form'});continue;}
    for(const line of lines) {
      let key,expected,level;
      if(line.trim()==='Now warps back to original position' && card.slug==='mega-minion' && form==='h') {key='Returns to Original Position';expected='Yes';}
      else {
        const m=line.match(/^([^:]+):\s*([\d.,]+(?:[–-][\d.]+)?)(?:s|\s*seconds?|\s*tiles|%)?\s*→\s*([\d.,]+(?:[–-][\d.]+)?)(?:\s*(s|seconds?|tiles|%))?(?:\s*\([^)]*\))?\s*$/);
        if(!m){pending.push({title,line,reason:'Unrecognized change'});continue;}
        key=m[1].trim();
        if(key==='First Attack') key='First Hit Speed';
        if(key==='Duration' && card.slug==='freeze') key='Freeze Duration';
        if(key==='Brawler Hitpoints' && card.slug==='goblin-cage') key='Goblin Brawler Hitpoints';
        if(key==='Damage' && ['fire-spirit','bomber'].includes(card.slug)) key='Area Damage';
        if(!ATTRS.has(key) && !STATS.has(key)){pending.push({title,line,reason:'Unmapped stat'});continue;}
        expected=/[–-]/.test(m[3])?m[3].replace(/-/g,'–'):Number(m[3].replace(/,/g,''));
        if(typeof expected==='number' && (!Number.isFinite(expected) || expected<0 || expected>100000 || (key==='Hit Speed' && expected===0))) {pending.push({title,line,reason:'Invalid value'});continue;}
        if(STATS.has(key)) {
          if(!hasLevel11 || typeof expected!=='number' || m[4]) {pending.push({title,line,reason:'Stat level/unit not explicit'});continue;}
          level=11;
        }
      }
      const known=reviewed.checks.find(c=>c.slug===card.slug && c.form===form && c.key===key);
      const change={slug:card.slug,form,key,expected,label:known?.label || key,effectiveAt,...(level?{level}:{}),source,articleSha256:articleDigest(html)};
      if(effectiveAt>now.toISOString().slice(0,10)) scheduled.push(change); else checks.push(change);
    }
  }
  if(!checks.length && !scheduled.length && !pending.length) pending.push({reason:'No supported changes found'});
  return {checks,pending,scheduled,source,publishedAt:page.publishDate,articleSha256:articleDigest(html)};
}
function mergeChecks(...groups) {
  const map=new Map();
  for(const c of groups.flat()) {
    const old=map.get(id(c));
    if(!old || c.effectiveAt>=old.effectiveAt) map.set(id(c),c);
  }
  return [...map.values()];
}
function withDependencies(checks) {
  // Furnace spawns the same Fire Spirit. Copy only this verified shared stat,
  // never every normal stat into unrelated summoned units or special forms.
  const spirit=checks.find(c=>c.slug==='fire-spirit'&&c.form==='n'&&c.key==='Area Damage');
  return mergeChecks(checks,spirit?[{...spirit,slug:'furnace',key:'Fire Spirit Area Damage',label:'召喚するファイアスピリットの範囲ダメージ',derivedFrom:'fire-spirit/n/Area Damage'}]:[]);
}
async function loadOfficialBalances(previous, fetcher=fetch, now=new Date()) {
  const checks=withDependencies(mergeChecks(reviewed.checks.map(c=>({...c,source:reviewed.source,articleSha256:reviewed.articleSha256})),previous?.checks || []));
  const checkedAt=now.toISOString();
  try {
    const read=async u=>{const r=await fetcher(u,{signal:AbortSignal.timeout(15000)});if(!r.ok)throw Error('Official HTTP '+r.status);const t=await r.text();if(t.length>2000000)throw Error('Official page too large');return t;};
    const news=await read(NEWS);
    const urls=[...new Set([...news.matchAll(/href="([^"#]+)"/g)].map(m=>new URL(m[1],NEWS)).filter(u=>u.origin==='https://supercell.com' && u.pathname.startsWith('/en/games/clashroyale/blog/release-notes/') && /balance/i.test(u.pathname) && !/merge|wip|preview/i.test(u.pathname)).map(u=>u.href.replace(/\/$/,'')+'/'))].slice(0,4);
    if(!urls.length) throw Error('No official balance article found');
    const articles=[];
    // News lists newest first. WIP posts do not supersede the last final release.
    for(const source of urls) {const a=parseArticle(await read(source),source,now);if(!a.ignored){articles.push(a);break;}}
    articles.sort((a,b)=>String(a.publishedAt).localeCompare(String(b.publishedAt)));
    const pending=articles.flatMap(a=>(a.pending || []).map(p=>({...p,source:a.source})));
    const latest=articles.filter(a=>!a.ignored).at(-1);
    if(!latest) throw Error('No final balance article found');
    return {schemaVersion:1,checkedAt,status:pending.length?'review-required':'reviewed',source:latest.source,checks:withDependencies(mergeChecks(checks,...articles.map(a=>a.checks))),pending,scheduled:articles.flatMap(a=>a.scheduled || [])};
  } catch(e) {return {schemaVersion:1,checkedAt,status:'unavailable',source:previous?.source || reviewed.source,checks,pending:previous?.pending || [],scheduled:previous?.scheduled || [],error:String(e.message).slice(0,180)};}
}

function numeric(raw) {
  const s=String(raw ?? '').replace(/,/g,'').trim();
  const multi=s.match(/^(\d+(?:\.\d+)?)\s*x\s*\d+\s*\((\d+(?:\.\d+)?)\)$/);
  if(multi) return {per:+multi[1],total:+multi[2]};
  return /^-?\d+(?:\.\d+)?$/.test(s)?Number(s):null;
}
// No level conversion. Level 11 is an explicit, shared comparison standard.
function combatStats(target, slug, helpers) {
  const stats=Object.fromEntries(Object.entries(target.levels?.['11'] || {}).map(([k,v])=>[k,numeric(v)]).filter(([,v])=>v!==null));
  return {level:11,stats,hp:helpers.numFrom(stats,helpers.pickStatKey(stats,/hitpoints/i,slug,'hp')),dps:helpers.numFrom(stats,helpers.pickStatKey(stats,/damage per second/i,slug,'dps'))};
}
function applyOfficialBalances(data, ledger, helpers) {
  const supplements=require('../catalogue/stat-supplements.json');
  for(const seed of supplements.cards) {
    const card=data.cards.find(c=>c.slug===seed.slug);if(!card)continue;
    card.attrs={...seed.attrs,...card.attrs};
    card.levels ||= {};
    for(const [lv,row] of Object.entries(seed.levels)) card.levels[lv]={...row,...card.levels[lv]};
    card.supplementSource=seed.source;
  }
  for(const c of data.cards) {
    c.officialFields=[];
    for(const f of Object.values(c.formStats || {})) f.officialFields=[];
  }
  for(const check of ledger.checks) {
    const card=data.cards.find(c=>c.slug===check.slug);
    if(!card || check.effectiveAt>ledger.checkedAt.slice(0,10)) continue;
    const target=check.form==='n'?card:card.formStats?.[check.form];if(!target)continue;
    target.attrs ||= {}; target.levels ||= {};
    const table=check.level?(target.levels[String(check.level)] ||= {}):target.attrs;
    const previous=table[check.key] ?? null;
    if(check.level && numeric(previous) && typeof numeric(previous)==='object') {
      ledger.pending ||= [];ledger.pending.push({slug:check.slug,key:check.key,reason:'Compound stat needs an explicit component mapping'});ledger.status='review-required';continue;
    }
    const oldRow=target.levels['11'] || {},oldDamage=numeric(oldRow.Damage ?? oldRow['Area Damage']),oldDps=numeric(oldRow['Damage per second']),oldHit=parseFloat(target.attrs['Hit Speed']);
    const simpleDps=typeof oldDamage==='number' && typeof oldDps==='number' && oldHit>0 && Math.abs(Math.floor(oldDamage/oldHit+1e-9)-oldDps)<=1 && !Object.keys(oldRow).some(k=>/Form|Stage/i.test(k));
    target.officialFields.push({...check,upstreamValue:previous});
    if(check.level && numeric(previous)!==check.expected) {
      // Do not expose stale higher-level values as current, or invent rounding.
      for(const [lv,row] of Object.entries(target.levels)) if(+lv!==check.level) delete row[check.key];
      delete target.s16?.[check.key]; delete target.stats?.[check.key];
      if(/hitpoints/i.test(check.key)) target.hp16=null;
    }
    table[check.key]=String(check.expected);
    if(check.key==='Hit Speed' || /^(?:Damage|Area Damage)$/.test(check.key)) {
      const hit=Number.parseFloat(target.attrs['Hit Speed']);
      for(const [lv,row] of Object.entries(target.levels)) {
        const damage=numeric(row.Damage ?? row['Area Damage']);
        if(simpleDps && typeof damage==='number' && hit>0) row['Damage per second']=String(Math.floor(damage/hit+1e-9));
        else if(+lv!==11 && check.level) delete row['Damage per second'];
      }
      if(check.level && numeric(previous)!==check.expected) {
        delete target.s16?.['Damage per second'];delete target.stats?.['Damage per second'];target.dps16=null;
      } else if(check.key==='Hit Speed') {
        const damage=target.s16?.Damage ?? target.s16?.['Area Damage'];
        if(simpleDps && typeof damage==='number' && hit>0) {target.s16['Damage per second']=Math.floor(damage/hit+1e-9);target.stats['Damage per second']=String(target.s16['Damage per second']);target.dps16=target.s16['Damage per second'];}
      }
      if(!simpleDps && numeric(previous)!==check.expected && Object.keys(oldRow).some(k=>/damage per second/i.test(k))) {
        for(const row of Object.values(target.levels)) for(const k of Object.keys(row)) if(/damage per second/i.test(k)) delete row[k];
        for(const k of Object.keys(target.s16 || {})) if(/damage per second/i.test(k)) {delete target.s16[k];delete target.stats?.[k];}
        target.dps16=null;ledger.pending ||= [];ledger.pending.push({slug:check.slug,key:'DPS',reason:'Nonstandard attack cycle needs review'});ledger.status='review-required';
      }
    }
  }
  for(const card of data.cards) {
    card.n=helpers.buildN(card.attrs || {},card.n || {});
    card.combat=combatStats(card,card.slug,helpers);
    for(const target of Object.values(card.formStats || {})) target.combat=combatStats(target,card.slug,helpers);
  }
  data.balanceLedger=ledger;
  data.comparisonLevel=11;
  return data;
}
module.exports={parseArticle,mergeChecks,loadOfficialBalances,applyOfficialBalances,numeric};
