import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync,rmSync,mkdtempSync,writeFileSync} from 'node:fs';
import {gunzipSync} from 'node:zlib';
import {createHash} from 'node:crypto';
import {tmpdir} from 'node:os';
import {join} from 'node:path';
import {gzipSync} from 'node:zlib';
import collector from './collect.js';
import reader from './read-battle-journal.cjs';
import journalModule from './battle-log-journal.cjs';
import schedule from './collector-schedule.cjs';
import telemetry from './collection-telemetry.cjs';
const now=Date.UTC(2026,8,23,12);
test('journal preserves unknown forms, draws, other modes and original fields with verified compressed chunks',async()=>{
  const journal=new journalModule.BattleLogJournal({chunkBytes:1,source:{commit:'test'}}),files=new Map();
  const records=[{tag:'#TEST',population:'fixture',fetchedAt:'date',battles:[{unknown:{form:99},crowns:0,type:'new-mode'}]},{tag:'#TEST2',battles:[]}];
  records.forEach(r=>journal.add(r));
  let manifest;
  const result=await journal.flush({prefix:'test',putFile:async(key,path,meta)=>{
    const bytes=readFileSync(path);assert.equal(meta.bytes,bytes.length);assert.equal(meta.sha256,createHash('sha256').update(bytes).digest('hex'));files.set(key,JSON.parse(gunzipSync(bytes).toString()));
  },putManifest:async(_,data)=>{manifest=data;}});
  assert.deepEqual([...files.values()],records);assert.equal(result.responses,2);assert.equal(manifest.complete,true);assert.equal(manifest.battleObservations,1);
});
test('journal does not mark failed uploads complete and retains local retry inputs',async()=>{
  const j=new journalModule.BattleLogJournal();j.add({tag:'#X',battles:[]});let manifests=0;
  try{await assert.rejects(j.flush({prefix:'x',putFile:async()=>false,putManifest:async()=>manifests++}),/upload_failed/);assert.equal(manifests,0);assert.ok(j.files.length);}finally{rmSync(j.dir,{recursive:true,force:true});}
});
test('bounded feedback increases weak-band selection, preserves exploration and rejects expired plans',()=>{
  const seeds=Object.fromEntries(Array.from({length:1000},(_,i)=>['T'+i,{tr:i%2?9000:9300,lastFetch:now-2*3600000,lastOk:now-2*3600000,lastBattle:now}]));
  const base=schedule.selectSeeds(seeds,{},100,now);
  const plan={version:1,updated:new Date(now-1).toISOString(),expiresAt:new Date(now+3600000).toISOString(),weights:{9000:3,9300:1}};
  const weighted=schedule.selectSeeds(seeds,{},100,now,plan);
  assert.equal(weighted.picked.length,100);assert.equal(new Set(weighted.picked).size,100);assert.ok(weighted.selected[9000]>base.selected[9000]);assert.ok(weighted.selected[9300]>=10);
  assert.deepEqual(schedule.selectSeeds(seeds,{},100,now,{...plan,expiresAt:new Date(now-1).toISOString()}).selected,base.selected);
});
test('log rollover requires a previous success and all valid timestamps, counters do not confuse first visits with zero loss',()=>{
  const t=telemetry.createTelemetry(),logs=Array.from({length:25},(_,i)=>({battleTime:now-1000-i,team:[{tag:'A',cards:Array(8)}],opponent:[{tag:'B',cards:Array(8)}]}));
  telemetry.observeLog(t,'9000',logs,null,now,Number);assert.equal(t.groups[9000].baselineKnown,0);assert.equal(t.groups[9000].possibleRollover,0);
  telemetry.observeLog(t,'9000',logs,now-3600000,now,Number);assert.equal(t.groups[9000].possibleRollover,1);assert.equal(t.groups[9000].newSinceLastSuccess,25);
  telemetry.observeLog(t,'9000',[{battleTime:'invalid'},...logs.slice(1)],now-3600000,now,Number);assert.equal(t.groups[9000].possibleRollover,1);assert.equal(t.groups[9000].invalidTime,1);
});

test('reprocessing reads verified original records and refuses corrupt bytes before yielding',async()=>{
  const dir=mkdtempSync(join(tmpdir(),'journal-read-')),file=join(dir,'part.gz');
  const row={tag:'#X',battles:[{unmapped:99}]},bytes=gzipSync(JSON.stringify(row)+'\n');writeFileSync(file,bytes);
  const manifest={version:1,complete:true,responses:1,battleObservations:1,chunks:[{key:'part',bytes:bytes.length,sha256:createHash('sha256').update(bytes).digest('hex')}]};
  try{const rows=[];for await(const item of reader.readJournal(manifest,()=>file))rows.push(item);assert.deepEqual(rows,[row]);
    bytes[0]^=1;writeFileSync(file,bytes);let yielded=0;
    await assert.rejects(async()=>{for await(const row of reader.readJournal(manifest,()=>file))yielded++;},/checksum_mismatch/);assert.equal(yielded,0);
  }finally{rmSync(dir,{recursive:true,force:true});}
});

test('transient failures retry next hour and removed players back off even with an old success',()=>{
 const stale={lastOk:now-10*86400000,lastBattle:now-10*86400000};
 for(const lastStatus of [0,429,500,503])assert.equal(schedule.revisitMs({...stale,lastStatus},now),3600000);
 assert.equal(schedule.revisitMs({...stale,lastBattle:now,lastStatus:404},now),24*3600000);
});

test('invalid or rolled calendar dates cannot advance processing bookmarks',()=>{
 for(const t of ['20260230T010000.000Z','20261301T010000.000Z','20260923T250000.000Z','20260923T125999.000Z','20260923T120000.000Zgarbage','not-a-date'])assert.equal(collector.parseBattleTimeMs_(t),0);
 assert.equal(collector.parseBattleTimeMs_('20260923T120000.000Z'),now);
 assert.equal(collector.parseBattleTimeMs_('20260923T120000Z'),now);
});

test('fresh discoveries cannot evict the entire verified panel and verified players cannot suppress all discoveries',()=>{
 const seeds={};for(let i=0;i<80;i++)seeds['old'+i]={tr:9000,lastOk:now-1000,lastSeen:now-100000};
 for(let i=0;i<1000;i++)seeds['new'+i]={tr:9000,lastSeen:now,lastFetch:0};
 const keys=Object.keys(schedule.retainSeeds(seeds,100,now));assert.equal(keys.length,100);assert.equal(keys.filter(k=>k.startsWith('old')).length,60);assert.equal(keys.filter(k=>k.startsWith('new')).length,40);
});
test('observed log sizes are retained and overlap monitoring works when the API changes its response length',()=>{
 const t=telemetry.createTelemetry(),log=n=>Array.from({length:n},(_,i)=>({battleTime:now-1000-i}));
 for(const n of [20,30,32,80])telemetry.observeLog(t,'9000',log(n),now-3600000,now,Number,now-7200000);
 assert.deepEqual(t.groups[9000].logSizes,{'20':1,'30':1,'32':1,'80':1});assert.equal(t.groups[9000].noOverlap,4);assert.equal(t.groups[9000].possibleRollover,4);
});
