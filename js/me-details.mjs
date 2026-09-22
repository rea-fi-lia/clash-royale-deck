import { buildDeckUrl } from './deck-build-link.mjs?v=260818';
const tr=s=>window.CRI18N?.tr(s)||s;
const tx=(s,v)=>Object.entries(v).reduce((a,[k,x])=>a.replaceAll('{'+k+'}',String(x)),tr(s));
const esc=s=>String(s??'').replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'})[c]);
const fmt=t=>{const m=String(t).match(/^(\d{4})(\d{2})(\d{2})T(\d{2})(\d{2})(\d{2})/);return m?new Date(Date.UTC(+m[1],+m[2]-1,+m[3],+m[4],+m[5],+m[6])).toLocaleString('ja-JP'):'';};
const form=(f,i)=>({norm:'n',normal:'n',champ:'n',evo:'e',hero:'h'})[f?.[i]]||f?.[i]||'n';
const mode=n=>({ranked_pol:'ランク戦',ladder_pvp:'トロフィーロード',ladder_trail:'トロフィーロード',pathOfLegend:'ランク戦',PvP:'1対1',unknown:'モード未記録'})[n]||n;
export const cardBuildLink=(name,form='n')=>'<a class="me-card-build" href="'+esc(buildDeckUrl([name],[form]))+'" aria-label="'+esc(tx('{name}を軸にして組む',{name:tr(name)}))+'" title="'+esc(tr('軸にして組む'))+'">'+window.cardImgTag(name,form,{alt:name})+'</a>';
export const deckBuildLink=(deck,forms)=>'<a class="me-build-action" href="'+esc(buildDeckUrl(deck,forms))+'">'+esc(tr('このデッキで組む'))+' <span aria-hidden="true">↗</span></a>';
export const deckCards=(deck,forms)=>'<div class="me-detail-cards">'+(deck||[]).map((n,i)=>'<span title="'+esc(n)+'">'+cardBuildLink(n,form(forms,i))+'<small>'+esc(n)+'</small></span>').join('')+'</div>'+((deck||[]).length===8?deckBuildLink(deck,forms):'');
let active=null;
function dialog(title){
  active?.close();
  const el=document.createElement('dialog');el.className='me-dialog';el.setAttribute('aria-labelledby','meDialogTitle');
  el.innerHTML='<header class="me-dialog-head"><div><span class="me-eyebrow">MATCH INSIGHTS</span><h2 id="meDialogTitle">'+esc(tr(title))+'</h2></div><button type="button" class="me-dialog-close" aria-label="'+esc(tr('詳細を閉じる'))+'">✕</button></header><div class="me-dialog-body"></div>';
  document.body.append(el);el.querySelector('button').addEventListener('click',()=>el.close());
  el.addEventListener('click',e=>{if(e.target===el){const r=el.getBoundingClientRect();if(e.clientX<r.left||e.clientX>r.right||e.clientY<r.top||e.clientY>r.bottom)el.close();}});
  el.addEventListener('close',()=>{el.remove();if(active===el)active=null;});active=el;el.showModal();return el;
}
export function showBattle(b){
  const el=dialog('この試合の詳細');
  el.querySelector('.me-dialog-body').innerHTML='<div class="me-match-top"><div><b class="'+(b.win?'me-positive':'me-negative')+'">'+(b.draw?'DRAW':b.win?'WIN':'LOSE')+'</b><span>'+esc(fmt(b.t))+'</span></div><strong>'+esc(b.tc??'—')+' <small>–</small> '+esc(b.oc??'—')+'</strong></div>'
    +'<div class="me-match-facts"><span>'+esc(mode(b.mode||'unknown'))+'</span><span>試合前 '+Number(b.tr||0).toLocaleString()+' 🏆</span><span>増減 '+(Number.isFinite(b.trophyChange)?(b.trophyChange>=0?'+':'')+b.trophyChange:'未取得')+'</span><span>試合時間 '+(b.durationSeconds?Math.floor(b.durationSeconds/60)+'分'+Math.round(b.durationSeconds%60)+'秒':'未取得')+'</span></div>'
    +'<h3>あなたのデッキ</h3>'+deckCards(b.deck,b.df)+(b.tower?'<p class="note">タワーユニット：'+esc(b.tower)+'</p>':'')
    +'<h3>相手のデッキ '+(b.oppTag?'<small>#'+esc(b.oppTag)+'</small>':'')+'</h3>'+deckCards(b.opp,b.of)+(b.oppTower?'<p class="note">タワーユニット：'+esc(b.oppTower)+'</p>':'')
    +'<p class="note">収集できた試合の事実を表示しています。未取得の増減・時間は推定していません。'+(!b.df||!b.of?'古い記録のカード形態は不明です。':'')+'</p>';
}
function rows(r){return '<b>'+r.winRate+'%</b><span>'+esc(tx('{wins}勝 · {losses}敗 · {draws}分',r))+'</span><small>'+esc(tx('{games}戦',r))+'</small>';}
function scopeHTML(data){
  if(!data||!data.games)return '<p class="me-empty">'+esc(tr('この条件に一致する試合は、まだ取得できていません。'))+'</p>';
  const deckRows=data.opponents.map(r=>'<div class="me-opponent-row"><div class="me-deck-cards">'+(r.deck||[]).map((n,i)=>'<span title="'+esc(n)+'">'+cardBuildLink(n,form(r.forms,i))+'</span>').join('')+'</div><div class="me-opponent-result">'+rows(r)+deckBuildLink(r.deck,r.forms)+'</div></div>');
  const cardRows=data.cards.map(r=>'<tr><td><span class="me-card-label">'+cardBuildLink(r.name)+'<span>'+esc(r.name)+'</span></span></td><td>'+r.winRate+'%</td><td>'+r.wins+' / '+r.losses+(r.draws?' / '+r.draws:'')+'</td><td>'+r.games+(r.games<10?'<small>'+esc(tr('少数'))+'</small>':'')+'</td></tr>');
  const extra=(list,n)=>list.slice(0,n).join('')+(list.length>n?'<details class="me-more"><summary>'+esc(tx('残り{n}件を見る',{n:list.length-n}))+'</summary>'+list.slice(n).join('')+'</details>':'');
  return '<div class="me-scope-stats"><b>'+data.winRate+'<small>%</small></b><span>'+esc(tx('{wins}勝 · {losses}敗 · {draws}分',data))+'<small>'+esc(tx('{games}戦',data))+'</small></span></div>'
    +'<p class="me-coverage">'+esc(fmt(data.firstAt))+' 〜 '+esc(fmt(data.lastAt))+'<br>'+Object.entries(data.modes||{}).map(([n,g])=>esc(tr(mode(n)))+' '+esc(tx('{games}戦',{games:g}))).join(' · ')+'</p>'
    +'<h4>'+esc(tr('何に勝って、何に負けたか'))+'</h4><p class="note">'+esc(tr('相手の8枚・形態が同じ試合をまとめています。'))+'</p>'+extra(deckRows,8)
    +'<h4>'+esc(tr('相手にこのカードが入っていたとき'))+'</h4><p class="note">'+esc(tr('対面勝率が低い順。カード単独が敗因とは限りません。'))+'</p><div class="me-table-scroll"><table><thead><tr><th>'+esc(tr('相手カード'))+'</th><th>'+esc(tr('勝率'))+'</th><th>'+esc(tr('勝 / 敗'))+'</th><th>'+esc(tr('試合数'))+'</th></tr></thead><tbody>'+cardRows.join('')+'</tbody></table></div>';
}
const detailCache=new Map();
export function prefetchDeck(dk,tag,days){
  const params=new URLSearchParams({tag,key:dk.key,days:String(days)}),key=params.toString(),old=detailCache.get(key);
  if(old&&Date.now()-old.at<10000)return old.promise;
  const promise=fetch('/api/me/deck?'+params,{cache:'no-store'}).then(r=>{if(!r.ok)throw new Error('detail_unavailable');return r.json();}).catch(e=>{if(detailCache.get(key)?.promise===promise)detailCache.delete(key);throw e;});
  detailCache.set(key,{at:Date.now(),promise});if(detailCache.size>24)detailCache.delete(detailCache.keys().next().value);return promise;
}
export function showDeck(dk,tag,days){
  const el=dialog('この形のデッキの対戦成績'),body=el.querySelector('.me-dialog-body');
  body.innerHTML=deckCards(dk.deck,dk.forms)+'<p class="note">同じ8枚でも、通常・進化・ヒーローの形態が異なるものは分けています。選択期間：'+(days?days+'日':'全期間')+(dk.forms?'':' · 形態未記録。通常形態と確定した記録ではありません。')+'</p>'
    +'<div class="me-insight-scopes"><section><span class="me-eyebrow">YOUR MATCHES</span><h3>あなたが使ったとき</h3><p class="me-coverage me-scope-description">あなたがこの形で戦った、収集済みの試合。</p><div data-scope="personal"><div class="me-scope-stats"><b>'+dk.winRate+'<small>%</small></b><span>'+dk.wins+'勝 · '+dk.losses+'敗<small>'+dk.games+'戦</small></span></div><p class="note">相手別の内訳を取得中…</p></div></section><section><span class="me-eyebrow">ALL COLLECTED MATCHES</span><h3>自分を含む、このデッキ全体</h3><p class="me-coverage me-scope-description">CRDBが収集した範囲。全プレイヤーの全試合ではありません。</p><div data-scope="global"><p class="note">同じ形のデッキを照合中…</p></div></section></div><p class="me-history-status" role="status"></p>';
  let timer;el.addEventListener('close',()=>clearTimeout(timer));
  let lastPersonal='',lastGlobal='';
  async function load(){
    try{
      const j=await prefetchDeck(dk,tag,days);if(!el.open)return;
      const p=JSON.stringify(j.personal),g=JSON.stringify(j.global);
      if(p!==lastPersonal){body.querySelector('[data-scope="personal"]').innerHTML=scopeHTML(j.personal);lastPersonal=p;}
      if(g!==lastGlobal){body.querySelector('[data-scope="global"]').innerHTML=scopeHTML(j.global);lastGlobal=g;}
      body.querySelector('[role="status"]').textContent=j.history?.state==='complete'?'保存済みアーカイブとの照合が完了しています。':'過去の保存データを取り込み中です。現在の数字は取得済みの試合分で、照合に応じて増えます。';
      if(j.history?.state!=='complete')timer=setTimeout(load,12000);
    }catch(e){if(!el.open)return;body.querySelector('[role="status"]').textContent='対戦詳細を取得できませんでした。通信を確認して開き直してください。';}
  }
  load();
}

const popularCache=new Map();
export function fetchPopularDeck(dk){
  const params=new URLSearchParams({deck:dk.deck.join(','),f:dk.forms,window:dk.window||'3d'});
  if(dk.asOf)params.set('asOf',dk.asOf);
  const key=params.toString(),old=popularCache.get(key);
  if(old&&Date.now()-old.at<15000)return old.promise;
  const promise=fetch('/api/decks/matchups?'+params,{cache:'no-store'}).then(r=>{if(!r.ok)throw new Error('detail_unavailable');return r.json();}).catch(e=>{if(popularCache.get(key)?.promise===promise)popularCache.delete(key);throw e;});
  popularCache.set(key,{at:Date.now(),promise});if(popularCache.size>24)popularCache.delete(popularCache.keys().next().value);return promise;
}
export function showPopularDeck(dk){
  const el=dialog('このデッキの対戦成績'),body=el.querySelector('.me-dialog-body');el.classList.add('me-popular-dialog');
  const windowLabel=tr(({'1h':'直近1時間','1d':'直近1日','3d':'過去3日','7d':'統計目安7日'})[dk.window]||'過去3日');
  body.innerHTML=deckCards(dk.deck,dk.forms)+'<p class="me-coverage">'+esc(windowLabel)+' · '+esc(tr('ランク戦'))+'</p>'
    +'<p class="note">'+esc(tr('同じ8枚・同じ形態のデッキが戦った、収集済みの試合です。一覧のランキング集計とは、取得範囲が異なる場合があります。'))+'</p>'
    +'<div data-scope="global" aria-busy="true"><p class="me-empty">'+esc(tr('相手別の内訳を取得中…'))+'</p></div><p class="me-history-status" role="status"></p>';
  let timer,last='';el.addEventListener('close',()=>clearTimeout(timer));
  async function load(){
    try{
      const j=await fetchPopularDeck(dk);if(!el.open)return;
      const scope=body.querySelector('[data-scope="global"]'),next=JSON.stringify(j.global);
      if(next!==last){scope.innerHTML=scopeHTML(j.global);last=next;}scope.setAttribute('aria-busy','false');
      body.querySelector('[role="status"]').textContent=tr(j.history?.state==='complete'&&j.history.latestComplete?'保存済みアーカイブとの照合が完了しています。':'過去の保存データを取り込み中です。現在の数字は取得済みの試合分で、照合に応じて増えます。');
      if(j.history?.state!=='complete'||!j.history.latestComplete)timer=setTimeout(load,20000);
      window.CRI18N?.applyTo(el);
    }catch{
      if(!el.open)return;body.querySelector('[data-scope="global"]').setAttribute('aria-busy','false');
      const status=body.querySelector('[role="status"]');status.textContent=tr('対戦詳細を取得できませんでした。');
      const retry=document.createElement('button');retry.type='button';retry.className='me-build-action';retry.textContent=tr('再試行');status.append(' ',retry);retry.addEventListener('click',()=>{retry.disabled=true;load();});
    }
  }
  window.CRI18N?.applyTo(el);load();
}
