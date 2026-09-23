import test from 'node:test';
import assert from 'node:assert/strict';
import {mkdtempSync,rmSync,readFileSync} from 'node:fs';
import {tmpdir} from 'node:os';
import {join} from 'node:path';
import {Readable} from 'node:stream';
import {spawnSync} from 'node:child_process';
import storeModule from './event-store.cjs';
import collector from './collect.js';
import schedule from './collector-schedule.cjs';
const {jsonItems,EventStore,openRollingStore}=storeModule;
const {trophyEventIdentity_,parseBattleTimeMs_}=collector;
const now=Date.UTC(2026,8,23,4), cutoff=now-7*86400000;
const event=(id,t='20260923T030000.000Z')=>({id,battleTime:t,mode:'ladder_pvp',trophyMid:7200,team:{tag:'A'+id,deck:['a','b','c','d','e','f','g','h'],crowns:1,trophies:7200},opponent:{tag:'B'+id,deck:['a','b','c','d','e','f','g','i'],crowns:0,trophies:7200}});
const opts={identity:trophyEventIdentity_,time:e=>parseBattleTimeMs_(e.battleTime),cutoff,through:now};
function tempStore(){const dir=mkdtempSync(join(tmpdir(),'event-test-'));const db=new EventStore(join(dir,'db'),opts);return {db,close(){db.close();rmSync(dir,{recursive:true,force:true});}};}

test('stream parser preserves multibyte text, quotes and nested objects across every byte boundary',async()=>{
  const values=[{id:'日本語',nested:{text:'} [ \\" events'}},{id:'two',a:[1,2]}];
  const bytes=Buffer.from(JSON.stringify({updated:'x',events:values}));
  const got=[];for await(const e of jsonItems(Readable.from([...bytes].map(b=>Buffer.from([b])))))got.push(e);
  assert.deepEqual(got,values);
  await assert.rejects(async()=>{for await(const e of jsonItems(Readable.from(['{"events":[{"x":1}'])))void e;},/truncated/);
});
test('uncapped storage keeps more than 1600 events in one band and deduplicates both API perspectives',async()=>{
  const s=tempStore();try{
    const list=Array.from({length:2100},(_,i)=>event(i));
    const first=await s.db.ingest(list);assert.equal(first.added,2100);
    const reversed=list.map(e=>({...e,id:'different',team:e.opponent,opponent:e.team}));
    assert.equal((await s.db.ingest(reversed)).added,0);
    assert.equal(s.db.count(),2100);assert.equal([...s.db.events()].length,2100);
    assert.equal((await s.db.ingest([event('old','20260915T010000.000Z'),event('future','20260924T010000.000Z')])).excluded,2);
  }finally{s.close();}
});
test('interrupted archive is retried without duplicate records or a false completion marker',async()=>{
  const s=tempStore();const source={key:'raw/1',etag:'v1'};try{
    async function* broken(){for(let i=0;i<2100;i++)yield event(i);throw Error('broken');}
    await assert.rejects(s.db.ingest(broken(),source),/broken/);assert.equal(s.db.hasSource(source),false);
    await s.db.ingest(Array.from({length:2100},(_,i)=>event(i)),source);
    assert.equal(s.db.count(),2100);assert.equal(s.db.hasSource(source),true);assert.equal(s.db.hasSource({...source,etag:'v2'}),false);
  }finally{s.close();}
});
test('R2 snapshot survives restart, archive pagination and day/window expiry',async()=>{
  const objects=new Map(), source='private/raw/events/2026-09-23/run-1.json';
  objects.set(source,Buffer.from(JSON.stringify({events:[event(1),event(2)]})));
  objects.set(source.replace('run-1','run-2'),Buffer.from(JSON.stringify({events:[event(2),event(3)]})));
  let paged=false;
  let puts=0;
  const request=async(method,key,body,type,options={})=>{
    if(options.query){const entries=[...objects].filter(([k])=>k.startsWith(options.query.prefix)&&k.endsWith('.json'));
      const next=entries.length>1&&!options.query['continuation-token']; if(options.query['continuation-token'])paged=true;
      const page=options.query['continuation-token']?entries.slice(1):entries.slice(0,1);
      return new Response('<ListBucketResult><IsTruncated>'+next+'</IsTruncated>'+(next?'<NextContinuationToken>page2</NextContinuationToken>':'')+page.map(([k])=>'<Contents><Key>'+k+'</Key><ETag>&quot;v1&quot;</ETag><Size>20</Size></Contents>').join('')+'</ListBucketResult>');}
    if(method==='PUT'){objects.set(key,readFileSync(options.file));puts++;return new Response(null,{status:200});}
    return objects.has(key)?new Response(objects.get(key)):new Response(null,{status:404});
  };
  const args={request,prefix:'private/raw/events/',snapshot:'db.gz',identity:opts.identity,time:opts.time,cutoff,through:now};
  let rolling=await openRollingStore(args);
  assert.equal((await rolling.backfill()).state,'complete');assert.equal(rolling.store.count(),3);
  await rolling.save();rolling.cleanup();assert.equal(puts,1);assert.equal(paged,true);
  rolling=await openRollingStore(args);assert.equal((await rolling.backfill()).added,0);assert.equal(rolling.store.count(),3);rolling.cleanup();
  rolling=await openRollingStore({...args,cutoff:now});assert.equal(rolling.store.count(),0);rolling.cleanup();
});
test('unknown/tagless legacy identities are orientation independent',()=>{
  const a=event(1);delete a.team.tag;delete a.opponent.tag;
  assert.equal(trophyEventIdentity_(a),trophyEventIdentity_({...a,team:a.opponent,opponent:a.team}));
  assert.notEqual(trophyEventIdentity_(a),trophyEventIdentity_({...a,battleTime:'20260923T031000.000Z'}));
});
test('300 trophy scheduling covers narrow bands, explores old candidates, and marks only actual attempts',()=>{
  const seeds={A:{tr:9000,lastFetch:0},B:{tr:9300,lastFetch:0},C:{tr:9600,lastFetch:0},D:{tr:13800,lastFetch:0},E:{tr:13800,lastFetch:now-1000,lastOk:now,lastBattle:now}};
  const result=schedule.selectSeeds(seeds,{},4,now);assert.deepEqual(new Set(result.picked),new Set(['A','B','C','D']));
  schedule.noteAttempt(seeds,['#B','#D'],now);assert.equal(seeds.A.lastFetch,0);assert.equal(seeds.C.lastFetch,0);assert.equal(seeds.B.lastFetch,now);assert.equal(seeds.D.lastFetch,now);
  assert.equal(schedule.revisitMs({lastOk:now,lastBattle:now},now),3600000);
  assert.equal(schedule.revisitMs({lastOk:now,lastBattle:now-10*86400000},now),24*3600000);
  const kept=schedule.retainSeeds({oldQuiet:{tr:900,lastSeen:1},fresh1:{tr:13800,lastSeen:99},fresh2:{tr:13800,lastSeen:100}},2);
  assert.deepEqual(new Set(Object.keys(kept)),new Set(['oldQuiet','fresh2']));
});

test('collector publishes all retained rows and does not overwrite output when snapshot upload fails',()=>{
  const code = `
    const assert=require('node:assert/strict'),fs=require('node:fs');
    const {updateTrophyIntel_}=require('./tools/collect.js');
    const objects=new Map(), event=${event.toString()};
    const stamp=new Date(Date.now()-3600000).toISOString().replace(/[-:]/g,'');
    const rows=Array.from({length:2101},(_,i)=>event(i,stamp));
    const day=new Date().toISOString().slice(0,10), raw='private/raw/trophy-battle-events-v1/'+day+'/run-fixture.json';
    objects.set(raw,Buffer.from(JSON.stringify({events:rows.concat(rows.map(e=>({...e,team:e.opponent,opponent:e.team})))})));
    let fail=false, gameCalls=0;
    global.fetch=async(url,init={})=>{
      const u=new URL(url);assert.equal(u.hostname,'fixture.r2.cloudflarestorage.com');
      if(u.searchParams.has('list-type')){
        const match=raw.startsWith(u.searchParams.get('prefix'));
        return new Response('<ListBucketResult><IsTruncated>false</IsTruncated>'+(match?'<Contents><Key>'+raw+'</Key><ETag>v1</ETag></Contents>':'')+'</ListBucketResult>');
      }
      const key=decodeURIComponent(u.pathname.slice('/crdb-data-private/'.length));
      if(init.method==='PUT'){
        if(fail && key.endsWith('.sqlite.gz'))return new Response(null,{status:500});
        if(typeof init.body==='string')objects.set(key,Buffer.from(init.body));
        else {const chunks=[];for await(const chunk of init.body)chunks.push(chunk);objects.set(key,Buffer.concat(chunks));}
        return new Response(null,{status:200});
      }
      return objects.has(key)?new Response(objects.get(key)):new Response(null,{status:404});
    };
    (async()=>{
      await updateTrophyIntel_();
      const key='private/trophy-band-card-intel-public-v1.json', good=objects.get(key);
      const result=JSON.parse(good);assert.equal(result.count,2101);assert.equal(result.byBand['7200-7499'].games,2101);assert.equal(result.coverage.state,'complete');assert.equal(result.coverage.countLimit,null);
      assert.equal(JSON.stringify(result).includes('battleTime'),false);assert.equal(result.byCard.a.games,4202);assert.equal(result.byCard.a.wr,50);
      fail=true;await assert.rejects(updateTrophyIntel_(),/snapshot_write/);assert.deepEqual(objects.get(key),good);
    })().catch(e=>{console.error(e);process.exitCode=1;});
  `;
  const child=spawnSync(process.execPath,['-e',code],{cwd:new URL('..',import.meta.url),encoding:'utf8',env:{...process.env,R2_ACCOUNT_ID:'fixture',R2_ACCESS_KEY_ID:'fixture',R2_SECRET_ACCESS_KEY:'fixture',R2_BUCKET:'crdb-data-private',R2_PRIVATE_PREFIX:'private/',PRIVATE_GH_MIRROR:'0',PUBLIC_GH_MIRROR:'0'}});
  assert.equal(child.status,0,child.stderr+'\n'+child.stdout);
});

test('unselected players retain processing bookmarks while evicted candidates are pruned',()=>{
  const bookmarks={'#A':'time-a','#B':'time-b','#C':'time-c','#TOP':'time-top'};
  const retained=schedule.retainBookmarks(bookmarks,{A:{},B:{}},{TOP:true});
  assert.deepEqual(retained,{'#A':'time-a','#B':'time-b','#TOP':'time-top'});
});
