import test from 'node:test';
import assert from 'node:assert/strict';
import { mkdtempSync, writeFileSync, readFileSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { spawnSync } from 'node:child_process';

const ROOT = new URL('..', import.meta.url);

function collectionFixture(kind, status = 520) {
  const dir = mkdtempSync(join(tmpdir(), 'collect-recovery-'));
  try {
    const preload = join(dir, 'fixture.cjs'), calls = join(dir, 'calls'), report = join(dir, 'upstream.json');
    writeFileSync(calls, '');
    writeFileSync(preload, `
      const fs = require('node:fs');
      const st = globalThis.setTimeout;
      globalThis.setTimeout = (f, ms, ...args) => st(f, 0, ...args);
      globalThis.fetch = async (url, init = {}) => {
        url = String(url); const method = init.method || 'GET';
        fs.appendFileSync(process.env.CALL_LOG, method + ' ' + url + '\\n');
        const kind = process.env.FIXTURE_KIND;
        const fail = () => new Response('fixture upstream error', { status: Number(process.env.FIXTURE_STATUS) });
        if (url.includes('proxy.royaleapi.dev')) {
          const path = new URL(url).pathname;
          if (url.includes('/locations?limit=1')) return new Response('{"items":[]}');
          if (path.endsWith('/pathoflegend/players')) {
            if (url.includes('&after=')) return fail();
            return new Response(JSON.stringify({ items: kind === 'pilot' ? [] : [{tag:'#AAA',rank:1}], paging: { cursors: kind === 'page2' ? {after:'next'} : {} } }));
          }
          if (path.endsWith('/locations')) return fail();
          if (path.includes('/rankings/clans')) return kind === 'ranking' ? fail() : new Response('{"items":[{"tag":"#CLAN"}]}');
          if (path.endsWith('/members')) return fail();
          if (path.endsWith('/battlelog')) return kind === 'pilot' ? fail() : new Response('[]');
          throw Error('unexpected fixture API path ' + path);
        }
        if (url.includes('.r2.cloudflarestorage.com/')) {
          if (method === 'GET' && url.includes('/private/cardhist.json')) return new Response(JSON.stringify({snaps:[],dinfo:{},oppSeeds:{},clanCrawl:{locs:kind === 'locations' ? null : [1,2],cursor:0,lastFullAt:0}}));
          return method === 'GET' ? new Response('',{status:404}) : new Response('',{status:200});
        }
        return new Response('{}',{status:404});
      };
    `);
    const result = spawnSync(process.execPath, ['-r', preload, 'tools/collect.js', '--collect-only'], {
      cwd: ROOT, encoding: 'utf8', timeout: 15000,
      env: { ...process.env, CR_TOKEN:'fixture', GITHUB_TOKEN:'fixture', GITHUB_REPOSITORY:'fixture/repo',
        R2_ACCOUNT_ID:'fixture', R2_ACCESS_KEY_ID:'fixture', R2_SECRET_ACCESS_KEY:'fixture', R2_BUCKET:'fixture',
        R2_PRIVATE_PREFIX:'private/', PRIVATE_GH_MIRROR:'0', PUBLIC_GH_MIRROR:'0', TARGET_BRANCH:'data', TOP_PLAYERS:'1',
        CLAN_COUNTRIES_PER_RUN:'2', CLAN_PICKS_PER_COUNTRY:'1', SEED_PER_RUN:'0',
        PILOT_TAGS: kind === 'pilot' ? 'PILOT' : '', CR_DEV_EMAIL:'', CR_DEV_PASSWORD:'', CR_UPSTREAM:'',
        GITHUB_ACTIONS:'', UPSTREAM_STATUS_FILE:report, CALL_LOG:calls, FIXTURE_KIND:kind, FIXTURE_STATUS:String(status) }
    });
    return { ...result, calls:readFileSync(calls,'utf8'), report:result.status === 75 ? JSON.parse(readFileSync(report,'utf8')) : null };
  } finally { rmSync(dir,{recursive:true,force:true}); }
}

for (const kind of ['locations','ranking','members','page2','pilot']) {
  test(`persistent upstream failure escapes ${kind} fallback and stops the run`, () => {
    const r = collectionFixture(kind);
    assert.equal(r.status,75,r.stdout+r.stderr);
    assert.equal(r.report.reason,'proxy');
    assert.match(r.stdout,/UPSTREAM_DOWN/);
    if (kind === 'pilot') {
      assert.doesNotMatch(r.calls,/PUT .*\/me\/PILOT\.json/,'failed personal data is not saved as fresh');
    } else {
      assert.doesNotMatch(r.calls,/PUT .*\/(?:decks(?:-public-v1)?\.json|cardhist\.json|collect-freshness\.json)/);
    }
    if (kind === 'ranking' || kind === 'members') assert.doesNotMatch(r.calls,/\/locations\/2\//,'no next country after a confirmed outage');
  });
}

test('an individual missing clan ranking still skips that country instead of declaring an upstream outage', () => {
  const r = collectionFixture('ranking',404);
  assert.notEqual(r.status,75,r.stdout+r.stderr);
  assert.match(r.calls,/\/locations\/2\/rankings\/clans/);
  assert.match(r.calls,/\/players\/%23AAA\/battlelog/);
});

function boundedFixture(status) {
  const dir = mkdtempSync(join(tmpdir(),'bounded-collection-'));
  try {
    const output=join(dir,'output'), args=join(dir,'args');
    writeFileSync(output,'');
    writeFileSync(join(dir,'timeout'),'#!/bin/sh\nprintf "%s\\n" "$@" > "$ARG_LOG"\nexit "$FIXTURE_EXIT"\n',{mode:0o755});
    const r=spawnSync('bash',['tools/run-collector-bounded.sh'],{cwd:ROOT,encoding:'utf8',env:{...process.env,PATH:dir+':'+process.env.PATH,GITHUB_OUTPUT:output,ARG_LOG:args,FIXTURE_EXIT:String(status)}});
    return {...r,output:readFileSync(output,'utf8'),args:readFileSync(args,'utf8')};
  } finally {rmSync(dir,{recursive:true,force:true});}
}

test('the process deadline leaves notification time and marks timeout as failure',()=>{
  const r=boundedFixture(124);
  assert.equal(r.status,124);
  assert.equal(r.output,'timed_out=true\n');
  assert.match(r.stdout,/COLLECTOR_TIMEOUT/);
  assert.equal(r.args,'--signal=TERM\n--kill-after=30s\n42m\nbash\ntools/run-collector.sh\n');
  const workflow=readFileSync(new URL('.github/workflows/collect.yml',ROOT),'utf8');
  assert.match(workflow,/timeout-minutes: 45/);
  assert.match(workflow,/run: bash tools\/run-collector-bounded.sh/);
  assert.match(workflow,/streak:.*timed_out == 'true' && '1' \|\| '2'/);
});

test('the deadline wrapper preserves ordinary success, upstream failure and signal exits',()=>{
  for(const code of [0,1,75,137,143]) {
    const r=boundedFixture(code);assert.equal(r.status,code);assert.equal(r.output,'');assert.doesNotMatch(r.stdout,/COLLECTOR_TIMEOUT/);
  }
});

test('the Ubuntu GNU timeout exits 124 and ends its process group on a real deadline', {skip:process.platform!=='linux'},()=>{
  const started=Date.now();
  const r=spawnSync('timeout',['--signal=TERM','--kill-after=1s','0.1s',process.execPath,'-e','setInterval(()=>{},1000)'],{timeout:5000});
  assert.equal(r.status,124);assert.ok(Date.now()-started<3000);
});
