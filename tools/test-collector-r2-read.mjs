import test from 'node:test';
import assert from 'node:assert/strict';
import { mkdtempSync, writeFileSync, readFileSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { spawnSync } from 'node:child_process';

const ROOT = new URL('..', import.meta.url);

function fixture(kind, mirror = '0') {
  const dir = mkdtempSync(join(tmpdir(), 'crdb-r2-read-'));
  try {
    const preload = join(dir, 'fixture.cjs'), calls = join(dir, 'calls');
    writeFileSync(calls, '');
    writeFileSync(preload, `
      const fs = require('node:fs');
      const timer = globalThis.setTimeout;
      globalThis.setTimeout = (fn, ms, ...args) => timer(fn, 0, ...args);
      let reads = 0;
      globalThis.fetch = async (url, init = {}) => {
        url = String(url); const method = init.method || 'GET';
        fs.appendFileSync(process.env.CALL_LOG, JSON.stringify({method,url,body:method === 'PUT' ? String(init.body) : undefined})+'\\n');
        if (url.includes('.r2.cloudflarestorage.com/')) {
          if (method === 'GET' && url.endsWith('/private/cardhist.json')) {
            reads++;
            if (process.env.FIXTURE_KIND === 'body' || (process.env.FIXTURE_KIND === 'transient' && reads === 1))
              return {status:200, text:async()=>{throw new TypeError('fixture body terminated');}};
            if (process.env.FIXTURE_KIND === 'json') return new Response('{');
            if (process.env.FIXTURE_KIND === 'http') return new Response('fixture unavailable',{status:503});
            if (process.env.FIXTURE_KIND === 'network') throw new Error('fixture connection closed');
            if (process.env.FIXTURE_KIND === 'missing') return new Response('',{status:404});
            return new Response(JSON.stringify({snaps:[],dinfo:{},fixtureRetained:'keep',clanCrawl:{locs:[],cursor:0,lastFullAt:Date.now()}}));
          }
          return new Response(method === 'GET' ? '' : '{}',{status:method === 'GET' ? 404 : 200});
        }
        if (url.includes('proxy.royaleapi.dev')) {
          if (url.includes('/locations?limit=1')) return new Response('{"items":[]}');
          if (url.includes('/pathoflegend/players')) return new Response('{"items":[{"tag":"#AAA","rank":1}]}');
          if (url.includes('/battlelog')) {
            const catalogue = JSON.parse(fs.readFileSync('catalogue/cards.json','utf8'));
            const cards = catalogue.cards.slice(0,8).map(c=>({id:c.id,name:c.english,level:11}));
            const battleTime = new Date(Date.now()-5000).toISOString().replace(/[-:]/g,'');
            return new Response(JSON.stringify([{type:'pathOfLegend',battleTime,gameMode:{name:'Ranked1v1_NewArena2'},
              team:[{tag:'#AAA',cards,crowns:2,startingTrophies:1500,trophyChange:20}],
              opponent:[{tag:'#BBB',cards,crowns:1,startingTrophies:1500,trophyChange:-20}]}]));
          }
          return new Response('{"items":[]}');
        }
        return new Response('{}',{status:404});
      };
    `);
    const r = spawnSync(process.execPath, ['-r',preload,'tools/collect.js','--collect-only'], {
      cwd:ROOT,encoding:'utf8',timeout:15000,
      env:{...process.env,CR_TOKEN:'fixture',GITHUB_TOKEN:'fixture',GITHUB_REPOSITORY:'fixture/repo',
        R2_ACCOUNT_ID:'fixture',R2_ACCESS_KEY_ID:'fixture',R2_SECRET_ACCESS_KEY:'fixture',R2_BUCKET:'fixture',
        R2_PRIVATE_PREFIX:'private/',PRIVATE_GH_MIRROR:mirror,PUBLIC_GH_MIRROR:'0',TARGET_BRANCH:'data',
        TOP_PLAYERS:'1',SEED_PER_RUN:'0',CLAN_COUNTRIES_PER_RUN:'0',PILOT_TAGS:'',
        CR_DEV_EMAIL:'',CR_DEV_PASSWORD:'',CR_UPSTREAM:'proxy',GITHUB_ACTIONS:'',
        CALL_LOG:calls,FIXTURE_KIND:kind}
    });
    return {...r,calls:readFileSync(calls,'utf8').trim().split('\n').filter(Boolean).map(JSON.parse)};
  } finally { rmSync(dir,{recursive:true,force:true}); }
}

for (const kind of ['body','json','http','network']) {
  test(`unreadable R2 history (${kind}) retries and cannot be replaced by empty history`,()=>{
    const r=fixture(kind);
    assert.equal(r.calls.filter(c=>c.method==='PUT'&&/\/(cardhist|decks|decks-public-v1)\.json/.test(c.url)).length,0,'failed history read must not publish or overwrite history');
    assert.equal(r.status,1,r.stdout+r.stderr);
    assert.equal(r.calls.filter(c=>c.method==='GET'&&c.url.endsWith('/private/cardhist.json')).length,3);
    assert.equal(r.calls.filter(c=>c.url.includes('api.github.com')&&c.url.includes('cardhist.json')).length,0,'disabled GitHub mirror cannot supply authoritative history');
    assert.equal(r.calls.filter(c=>c.url.includes('/battlelog')).length,0,'stop before processing new battles');
  });
}

test('a transient body failure retries the same history and retains its fields',()=>{
  const r=fixture('transient');
  assert.equal(r.calls.filter(c=>c.method==='GET'&&c.url.endsWith('/private/cardhist.json')).length,2,r.stdout+r.stderr);
  const saved=r.calls.find(c=>c.method==='PUT'&&c.url.endsWith('/private/cardhist.json'));
  assert.ok(saved,r.stdout+r.stderr);
  assert.equal(JSON.parse(saved.body).fixtureRetained,'keep');
});

test('a true missing object still permits the existing initialization path',()=>{
  const r=fixture('missing');
  assert.equal(r.calls.filter(c=>c.method==='GET'&&c.url.endsWith('/private/cardhist.json')).length,1);
  assert.ok(r.calls.some(c=>c.method==='PUT'&&c.url.endsWith('/private/cardhist.json')),r.stdout+r.stderr);
});

test('explicitly enabled GitHub mirroring retains its fallback path',()=>{
  const r=fixture('http','1');
  assert.ok(r.calls.some(c=>c.url.includes('api.github.com')&&c.url.includes('cardhist.json')),r.stdout+r.stderr);
});
