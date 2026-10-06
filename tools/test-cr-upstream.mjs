// CR API の入口（tools/cr-upstream.cjs）と、上流停止時の収集の振る舞い（2026-10-03）
import test from 'node:test';
import assert from 'node:assert/strict';
import {mkdtempSync,rmSync,readFileSync,writeFileSync,existsSync} from 'node:fs';
import {tmpdir} from 'node:os';
import {join} from 'node:path';
import {spawnSync} from 'node:child_process';
import upstream from './cr-upstream.cjs';
import collector from './collect.js';

const ROOT=new URL('..',import.meta.url);
const flush=()=>new Promise(r=>setImmediate(r));
const quiet=()=>{};
const jwt=ip=>'h.'+Buffer.from(JSON.stringify({limits:[{tier:'developer/silver',type:'throttling'},{cidrs:[ip+'/32'],type:'client'}]})).toString('base64url')+'.s';
function withEnv(t,vars){
  const old={};for(const k of Object.keys(vars)){old[k]=process.env[k];if(vars[k]==null)delete process.env[k];else process.env[k]=vars[k];}
  t.after(()=>{for(const k of Object.keys(old)){if(old[k]===undefined)delete process.env[k];else process.env[k]=old[k];}});
}
const noCreds={CR_DEV_EMAIL:null,CR_DEV_PASSWORD:null,CR_UPSTREAM:null};
// 開発者ポータルと公式APIの偽物。中継は常に落ちている
function fakeWorld({keys=[],ip='203.0.113.7',proxyStatus=520,officialStatus=200}={}){
  const w={calls:[],revoked:[],created:null,cookieSeen:[]};
  w.fetch=async(url,init={})=>{
    url=String(url);w.calls.push(url);
    if(url.startsWith(upstream.PROXY_BASE))return new Response('error code: '+proxyStatus,{status:proxyStatus});
    if(url.startsWith(upstream.OFFICIAL_BASE)){
      w.officialAuth=init.headers&&init.headers.Authorization;
      return officialStatus===200?new Response('{"items":[{"id":1}]}'):new Response('down',{status:officialStatus});
    }
    if(url.startsWith(upstream.PORTAL_BASE+'/api/')){
      const path=url.slice((upstream.PORTAL_BASE+'/api/').length),body=JSON.parse(init.body||'{}');
      if(path!=='login')w.cookieSeen.push(init.headers&&init.headers.Cookie);
      if(path==='login'){assert.equal(body.email,'dev@example.com');return new Response(JSON.stringify({temporaryAPIToken:jwt(ip),sessionExpiresInSeconds:3600}),{headers:{'set-cookie':'session=abc; Path=/; HttpOnly'}});}
      if(path==='account/load')return new Response(JSON.stringify({developer:{allowedScopes:['royale']}}));
      if(path==='apikey/list')return new Response(JSON.stringify({keys}));
      if(path==='apikey/revoke'){w.revoked.push(body.id);return new Response('{}');}
      if(path==='apikey/create'){w.created=body;return new Response(JSON.stringify({key:{key:'NEWKEY'}}));}
      if(path==='logout')return new Response('{}');
    }
    throw new Error('unexpected '+url);
  };
  return w;
}

test('transient upstream 5xx (Cloudflare 520) is retried instead of failing the run',async(t)=>{
  upstream.reset();withEnv(t,noCreds);
  t.mock.timers.enable({apis:['setTimeout']});let calls=0;
  t.mock.method(globalThis,'fetch',async()=>++calls===1 ? new Response('origin error',{status:520}) : new Response('{"items":[]}'));
  const pending=collector.crGet('/fixture','fixture');await Promise.resolve();
  t.mock.timers.tick(1200);assert.deepEqual(await pending,{items:[]});assert.equal(calls,2);
});

test('non-retryable statuses still fail immediately with the upstream body',async(t)=>{
  upstream.reset();withEnv(t,noCreds);
  let calls=0;t.mock.method(globalThis,'fetch',async()=>{calls++;return new Response('not found',{status:404});});
  await assert.rejects(collector.crGet('/fixture','fixture'),e=>/CR API 404 for \/fixture :: not found/.test(e.message)&&!upstream.isUpstreamDown(e));
  assert.equal(calls,1);
});

test('Supercell maintenance stops at once as an upstream outage without retrying',async(t)=>{
  upstream.reset();withEnv(t,noCreds);
  let calls=0;t.mock.method(globalThis,'fetch',async()=>{calls++;return new Response('{"reason":"inMaintenance","message":"API is currently in maintenance"}',{status:503});});
  await assert.rejects(collector.crGet('/fixture','fixture'),e=>upstream.isUpstreamDown(e)&&e.reason==='maintenance');
  assert.equal(calls,1);
});

test('5xx that outlasts the retries is reported as an upstream outage, not a code failure',async(t)=>{
  upstream.reset();withEnv(t,noCreds);
  const w=fakeWorld();
  await assert.rejects(upstream.getJson('/cards','T',{fetchImpl:w.fetch,waits:[0,0],log:quiet}),e=>upstream.isUpstreamDown(e)&&e.reason==='proxy'&&/CR API 520 for \/cards/.test(e.message));
  assert.equal(w.calls.length,3);
});

test('a healthy proxy passes the preflight after a few cheap requests',async(t)=>{
  upstream.reset();withEnv(t,noCreds);
  const calls=[];const fetchImpl=async url=>{calls.push(String(url));return new Response('{"items":[]}');};
  assert.equal(await upstream.preflight('T',{fetchImpl,gapMs:0,recheckMs:0,log:quiet}),'proxy');
  assert.equal(calls.length,3);assert.ok(calls.every(u=>u.startsWith(upstream.PROXY_BASE+'/locations')));
});

test('a dead proxy without credentials stops the run in seconds as UPSTREAM_DOWN',async(t)=>{
  upstream.reset();withEnv(t,noCreds);
  const w=fakeWorld({proxyStatus:525});
  await assert.rejects(upstream.preflight('T',{fetchImpl:w.fetch,gapMs:0,recheckMs:0,log:quiet}),e=>upstream.isUpstreamDown(e)&&e.reason==='proxy');
  assert.equal(w.calls.length,8,'3/6 can no longer pass after four failures, and it re-measures once before giving up');
  assert.ok(!w.calls.some(u=>u.startsWith(upstream.PORTAL_BASE)),'never logs in without credentials');
});

test('a wrong token is a configuration error, not an upstream outage',async(t)=>{
  upstream.reset();withEnv(t,noCreds);
  const fetchImpl=async()=>new Response('{"reason":"accessDenied.invalidIp"}',{status:403});
  await assert.rejects(upstream.preflight('T',{fetchImpl,gapMs:0,recheckMs:0,log:quiet}),e=>!upstream.isUpstreamDown(e)&&/403/.test(e.message));
});

test('with credentials a dead proxy fails over to a per-IP official key and the owner keys are left alone',async(t)=>{
  upstream.reset();withEnv(t,{CR_DEV_EMAIL:'dev@example.com',CR_DEV_PASSWORD:'pw-secret',CR_UPSTREAM:null});
  const w=fakeWorld({keys:[
    {id:'owner-1',name:'my laptop',cidrRanges:['1.2.3.4'],key:'OWNERKEY'},
    {id:'auto-old',name:'crdb-actions-20261002T23',cidrRanges:['198.51.100.9/32'],key:'OLDKEY'}]});
  assert.equal(await upstream.preflight('T',{fetchImpl:w.fetch,gapMs:0,recheckMs:0,log:quiet}),'official');
  assert.deepEqual(w.revoked,['auto-old'],'only the previous automation key is revoked');
  assert.deepEqual(w.created.cidrRanges,['203.0.113.7'],'the key is bound to the IP the portal saw');
  assert.deepEqual(w.created.scopes,['royale'],'scopes come from the account profile like the portal UI');
  assert.match(w.created.name,/^crdb-actions-/);
  assert.ok(w.cookieSeen.length&&w.cookieSeen.every(c=>c==='session=abc'),'portal calls after login carry the session cookie');
  assert.deepEqual(await upstream.getJson('/cards','T',{fetchImpl:w.fetch,log:quiet}),{items:[{id:1}]});
  assert.equal(w.officialAuth,'Bearer NEWKEY');
  assert.equal(upstream.endpoint('T').base,upstream.OFFICIAL_BASE);
  const s=JSON.stringify(upstream.summary())+JSON.stringify(upstream.provenance());
  assert.ok(!/NEWKEY|OWNERKEY|OLDKEY|pw-secret/.test(s),'keys and password never reach logs or provenance');
});

test('an automation key that already fits this IP is reused without creating or revoking',async(t)=>{
  upstream.reset();withEnv(t,{CR_DEV_EMAIL:'dev@example.com',CR_DEV_PASSWORD:'pw',CR_UPSTREAM:null});
  const w=fakeWorld({keys:[{id:'auto-now',name:'crdb-actions-20261003T05',cidrRanges:['203.0.113.7/32'],key:'SAMEIPKEY'}]});
  assert.equal(await upstream.preflight('T',{fetchImpl:w.fetch,gapMs:0,recheckMs:0,log:quiet}),'official');
  assert.equal(w.created,null);assert.deepEqual(w.revoked,[]);
  await upstream.getJson('/cards','T',{fetchImpl:w.fetch,log:quiet});assert.equal(w.officialAuth,'Bearer SAMEIPKEY');
});

test('full key slots are reported instead of revoking keys the owner made',async(t)=>{
  upstream.reset();withEnv(t,{CR_DEV_EMAIL:'dev@example.com',CR_DEV_PASSWORD:'pw',CR_UPSTREAM:null});
  const keys=Array.from({length:10},(_,i)=>({id:'owner-'+i,name:'owner key '+i,cidrRanges:['1.2.3.'+i],key:'K'+i}));
  const w=fakeWorld({keys});
  await assert.rejects(upstream.preflight('T',{fetchImpl:w.fetch,gapMs:0,recheckMs:0,log:quiet}),e=>upstream.isUpstreamDown(e)&&/鍵の枠/.test(e.detail.failover.error));
  assert.deepEqual(w.revoked,[]);assert.equal(w.created,null);
});

test('the breaker ignores one bad chunk but trips on a sustained outage and then fails fast',async(t)=>{
  let clock=0;upstream.reset({now:()=>clock});withEnv(t,noCreds);
  for(let i=0;i<40;i++)upstream.note(520);          // one chunk of 40 fails at once
  for(let i=0;i<40;i++){clock+=1000;upstream.note(200);}
  assert.equal(upstream.tripped(),false,'a brief burst does not stop the run');
  for(let i=0;i<70;i++){clock+=1000;upstream.note(i%5?525:200);}  // 80% failing for 70 seconds
  assert.equal(upstream.tripped(),true);
  let calls=0;const fetchImpl=async()=>{calls++;return new Response('{}');};
  await assert.rejects(upstream.getJson('/x','T',{fetchImpl,log:quiet}),e=>upstream.isUpstreamDown(e));
  assert.equal(calls,0,'no more requests to a dead upstream');
});

test('report leaves the summary the workflow reads, in words a human can act on',async(t)=>{
  upstream.reset();withEnv(t,noCreds);
  const dir=mkdtempSync(join(tmpdir(),'upstream-report-'));t.after(()=>rmSync(dir,{recursive:true,force:true}));
  const file=join(dir,'s.json'),lines=[];
  const detail=upstream.report(new upstream.UpstreamDown('proxy','CR API 525 for /x',{}),{log:l=>lines.push(l),file});
  const saved=JSON.parse(readFileSync(file,'utf8'));
  assert.equal(saved.down,true);assert.equal(saved.reason,'proxy');assert.equal(saved.detail,detail);
  assert.match(detail,/中継.*こちらのコードの故障ではありません/);assert.match(detail,/CR_DEV_EMAIL/);
  assert.ok(lines.some(l=>l.startsWith('UPSTREAM_DOWN reason=proxy')));
  assert.ok(lines.some(l=>l.startsWith('::error title=上流が停止中::')));
});

test('auto-repair recognises upstream outages and still repairs real failures',()=>{
  const yml=readFileSync(new URL('.github/workflows/auto-repair.yml',ROOT),'utf8');
  const m=yml.match(/grep -q -E '([^']+)' \/tmp\/failed\.log/);assert.ok(m,'the upstream gate exists');
  const re=new RegExp(m[1]);
  for(const line of ['UPSTREAM_DOWN reason=proxy CR API 525 for /locations','❌ collect failed: Error: CR API 520 for /locations/global/pathoflegend/players?limit=1000 :: {','Error: Official cards HTTP 502'])assert.ok(re.test(line),line);
  for(const line of ['❌ collect failed: Error: 集計0件 unmapped={"Ronin":1}','FATAL ERROR: Reached heap limit Allocation failed','clan-crawl rankings error loc=57000001 CR API 520 for /locations/57000001/rankings/clans','❌ collect failed: Error: R2 write cardhist.json 500'])assert.ok(!re.test(line),line);
});

test('the real collector exits 75 with UPSTREAM_DOWN in seconds when the proxy is dead',()=>{
  const dir=mkdtempSync(join(tmpdir(),'collector-down-'));
  try {
    const preload=join(dir,'dead-proxy.cjs'),file=join(dir,'status.json');
    writeFileSync(preload,"const st=globalThis.setTimeout;globalThis.setTimeout=(f,ms,...a)=>st(f,0,...a);globalThis.fetch=async url=>{if(String(url).startsWith('https://proxy.royaleapi.dev/'))return new Response('error code: 525',{status:525});throw new Error('no other network in this test: '+url);};\n");
    const env={...process.env,CR_TOKEN:'T',GITHUB_TOKEN:'G',GITHUB_REPOSITORY:'owner/repo',UPSTREAM_STATUS_FILE:file,
      R2_ACCOUNT_ID:'',R2_ACCESS_KEY_ID:'',R2_SECRET_ACCESS_KEY:'',CR_DEV_EMAIL:'',CR_DEV_PASSWORD:'',CR_UPSTREAM:'',GITHUB_ACTIONS:''};
    const started=Date.now();
    const r=spawnSync(process.execPath,['-r',preload,'tools/collect.js','--collect-only'],{cwd:ROOT,env,encoding:'utf8',timeout:60000});
    assert.equal(r.status,75,r.stdout+r.stderr);
    assert.ok(Date.now()-started<20000,'leaves quickly instead of grinding until the 45 minute timeout');
    assert.match(r.stdout,/UPSTREAM_DOWN reason=proxy/);assert.doesNotMatch(r.stderr,/❌ collect failed/);
    assert.ok(existsSync(file));assert.equal(JSON.parse(readFileSync(file,'utf8')).reason,'proxy');
  } finally {rmSync(dir,{recursive:true,force:true});}
});

test('the catalogue refresh exits 75 on an upstream outage and writes nothing',()=>{
  const dir=mkdtempSync(join(tmpdir(),'catalogue-down-'));
  try {
    const preload=join(dir,'dead-proxy.cjs');
    writeFileSync(preload,"const st=globalThis.setTimeout;globalThis.setTimeout=(f,ms,...a)=>st(f,0,...a);globalThis.fetch=async url=>new Response('<html>500 Internal Server Error</html>',{status:500});\n");
    const before=spawnSync('git',['status','--porcelain','--','catalogue','js/cards-data.js'],{cwd:ROOT,encoding:'utf8'}).stdout;
    const r=spawnSync(process.execPath,['-r',preload,'tools/update-card-catalogue.js','--refresh'],{cwd:ROOT,encoding:'utf8',timeout:60000,
      env:{...process.env,CR_TOKEN:'T',CR_DEV_EMAIL:'',CR_DEV_PASSWORD:'',UPSTREAM_STATUS_FILE:''}});
    assert.equal(r.status,75,r.stdout+r.stderr);assert.match(r.stdout,/UPSTREAM_DOWN reason=proxy/);
    assert.equal(spawnSync('git',['status','--porcelain','--','catalogue','js/cards-data.js'],{cwd:ROOT,encoding:'utf8'}).stdout,before);
  } finally {rmSync(dir,{recursive:true,force:true});}
});

test('notify never announces recovery for a cancelled run and thins out alerts only when asked',()=>{
  const yml=readFileSync(new URL('.github/actions/notify/action.yml',ROOT),'utf8');
  const script=yml.split('\n      run: |\n')[1].split('\n').map(l=>l.replace(/^ {8}/,'')).join('\n');
  assert.ok(script.includes('tools/notify.js')&&!script.includes('${{'),'the shell body was extracted');
  const dir=mkdtempSync(join(tmpdir(),'notify-'));
  try {
    const log=join(dir,'calls');
    writeFileSync(join(dir,'node'),'#!/bin/sh\ncase "$1" in\n  tools/failure-streak.js) echo "$STUB_FAILS";;\n  tools/notify.js) echo "$2 $3" >> "$CALL_LOG";;\nesac\n',{mode:0o755});
    writeFileSync(join(dir,'gh'),'#!/bin/sh\nexit 0\n',{mode:0o755});
    const run=(st,fails,streak='2',repeat='1')=>{
      writeFileSync(log,'');
      const r=spawnSync('bash',['-c',script],{encoding:'utf8',env:{PATH:dir+':'+process.env.PATH,CALL_LOG:log,STUB_FAILS:String(fails),
        ST:st,WF:'collect.yml',LABEL:'データ収集',STREAK:streak,DETAIL:'d',REPEAT:repeat,GH_TOKEN:'',DISCORD_WEBHOOK_URL:'',SLACK_WEBHOOK_URL:'',
        LINE_PUSH_TOKEN:'',LINE_PUSH_TO:'',GITHUB_SERVER_URL:'https://github.com',GITHUB_REPOSITORY:'o/r',GITHUB_RUN_ID:'1'}});
      assert.equal(r.status,0,r.stdout+r.stderr);
      return readFileSync(log,'utf8').trim();
    };
    assert.equal(run('cancelled',2),'','a run cut off by the timeout is not a recovery');
    assert.equal(run('skipped',2),'');
    assert.match(run('success',2),/--level ok/);
    assert.equal(run('success',0),'','no recovery message when nothing was broken');
    assert.equal(run('failure',0),'','the first failure waits for the streak');
    assert.match(run('failure',1,'2','6'),/--level error/,'the threshold always rings');
    assert.equal(run('failure',2,'2','6'),'','an ongoing upstream outage is thinned out');
    assert.match(run('failure',7,'2','6'),/--level error/,'and rings again six runs later');
    assert.match(run('failure',2,'2','1'),/--level error/,'other failures still ring every time');
  } finally {rmSync(dir,{recursive:true,force:true});}
});

test('with somewhere to switch to, a half-broken proxy is abandoned after a minute',async(t)=>{
  let clock=0;upstream.reset({now:()=>clock});withEnv(t,{CR_DEV_EMAIL:'dev@example.com',CR_DEV_PASSWORD:'pw',CR_UPSTREAM:null});
  for(let i=0;i<70;i++){clock+=1000;upstream.note(i%3===0?520:200);}   // a third failing for 70 seconds
  assert.equal(upstream.tripped(),true,'moves to the official API instead of grinding through retries');
});

test('without somewhere to switch to, the same half-broken proxy does not stop the run',async(t)=>{
  let clock=0;upstream.reset({now:()=>clock});withEnv(t,noCreds);
  for(let i=0;i<70;i++){clock+=1000;upstream.note(i%3===0?520:200);}
  assert.equal(upstream.tripped(),false,'a third failing is only retried, because stopping would lose the hour');
});

test('a successful production run clears the auto-fix branches it left, but keeps ones waiting on a PR',()=>{
  const dir=mkdtempSync(join(tmpdir(),'cleanup-'));
  try {
    const log=join(dir,'deleted');
    writeFileSync(join(dir,'git'),'#!/bin/sh\nif [ "$1" = "ls-remote" ]; then printf \'a\\trefs/heads/main\\nb\\trefs/heads/auto-fix/collect-111\\nc\\trefs/heads/auto-fix/collect-222\\nd\\trefs/heads/auto-fix/check-card-images-333\\ne\\trefs/heads/xauto-fix/collect-444\\n\'; elif [ "$1" = "push" ]; then echo "$4" >> "$DEL_LOG"; fi\n',{mode:0o755});
    const run=gh=>{
      writeFileSync(log,'');writeFileSync(join(dir,'gh'),gh,{mode:0o755});
      const r=spawnSync('bash',['tools/auto-fix-cleanup.sh','collect.yml'],{cwd:ROOT,encoding:'utf8',env:{...process.env,PATH:dir+':'+process.env.PATH,DEL_LOG:log}});
      assert.equal(r.status,0,r.stdout+r.stderr);return {deleted:readFileSync(log,'utf8'),out:r.stdout};
    };
    const a=run('#!/bin/sh\ncase "$*" in *"--head auto-fix/collect-222"*) echo 1;; *) echo 0;; esac\n');
    assert.equal(a.deleted,'auto-fix/collect-111\n','only the finished attempt for this workflow is removed');
    assert.match(a.out,/残す.*auto-fix\/collect-222/);
    const b=run('#!/bin/sh\nexit 1\n');
    assert.equal(b.deleted,'','when the PR state cannot be read, nothing is deleted');
  } finally {rmSync(dir,{recursive:true,force:true});}
});

test('the failure fingerprint ignores times and run numbers but not the actual error',async()=>{
  const {signature}=(await import('./failure-signature.js')).default;
  const a='check\tRun check\t2026-09-10T09:38:01.1234567Z   ✗ アイスウィザード: 英雄 が公式にあるのに手元の定義に無い → 追加する\ncheck\tRun check\t2026-09-10T09:38:02Z ##[error]Process completed with exit code 1.\n';
  const b=a.replace(/2026-09-10T09:38:0\d(\.\d+)?Z/g,'2026-09-17T09:56:41.7654321Z');
  assert.match(signature(a),/^[0-9a-f]{16}$/);assert.equal(signature(b),signature(a));
  assert.equal(signature('x\ty\t2026-10-03T00:16:00Z ❌ collect failed: Error: run 37081322592 took 12.5s'),signature('x\ty\t2026-10-03T01:16:00Z ❌ collect failed: Error: run 37085424663 took 9s'));
  assert.notEqual(signature(a.replace('アイスウィザード','エリートバーバリアン')),signature(a));
  assert.equal(signature('ok\nall good\n##[error]Process completed with exit code 1.'),'','no error line, no fingerprint');
});

test('the auto-repair gate skips upstream outages and repeats of a failure the AI already could not fix',()=>{
  const lines=readFileSync(new URL('.github/workflows/auto-repair.yml',ROOT),'utf8').split('\n');
  const at=lines.findIndex(l=>l.includes('- name: 対象と、直すべき状況かを判定'));
  const runAt=lines.findIndex((l,i)=>i>at&&l.trim()==='run: |');
  const body=[];for(let i=runAt+1;i<lines.length;i++){if(lines[i].trim()&&!lines[i].startsWith('          '))break;body.push(lines[i].slice(10));}
  const script=body.join('\n');assert.match(script,/failure-signature\.js/);
  const dir=mkdtempSync(join(tmpdir(),'gate-'));
  try {
    writeFileSync(join(dir,'gh'),'#!/bin/sh\ncase "$1 $2" in\n  "run view") cat "$STUB_LOG";;\n  "run list") echo \'[{"conclusion":"failure","databaseId":5,"createdAt":"x"}]\';;\n  "pr list") echo 0;;\n  api*) echo "$STUB_HITS";;\nesac\n',{mode:0o755});
    writeFileSync(join(dir,'git'),'#!/bin/sh\nexit 0\n',{mode:0o755});
    const gate=(log,{hits='0',conclusion='failure',name='check card images'}={})=>{
      const logFile=join(dir,'log'),out=join(dir,'out');writeFileSync(logFile,log);writeFileSync(out,'');
      const r=spawnSync('bash',['-c',script],{cwd:ROOT,encoding:'utf8',env:{...process.env,PATH:dir+':'+process.env.PATH,STUB_LOG:logFile,STUB_HITS:hits,
        EV:'workflow_run',WF_NAME:name,WF_CONCLUSION:conclusion,WF_RUN_ID:'777',WF_BRANCH:'main',IN_WF:'',IN_LABEL:'',GH_TOKEN:'x',GITHUB_OUTPUT:out,GITHUB_REPOSITORY:'o/r'}});
      assert.equal(r.status,0,r.stdout+r.stderr);return {out:readFileSync(out,'utf8'),log:r.stdout};
    };
    const sept='check\tRun check\t2026-09-10T09:38:01.1234567Z   ✗ アイスウィザード: 英雄 が公式にあるのに手元の定義に無い → 追加する\n';
    const first=gate(sept);
    assert.match(first.out,/go=true/,'a new failure still gets one AI attempt');
    assert.match(first.out,/tried_key=auto-repair-tried-check-card-images-[0-9a-f]{16}\n/);
    const again=gate(sept,{hits:'1'});
    assert.match(again.out,/go=false/);assert.match(again.log,/AIが既に試して直せなかった/);
    const down=gate('collect\tRun collector\t2026-10-03T06:16:01Z UPSTREAM_DOWN reason=proxy CR API 525 for /locations\n',{name:'collect decks'});
    assert.match(down.out,/go=false/);assert.match(down.log,/上流の停止/);
    const healed=gate('',{conclusion:'success'});
    assert.match(healed.out,/go=false/);assert.match(healed.log,/片付ける自動修理ブランチなし/);
  } finally {rmSync(dir,{recursive:true,force:true});}
});

test('an empty season-reset ranking still keeps the hourly record of registered tags',()=>{
  const dir=mkdtempSync(join(tmpdir(),'season-reset-'));
  try {
    const preload=join(dir,'reset.cjs'),calls=join(dir,'calls');writeFileSync(calls,'');
    writeFileSync(preload,`const fs=require('fs');globalThis.fetch=async(url,init={})=>{url=String(url);fs.appendFileSync(process.env.CALL_LOG,(init.method||'GET')+' '+url+'\\n');
      if(url.startsWith('https://proxy.royaleapi.dev/v1/locations?'))return new Response('{"items":[]}');
      if(url.startsWith('https://proxy.royaleapi.dev/v1/locations/global/pathoflegend/players'))return new Response('{"items":[],"paging":{"cursors":{}}}');
      if(url.startsWith('https://proxy.royaleapi.dev/v1/players/'))return new Response('[]');
      if(url.includes('.r2.cloudflarestorage.com/'))return (init.method||'GET')==='GET'?new Response('',{status:404}):new Response('',{status:200});
      return new Response('{}',{status:404});};\n`);
    const r=spawnSync(process.execPath,['-r',preload,'tools/collect.js','--collect-only'],{cwd:ROOT,encoding:'utf8',timeout:60000,env:{...process.env,
      CR_TOKEN:'T',GITHUB_TOKEN:'G',GITHUB_REPOSITORY:'owner/repo',R2_ACCOUNT_ID:'acct',R2_ACCESS_KEY_ID:'k',R2_SECRET_ACCESS_KEY:'s',R2_BUCKET:'b',
      PILOT_TAGS:'PILOTTAG',CALL_LOG:calls,UPSTREAM_STATUS_FILE:'',CR_DEV_EMAIL:'',CR_DEV_PASSWORD:'',CR_UPSTREAM:'',GITHUB_ACTIONS:''}});
    assert.equal(r.status,0,r.stdout+r.stderr);
    assert.match(r.stdout,/pol ranking empty; skipped without failing/);
    assert.match(r.stdout,/pilot 対象1件/,'the registered tag is still collected during the reset');
    assert.match(readFileSync(calls,'utf8'),/GET https:\/\/proxy\.royaleapi\.dev\/v1\/players\/%23PILOTTAG\/battlelog/);
  } finally {rmSync(dir,{recursive:true,force:true});}
});
