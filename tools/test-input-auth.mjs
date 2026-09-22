import test from 'node:test';
import assert from 'node:assert/strict';
import '../js/input-guard.js';
import {createProfileSession} from '../js/auth-session.mjs';
class Input extends EventTarget {
  value='';blurs=0;
  blur(){this.blurs++;}
  fire(type,props={}){const e=new Event(type,{cancelable:true});Object.assign(e,props);this.dispatchEvent(e);return e;}
}
test('Japanese IME confirmation does not blur, rewrite, or publish intermediate input',()=>{
  const x=new Input();let changes=0;CRInputGuard.bindSearch(x,()=>changes++);
  x.fire('compositionstart');x.value='ほぐ';x.fire('input',{isComposing:true});
  x.fire('keydown',{key:'Enter',keyCode:229,isComposing:false});assert.equal(x.blurs,0);assert.equal(changes,0);
  x.value='ホグ';x.fire('compositionend');x.fire('input');x.fire('keydown',{key:'Enter'});x.fire('search');
  assert.equal(x.value,'ホグ');assert.equal(changes,1);assert.equal(x.blurs,0);
});
test('normal Enter submits; clear then paste the same query remains searchable',()=>{
  const x=new Input();let changes=0;CRInputGuard.bindSearch(x,()=>changes++);
  x.value='ナイト';x.fire('input');x.fire('keydown',{key:'Enter'});assert.equal(x.blurs,1);
  x.value='';x.value='ナイト';x.fire('input');assert.equal(changes,2);
  x.value='ナイトナイト';x.fire('input');assert.equal(x.value,'ナイトナイト');
});
const deferred=()=>{let resolve,reject;const promise=new Promise((a,b)=>{resolve=a;reject=b;});return {promise,resolve,reject};};
test('profile timeout preserves identity and retries without a logout transition',async()=>{
  const stalled=deferred(),events=[];let reads=0;
  const s=createProfileSession({timeoutMs:5,load:()=>++reads===1?stalled.promise:Promise.resolve({crTag:'QA'}),identity:u=>events.push(['identity',u?.uid]),profile:(u,p)=>events.push(['profile',u.uid,p.crTag]),unavailable:u=>events.push(['unavailable',u.uid])});
  const work=s.change({uid:'A'});assert.deepEqual(events,[['identity','A']]);await work;
  assert.deepEqual(events,[['identity','A'],['unavailable','A']]);await s.retry();
  assert.deepEqual(events.at(-1),['profile','A','QA']);stalled.resolve({crTag:'STALE'});await Promise.resolve();assert.equal(events.length,3);
});
test('late profile from another account cannot replace the current account',async()=>{
  const a=deferred(),b=deferred(),events=[];
  const s=createProfileSession({load:u=>u.uid==='A'?a.promise:b.promise,identity:u=>events.push(u?.uid||'out'),profile:(u,p)=>events.push(u.uid+':'+p.crTag),unavailable:()=>{}});
  const first=s.change({uid:'A'}),second=s.change({uid:'B'});b.resolve({crTag:'B9'});await second;a.resolve({crTag:'A9'});await first;
  assert.deepEqual(events,['A','B','B:B9']);await s.change(null);assert.equal(events.at(-1),'out');
});
test('offline error retries once per in-flight request and profile readiness is stable',async()=>{
  let calls=0;const profiles=[];
  const s=createProfileSession({load:async()=>{if(++calls===1)throw Error('offline');return {ok:true};},identity:()=>{},profile:(_,p)=>profiles.push(p),unavailable:()=>{}});
  await s.change({uid:'A'});await Promise.all([s.retry(),s.retry()]);await s.retry();assert.equal(calls,2);assert.equal(profiles.length,1);
});
