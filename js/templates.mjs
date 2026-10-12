import {buildDeckUrl} from './deck-build-link.mjs?v=260818';
const esc=s=>String(s??'').replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'})[c]);
const form=(f,i)=>f?.[i]||'n';
// 画面の文は翻訳の関数を通す（言語ページで日本語が残らないように・2026-10-12）
const _tr=s=>window.CRI18N?.tr(s)||s;
const _tf=(s,v)=>String(_tr(s)).replace(/\{(\w+)\}/g,(m,k)=>v[k]!=null?v[k]:m);
export async function showTemplates(){
 const dialog=document.createElement('dialog');dialog.className='template-dialog';dialog.innerHTML='<header><div><small>DECK LIBRARY</small><h2>'+_tr('テンプレートから組む')+'</h2></div><button type="button" aria-label="'+esc(_tr('閉じる'))+'">×</button></header><div class="template-body" aria-live="polite">'+_tr('参考デッキを取得中…')+'</div>';document.body.append(dialog);dialog.showModal();dialog.querySelector('button').onclick=()=>dialog.close();dialog.addEventListener('close',()=>dialog.remove());
 const body=dialog.querySelector('.template-body');
 const cards=r=>'<article class="template-card"><div class="template-card-title"><h3>'+esc(r.name||'CRDB '+(r.kind==='template'?_tr('テンプレート'):_tr('候補')))+'</h3><span>'+(r.kind==='historical-reference'?_tr('公式の過去例'):_tf('{n}日継続',{n:r.streak}))+'</span></div><div class="template-cards">'+r.deck.map((n,i)=>window.cardImgTag(n,form(r.forms,i),{alt:n,title:n})).join('')+'</div><div class="template-card-actions"><a href="'+esc(buildDeckUrl(r.deck,r.forms))+'">'+_tr('このデッキで組む')+'</a>'+(r.source?'<a href="'+esc(r.source)+'" target="_blank" rel="noopener">'+_tf('出典 · {x}',{x:esc(r.published)})+'</a>':'<span>'+_tf('使用率 {p}% · {r}位',{p:(r.share*100).toFixed(2),r:r.rank})+'</span>')+'</div></article>';
 try{const response=await fetch('/api/templates',{cache:'no-store'});if(!response.ok)throw Error();const data=await response.json();if(!dialog.open)return;
 body.innerHTML='<h3>'+_tr('CRDBの実測テンプレート')+'</h3><p>'+_tf('暫定基準：日別使用率の上位{top}位・{min}%以上。{c}日連続で候補、{t}日連続でテンプレート。8枚と形態が同じデッキを判定します。',{top:data.policy.topN,min:data.policy.minShare*100,c:data.policy.candidateDays,t:data.policy.templateDays})+'</p><p class="template-note">'+_tr('世界上位から収集した最新ランク戦デッキの観測です。勝利を保証する正解ではなく、組み方の出発点です。日ごとに20時間以上・各時間500人以上を取得できた日だけ判定します。')+'</p>'+(data.measured.length?'<div class="template-grid">'+data.measured.map(cards).join('')+'</div>':'<div class="template-empty">'+_tr('連続日数の記録を蓄積中です。条件を満たしたデッキから表示します。')+'</div>')+'<p class="template-note">'+_tf('判定日 {d} UTC · 有効な日別記録 {n}日',{d:esc(data.asOf),n:data.coverage.filter(d=>d.complete).length})+'</p><h3>'+_tr('過去の定番・公式参考デッキ')+'</h3><p>'+_tr('Supercellが2018年に公開した12の構成例です。当時の通常形態を保持しています。現在の環境での強さを認定したものではありません。')+'</p><div class="template-grid">'+data.classics.map(cards).join('')+'</div>';
 }catch{if(dialog.open)body.textContent=_tr('参考デッキを取得できませんでした。通信を確認して開き直してください。');}
}
document.getElementById('templateLibrary')?.addEventListener('click',showTemplates);
