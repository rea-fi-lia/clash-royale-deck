import test from 'node:test';
import assert from 'node:assert/strict';
import {createRequire} from 'node:module';
const require=createRequire(import.meta.url);
const {articleDigest,checkOfficialSource,auditBalances}=require('./balance-verification.cjs');
const {buildStats}=require('./build-card-stats.js');
const reference=require('../catalogue/balance-checks.json');
const source=require('../catalogue/cards.json');
const known={status:'reviewed',checkedAt:'2026-09-29'};
test('official checks name existing cards and distinguish normal and special forms',()=>{
  for(const c of reference.checks){const card=source.cards.find(x=>x.slug===c.slug);assert.ok(card);assert.ok(card.forms[c.form]);}
  assert.equal(reference.checks.length,28);
});
test('parser keeps level 11 separately from max level rather than guessing scaling',()=>{
 const html='<table id="unit-statistics-table"><tr><th>Level</th><th>Damage</th></tr><tr><td>11</td><td>304</td></tr><tr><td>16</td><td>490</td></tr></table>';
 const r=buildStats(html);assert.equal(r.levels['11'].Damage,'304');assert.equal(r.stats.Damage,'490');assert.equal(r.maxLevel,16);
});
test('successful source fetch with old values is a mismatch, not a current balance',()=>{
 const card={slug:'zappies',attrs:{'Hit Speed':'2.2 sec'},freshness:{status:'current'}};
 const data={cards:[card]};const ref={...reference,checks:reference.checks.filter(c=>c.slug==='zappies')};
 assert.equal(auditBalances(data,known,ref).mismatched,1);assert.equal(card.balanceVerification.status,'mismatch');
 card.attrs['Hit Speed']='2.3 sec';assert.equal(auditBalances(data,known,ref).status,'matched');
});
test('missing level/form never borrows max level or normal form values',()=>{
 const c={slug:'wizard',attrs:{'First Hit Speed':'0.5 sec'},s16:{Damage:304,'Shield Hitpoints':176},levels:{'11':{Damage:'304'}}};
 const ref={...reference,checks:reference.checks.filter(c=>c.slug==='wizard')};const a=auditBalances({cards:[c]},known,ref);
 assert.equal(a.matched,2);assert.equal(a.unverified,2);
});
test('a new official article, changed text or source outage cannot be called reviewed',async()=>{
 const data={props:{pageProps:{title:'Balance',bodyCollection:[{title:'Card',text:{json:{nodeType:'text',value:'Damage: 3'}}}]}}};
 const html=()=>'<script id="__NEXT_DATA__" type="application/json">'+JSON.stringify(data)+'</script>';
 const ref={...reference,articleSha256:articleDigest(html())};
 const news='<a href="'+ref.source+'">Balance</a>';
 const call=body=>checkOfficialSource(async u=>new Response(u.endsWith('/blog/')?news:body),ref);
 assert.equal((await call(html())).status,'reviewed');
 data.props.pageProps.bodyCollection[0].image='new.png';assert.equal((await call(html())).status,'reviewed');
 data.props.pageProps.bodyCollection[0].text.json.value='Damage: 4';assert.equal((await call(html())).status,'review-required');
 assert.equal((await checkOfficialSource(async()=>new Response('<a href="/en/games/clashroyale/blog/release-notes/new-balance/">Balance</a>'),ref)).status,'review-required');
 assert.equal((await checkOfficialSource(async()=>{throw Error('offline')},ref)).status,'unavailable');
});
