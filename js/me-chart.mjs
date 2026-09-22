import { graphBattles, battleTime } from './experience-core.mjs?v=260816';
const clamp=(v,a,b)=>Math.max(a,Math.min(b,v));
export function zoomDomain(domain,factor,full,minimum,anchor=(domain[0]+domain[1])/2){
  const width=clamp((domain[1]-domain[0])*factor,minimum,full[1]-full[0]);
  const fraction=clamp((anchor-domain[0])/(domain[1]-domain[0]),0,1);
  const start=clamp(anchor-width*fraction,full[0],full[1]-width);return [start,start+width];
}
export function panDomain(domain,delta,full){const width=domain[1]-domain[0],start=clamp(domain[0]+delta,full[0],full[1]-width);return [start,start+width];}
const esc=s=>String(s??'').replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'})[c]);
const date=t=>new Date(t).toLocaleString('ja-JP',{month:'numeric',day:'numeric',hour:'2-digit',minute:'2-digit'});
export function mountChart(el,battles,state,onBattle){
  const seq=graphBattles(battles);if(seq.length<2){el.innerHTML='<p class="note">異なる日時のトロフィー記録が2件以上ある期間で、グラフを表示します。</p>';return()=>{};}
  const ts=seq.map(b=>battleTime(b.t)),ys=seq.map(b=>b.tr),low=ys.reduce((a,b)=>Math.min(a,b),Infinity),high=ys.reduce((a,b)=>Math.max(a,b),-Infinity),pad=Math.max(30,(high-low)*.18);
  const full={x:[ts[0],ts.at(-1)],y:[Math.max(0,low-pad),high+pad]};
  const signature=ts[0]+':'+ts.at(-1)+':'+seq.length;
  if(state.signature!==signature){state.signature=signature;state.x=[...full.x];state.y=[...full.y];}
  state.height = 290;
  el.innerHTML='<div class="me-chart-tools"><button type="button" data-action="reset">全体に戻す</button></div>'
    +'<div class="me-chart-stage"><svg class="me-trend" tabindex="0" role="img" aria-label="トロフィー推移。軸のハンドルをドラッグして拡大縮小。左右キーで試合選択、Enterで詳細、＋と−で時間軸、Shift併用で縦軸、Homeで全体表示。"></svg><div class="me-chart-tip" role="status" hidden></div></div>'
    +'<p class="me-chart-caption"><span>● 勝ち</span><span>● 負け</span>点に触れると試合の概要、クリックで詳細。各点は試合前のトロフィー。空白には未記録の試合を含む場合があります。</p>';
  const svg=el.querySelector('svg'),tip=el.querySelector('.me-chart-tip');
  let W,H,L=66,R=20,T=20,B=48,drag=null,selection=-1,frame=0;
  const X=t=>L+(t-state.x[0])/(state.x[1]-state.x[0])*(W-L-R),Y=v=>H-B-(v-state.y[0])/(state.y[1]-state.y[0])*(H-T-B);
  function hide(){tip.hidden=true;selection=-1;}
  function draw(){
    W=Math.max(280,Math.round(el.clientWidth));H=state.height;svg.setAttribute('viewBox',`0 0 ${W} ${H}`);
    svg.dataset.xRange=state.x.map(Math.round).join(',');svg.dataset.yRange=state.y.map(Math.round).join(',');
    const ticks=Array.from({length:5},(_,i)=>state.y[0]+(state.y[1]-state.y[0])*i/4);
    const grid=ticks.map(v=>`<line x1="${L}" x2="${W-R}" y1="${Y(v)}" y2="${Y(v)}" class="me-grid"/><text x="${L-10}" y="${Y(v)+4}" text-anchor="end" class="me-ax">${Math.round(v).toLocaleString()}</text>`).join('');
    let line='';
    for(let i=0;i<seq.length;i++){
      if(ts[i]<state.x[0]&&ts[i+1]<state.x[0]||ts[i]>state.x[1]&&ts[i-1]>state.x[1])continue;
      const connect=i&&ts[i]-ts[i-1]<=864e5&&Math.abs(ys[i]-ys[i-1])<=60;
      line+=(connect&&line?'L':'M')+X(ts[i]).toFixed(2)+','+Y(ys[i]).toFixed(2)+' ';
    }
    const dots=seq.map((b,i)=>ts[i]>=state.x[0]&&ts[i]<=state.x[1]&&ys[i]>=state.y[0]&&ys[i]<=state.y[1]?`<circle cx="${X(ts[i])}" cy="${Y(ys[i])}" r="${i===selection?6:3.5}" class="${b.win?'me-dot-w':'me-dot-l'}"/>`:'').join('');
    const n=W<500?2:4;let labels='';for(let i=0;i<n;i++){const t=state.x[0]+(state.x[1]-state.x[0])*i/(n-1);labels+=`<text x="${X(t)}" y="${H-25}" text-anchor="${i===0?'start':i===n-1?'end':'middle'}" class="me-ax">${esc(date(t))}</text>`;}
    svg.innerHTML=`<defs><clipPath id="mePlotClip"><rect x="${L}" y="${T}" width="${W-L-R}" height="${H-T-B}"/></clipPath></defs>${grid}<g clip-path="url(#mePlotClip)"><path d="${line}" class="me-chart-line"/>${dots}</g>${labels}`
      +`<g data-axis="x" class="me-axis-control me-axis-x"><rect x="${L}" y="${H-B}" width="${W-L-R}" height="${B}" class="me-axis-hit"/><rect x="${L}" y="${H-11}" width="${W-L-R}" height="6" rx="3" class="me-axis-rail"/><g transform="translate(${(L+W-R)/2},${H-8})" class="me-axis-grip"><rect x="-25" y="-7" width="50" height="14" rx="7"/><path d="M-15 -3l-4 3 4 3M15 -3l4 3-4 3M-5 -3v6M0 -3v6M5 -3v6"/></g><title>時間軸をドラッグして拡大・縮小</title></g>`
      +`<g data-axis="y" class="me-axis-control me-axis-y"><rect x="0" y="${T}" width="${L}" height="${H-T-B}" class="me-axis-hit"/><rect x="5" y="${T}" width="6" height="${H-T-B}" rx="3" class="me-axis-rail"/><g transform="translate(8,${(T+H-B)/2}) rotate(90)" class="me-axis-grip"><rect x="-25" y="-7" width="50" height="14" rx="7"/><path d="M-15 -3l-4 3 4 3M15 -3l4 3-4 3M-5 -3v6M0 -3v6M5 -3v6"/></g><title>トロフィー軸をドラッグして拡大・縮小</title></g>`;

  }
  const schedule=()=>{cancelAnimationFrame(frame);frame=requestAnimationFrame(draw);};
  const point=e=>{const r=svg.getBoundingClientRect();return {x:(e.clientX-r.left)*W/r.width,y:(e.clientY-r.top)*H/r.height};};
  function nearest(p){let best=-1,d=28;for(let i=0;i<seq.length;i++){if(ts[i]<state.x[0]||ts[i]>state.x[1]||ys[i]<state.y[0]||ys[i]>state.y[1])continue;const z=Math.hypot(X(ts[i])-p.x,Y(ys[i])-p.y);if(z<d){d=z;best=i;}}return best;}
  function show(i){
    selection=i;if(i<0){hide();return;}const b=seq[i];tip.hidden=false;
    tip.innerHTML=`<strong>${b.draw?'引き分け':b.win?'WIN':'LOSE'} <span>${b.tc??'—'} – ${b.oc??'—'}</span></strong><span>${esc(date(ts[i]))} · ${b.tr.toLocaleString()} 🏆</span><small>${esc((b.deck||[]).slice(0,2).join('・'))}<br>クリックで両者のデッキ・試合詳細</small>`;
    tip.style.left=clamp(X(ts[i])+12,8,W-Math.min(260,W-16))+'px';tip.style.top=clamp(Y(ys[i])-95,6,H-110)+'px';schedule();
  }
  function zoom(axis,factor){state[axis]=zoomDomain(state[axis],factor,full[axis],axis==='x'?Math.min(60000,full.x[1]-full.x[0]):10,axis==='x'?(selection>=0?ts[selection]:state.x[1]):undefined);hide();draw();}
  svg.addEventListener('pointerdown',e=>{if(e.button!==0)return;const p=point(e);drag={...p,axis:e.target.closest('[data-axis]')?.dataset.axis||'pan',xDomain:[...state.x],yDomain:[...state.y],moved:false};svg.setPointerCapture(e.pointerId);});
  svg.addEventListener('pointermove',e=>{
    const p=point(e);if(!drag){show(nearest(p));return;}const dx=p.x-drag.x,dy=p.y-drag.y;
    if(Math.hypot(dx,dy)<4&&!drag.moved)return;drag.moved=true;hide();
    if(drag.axis==='x')state.x=zoomDomain(drag.xDomain,Math.exp(-dx/180),full.x,Math.min(60000,full.x[1]-full.x[0]),drag.xDomain[0]+clamp((drag.x-L)/(W-L-R),0,1)*(drag.xDomain[1]-drag.xDomain[0]));
    else if(drag.axis==='y')state.y=zoomDomain(drag.yDomain,Math.exp(dy/180),full.y,10,drag.yDomain[1]-clamp((drag.y-T)/(H-T-B),0,1)*(drag.yDomain[1]-drag.yDomain[0]));
    else{state.x=panDomain(drag.xDomain,-dx/(W-L-R)*(drag.xDomain[1]-drag.xDomain[0]),full.x);state.y=panDomain(drag.yDomain,dy/(H-T-B)*(drag.yDomain[1]-drag.yDomain[0]),full.y);}
    svg.classList.add('is-dragging');schedule();
  });
  svg.addEventListener('pointerup',e=>{const open=drag?.axis==='pan'&&!drag.moved?nearest(point(e)):-1;drag=null;svg.classList.remove('is-dragging');if(svg.hasPointerCapture(e.pointerId))svg.releasePointerCapture(e.pointerId);draw();if(open>=0)onBattle(seq[open]);});
  svg.addEventListener('pointercancel',()=>{drag=null;svg.classList.remove('is-dragging');hide();draw();});
  svg.addEventListener('pointerleave',()=>{if(!drag){hide();schedule();}});
  svg.addEventListener('keydown',e=>{
    if(['ArrowLeft','ArrowRight'].includes(e.key)){e.preventDefault();const available=seq.map((b,i)=>i).filter(i=>ts[i]>=state.x[0]&&ts[i]<=state.x[1]&&ys[i]>=state.y[0]&&ys[i]<=state.y[1]);let at=available.indexOf(selection);at=clamp(at+(e.key==='ArrowRight'?1:-1),0,available.length-1);show(available[at]??-1);}
    else if(e.key==='Enter'&&selection>=0){e.preventDefault();onBattle(seq[selection]);}
    else if(['+','=','-'].includes(e.key)){e.preventDefault();zoom(e.shiftKey?'y':'x',e.key==='-'?1.4:1/1.4);}
    else if(e.key==='Home'){e.preventDefault();reset();}else if(e.key==='Escape'){hide();draw();}
  });
  function reset(){state.x=[...full.x];state.y=[...full.y];hide();draw();}
  el.querySelector('.me-chart-tools').addEventListener('click',e=>{const action=e.target.dataset.action;if(action==='reset')reset();else if(action){const [axis,dir]=action.split('-');zoom(axis,dir==='in'?1/1.4:1.4);}});
  const observer=new ResizeObserver(schedule);observer.observe(el);draw();
  return()=>{observer.disconnect();cancelAnimationFrame(frame);};
}
