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
