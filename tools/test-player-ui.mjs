import test from 'node:test';import assert from 'node:assert/strict';
import {arrangeImportedDeck,buildDeckUrl} from '../js/deck-build-link.mjs';
import {installAdminEntry} from '../js/admin-entry.js';
const cards=[{name:'e1',evolved:true},{name:'h1',hero:true},{name:'dual',evolved:true,hero:true},...['a','b','c','d','x'].map(name=>({name}))];
test('builder links preserve all eight names/forms and place special forms in supported slots',()=>{
 const names=['a','e1','h1','dual','b','c','d','x'],f='nehhnnnn';const x=arrangeImportedDeck(names,f,cards);assert.equal(x.exact,true);assert.equal(x.deck[0].name,'e1');assert.equal(x.deck[1].name,'h1');assert.equal(x.deck[2].name,'dual');assert.equal(x.wild.dual,'hero');assert.equal(new URL(buildDeckUrl(names,f),'https://test/').searchParams.get('f'),f);
});
test('a normal anchor is not silently evolved; impossible historical forms are explicitly flagged',()=>{
 const x=arrangeImportedDeck(['dual'],'n',cards);assert.equal(x.exact,true);assert.equal(x.deck[3].name,'dual');
 const bad=arrangeImportedDeck(['a'],'e',cards);assert.equal(bad.exact,false);
});
function environment(){let listener,user=null,link=null;globalThis.document={getElementById:id=>id==='crMenu'?{append:x=>{link=x;}}:link,createElement:()=>({style:{},remove(){link=null;}})};const auth={onChange:fn=>listener=fn,getUser:()=>user};installAdminEntry(auth);return {change:u=>{user=u;return listener(u);},get link(){return link;}};}
const owner={getIdToken:async()=> 'fixture-owner'},other={getIdToken:async()=> 'fixture-other'};
test('admin entry is absent for guest, denied and malformed owner responses',async()=>{
 const env=environment();await env.change(null);assert.equal(env.link,null);
 for(const value of [false,'true',null]){globalThis.fetch=async()=>Response.json({owner:value});await env.change(other);assert.equal(env.link,null);}
 globalThis.fetch=async()=>new Response(null,{status:403});await env.change(other);assert.equal(env.link,null);
});
test('confirmed owner sees entry; switching account removes it before verification completes',async()=>{
 const env=environment();globalThis.fetch=async()=>Response.json({owner:true});await env.change(owner);assert.equal(env.link.id,'crAdminLink');
 let release;globalThis.fetch=()=>new Promise(r=>release=r);const pending=env.change(other);assert.equal(env.link,null);await Promise.resolve();release(Response.json({owner:false}));await pending;assert.equal(env.link,null);
});
test('a late owner response cannot expose the entry after signing out',async()=>{
 const env=environment();let release;globalThis.fetch=()=>new Promise(r=>release=r);const pending=env.change(owner);await Promise.resolve();await env.change(null);release(Response.json({owner:true}));await pending;assert.equal(env.link,null);
});

test('builder remains valid as a classic script for inline controls',async()=>{const fs=await import('node:fs'),vm=await import('node:vm');assert.doesNotThrow(()=>new vm.Script(fs.readFileSync(new URL('../js/builder.js',import.meta.url),'utf8')));});

test('no ranked points yet keeps the road graph visible with an explicit pending label',async()=>{
 const {selectTrophySeries}=await import('../js/experience-core.mjs');const road=[{competition:'unknown',tr:13500},{competition:'trophy',tr:14000}];
 const data={competitions:{default:'ranked'},battles:road};assert.deepEqual(selectTrophySeries(data),{kind:'trophy',awaitingRanked:true,rows:road});
 data.battles=[...road,{competition:'ranked',tr:2700}];assert.equal(selectTrophySeries(data).kind,'ranked');assert.equal(selectTrophySeries(data).rows.length,1);
});

test('popular detail requests preserve all forms and selected window and share in-flight work',async()=>{
 const {fetchPopularDeck}=await import('../js/me-details.mjs');let calls=0,path;
 globalThis.fetch=async url=>{calls++;path=url;return Response.json({global:{games:3}});};
 const dk={deck:['a','b','c','d','e','f','g','h'],forms:'enhnnnnn',window:'1h',asOf:'2026-09-22T12:00:00.000Z'};
 const [a,b]=await Promise.all([fetchPopularDeck(dk),fetchPopularDeck(dk)]);assert.equal(calls,1);assert.deepEqual(a,b);const q=new URL(path,'https://test').searchParams;assert.equal(q.get('f'),dk.forms);assert.equal(q.get('asOf'),dk.asOf);assert.equal(q.get('window'),'1h');assert.equal(q.has('tag'),false);
});
test('failed popular detail requests can be retried immediately',async()=>{
 const {fetchPopularDeck}=await import('../js/me-details.mjs');const dk={deck:['z','b','c','d','e','f','g','h'],forms:'nnnnnnnn',window:'3d'};let calls=0;
 globalThis.fetch=async()=>{calls++;return calls===1?new Response(null,{status:503}):Response.json({global:{games:1}});};
 await assert.rejects(fetchPopularDeck(dk));assert.equal((await fetchPopularDeck(dk)).global.games,1);assert.equal(calls,2);
});

test('stalled detail response bodies time out and release the request for retry',async t=>{
 const {fetchPopularDeck,prefetchDeck}=await import('../js/me-details.mjs');
 t.mock.timers.enable({apis:['setTimeout']});
 const dk={deck:['timeout','b','c','d','e','f','g','h'],forms:'nnnnnnnn',key:'timeout-test'};
 for(const get of [()=>fetchPopularDeck(dk),()=>prefetchDeck(dk,'FIXTURE',7)]){
  let signal;globalThis.fetch=async(_,o)=>{signal=o.signal;return {ok:true,json:()=>new Promise(()=>{})};};
  const pending=get();const rejected=assert.rejects(pending,/detail_timeout/);
  await Promise.resolve();t.mock.timers.tick(12001);await rejected;assert.equal(signal.aborted,true);
  globalThis.fetch=async()=>Response.json({global:{games:1}});assert.equal((await get()).global.games,1);
 }
});

test('a rejected popular query replaces loading text and exposes a working retry',async()=>{
 const {showPopularDeck}=await import('../js/me-details.mjs');
 const make=()=>({innerHTML:'',textContent:'',attrs:{},children:[],listeners:{},classList:{add(){}},setAttribute(k,v){this.attrs[k]=v;},addEventListener(k,fn){this.listeners[k]=fn;},append(...x){this.children.push(...x);}});
 const scope=make(),status=make(),body=make(),close=make(),dialog=make();
 dialog.showModal=()=>{dialog.open=true;};dialog.close=()=>{dialog.open=false;};
 body.querySelector=s=>s==='[data-scope="global"]'?scope:status;
 dialog.querySelector=s=>s==='.me-dialog-body'?body:close;
 globalThis.window={cardImgTag:()=>'<img>'};globalThis.document={body:{append(){}},createElement:t=>t==='dialog'?dialog:make()};
 let attempts=0;globalThis.fetch=async()=>++attempts===1?new Response(null,{status:400}):Response.json({global:{games:0},history:{state:'complete',latestComplete:true}});
 const dk={deck:['rejected','b','c','d','e','f','g','h'],forms:'nnnnnnnn'};
 showPopularDeck(dk);await new Promise(r=>setImmediate(r));
 assert.equal(scope.attrs['aria-busy'],'false');assert.doesNotMatch(scope.innerHTML,/取得中/);assert.match(scope.innerHTML,/取得できません/);
 const retry=status.children.find(x=>typeof x==='object');assert.equal(retry.textContent,'再試行');retry.listeners.click();
 await new Promise(r=>setImmediate(r));assert.equal(attempts,2);assert.match(scope.innerHTML,/まだ取得できていません/);assert.doesNotMatch(scope.innerHTML,/取得中/);
 dialog.close();
});
