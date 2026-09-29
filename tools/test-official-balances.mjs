import test from 'node:test';
import assert from 'node:assert/strict';
import {createRequire} from 'node:module';
const require=createRequire(import.meta.url);
const {parseArticle,loadOfficialBalances,applyOfficialBalances,mergeChecks}=require('./official-balances.cjs');
const helpers=require('./build-card-stats.js');
const fixture=require('./fixtures/official-balance-september-2026.json');
const reference=require('../catalogue/balance-checks.json');
const html=f=>'<script id="__NEXT_DATA__" type="application/json">'+JSON.stringify(f)+'</script>';
const parsed=()=>parseArticle(html(fixture),reference.source,new Date('2026-09-29'));
const ledger=()=>({...parsed(),checkedAt:'2026-09-29T00:00:00Z',status:'reviewed'});
const card=(slug,values,attrs={})=>({slug,attrs,levels:{11:{...values},16:{...values}},s16:{...values},stats:{...values},formStats:{e:{},h:{}},tags:[]});
test('real official announcement parses all 27 distinct fields (28 facts with shared air/ground damage)',()=>{
 const p=parsed();assert.equal(p.pending.length,0);assert.equal(p.checks.length,27);
 for(const c of reference.checks) assert.ok(p.checks.some(x=>x.slug===c.slug&&x.form===c.form&&x.key===c.key&&x.expected===c.expected&&x.effectiveAt===c.effectiveAt));
 assert.equal(p.checks.find(c=>c.slug==='wizard'&&c.key==='Damage').effectiveAt,'2026-09-08');
});
test('future effective changes and WIP cannot overwrite current values',()=>{
 const p=parseArticle(html(fixture),reference.source,new Date('2026-09-10'));assert.equal(p.scheduled.length,4);assert.equal(p.checks.length,23);
 const f=structuredClone(fixture);f.props.pageProps.title='Work-in-progress Balance Changes';assert.equal(parseArticle(html(f),'x').ignored,true);
});
test('unknown mechanics and absent level declarations stay pending',()=>{
 const f=structuredClone(fixture);f.props.pageProps.bodyCollection[1].featureText.json.content[0].content[0].value='New Mechanic';
 assert.ok(parseArticle(html(f),'x').pending.length);
 f.props.pageProps.bodyCollection.pop();const p=parseArticle(html(f),'x');assert.ok(p.pending.some(x=>x.reason==='Stat level/unit not explicit'));assert.ok(p.checks.every(c=>!c.level));
});
test('a new dated official article updates automatically without editing a patch file',async()=>{
 const f=structuredClone(fixture);f.props.pageProps.publishDate='2026-10-08T00:00:00Z';f.props.pageProps.title='October Balance Changes';
 f.props.pageProps.bodyCollection=JSON.parse(JSON.stringify(f.props.pageProps.bodyCollection).replaceAll('September','October').replace('281 → 304','304 → 320'));
 const url='https://supercell.com/en/games/clashroyale/blog/release-notes/october-balance/';
 const l=await loadOfficialBalances(ledger(),async u=>new Response(u.endsWith('/blog/')?`<a href="${url}">Balance</a>`:html(f)),new Date('2026-10-20'));
 assert.equal(l.status,'reviewed');assert.equal(l.checks.find(c=>c.slug==='wizard'&&c.key==='Damage').expected,320);
});
test('network failure retains known official corrections and reports unavailable',async()=>{
 const old=ledger();old.checks=mergeChecks(old.checks,[{slug:'wizard',form:'n',key:'Damage',level:11,expected:320,effectiveAt:'2026-10-08'}]);
 const l=await loadOfficialBalances(old,async()=>{throw Error('offline')});assert.equal(l.status,'unavailable');assert.equal(l.checks.find(c=>c.slug==='wizard'&&c.key==='Damage').expected,320);
});
test('shared Fire Spirit damage follows through to Furnace',async()=>{
 const l=await loadOfficialBalances(ledger(),async()=>{throw Error('offline')});
 const c=card('furnace',{'Fire Spirit Area Damage':'207'});applyOfficialBalances({cards:[c]},l,helpers);
 assert.equal(c.combat.stats['Fire Spirit Area Damage'],215);
});
test('a summoned unit HP change does not erase the parent building HP',()=>{
 const c=card('goblin-cage',{Hitpoints:'742','Goblin Brawler Hitpoints':'1080'});c.hp16=742;
 applyOfficialBalances({cards:[c]},ledger(),helpers);assert.equal(c.hp16,742);assert.equal(c.combat.stats['Goblin Brawler Hitpoints'],1121);
});
test('multi-projectile damage is never silently turned into a single-hit value',()=>{
 const c=card('hunter',{Damage:'84 x10 (840)','Damage per second':'380'},{'Hit Speed':'2.2 sec'});
 const l={checkedAt:'2026-10-20',status:'reviewed',pending:[],checks:[{slug:'hunter',form:'n',key:'Damage',level:11,expected:90,effectiveAt:'2026-10-08'}]};
 applyOfficialBalances({cards:[c]},l,helpers);assert.equal(l.status,'review-required');assert.equal(c.combat.stats.Damage.total,840);
});
test('absolute updates correct stale source, DPS, hit speed, and never invent level 16 values',()=>{
 const d={cards:[card('wizard',{Hitpoints:'832',Damage:'281','Damage per second':'200'},{'Hit Speed':'1.4 sec'}),card('zappies',{Hitpoints:'529',Damage:'117','Damage per second':'53'},{'Hit Speed':'2.2 sec'}),card('fireball',{'Area Damage':'688','Crown Tower Damage':'207'},{Type:'Spell'})]};
 applyOfficialBalances(d,ledger(),helpers);
 assert.equal(d.cards[0].combat.stats.Damage,304);assert.equal(d.cards[0].combat.dps,217);assert.equal(d.cards[0].s16.Damage,undefined);
 assert.equal(d.cards[1].n.hitSpeed,2.3);assert.equal(d.cards[1].combat.dps,50);
 assert.equal(d.cards[2].combat.stats['Crown Tower Damage'],159);assert.equal(d.cards[2].s16['Crown Tower Damage'],undefined);
 const first=d.cards.map(c=>c.combat);applyOfficialBalances(d,ledger(),helpers);assert.deepEqual(d.cards.map(c=>c.combat),first);
 d.cards[0].levels[11].Damage='281';applyOfficialBalances(d,ledger(),helpers);assert.equal(d.cards[0].combat.stats.Damage,304);
});
test('new-card seed covers HP/attributes; official patch overrides release damage',()=>{
 const d={cards:[card('minion-giant',{})]};delete d.cards[0].levels[11];
 applyOfficialBalances(d,ledger(),helpers);assert.equal(d.cards[0].combat.hp,1817);assert.equal(d.cards[0].combat.dps,112);assert.equal(d.cards[0].n.flying,true);assert.equal(d.cards[0].n.bld,true);
});
test('special-form fields are separate; normal stats are never copied into hero or evolution',()=>{
 const d={cards:[card('wizard',{Hitpoints:'832',Damage:'281'},{'Hit Speed':'1.4 sec'})]};applyOfficialBalances(d,ledger(),helpers);
 assert.equal(d.cards[0].formStats.e.combat.stats['Shield Hitpoints'],176);assert.equal(d.cards[0].formStats.e.combat.stats.Damage,undefined);assert.equal(d.cards[0].formStats.h.attrs['Ability Duration'],'3.5');
});
test('spell kill ranges compare equal levels, regardless of older max-level values',()=>{
 const c=card('wizard',{Hitpoints:'832',Damage:'281'},{Type:'Troop','Hit Speed':'1.4 sec'});c.jp='ウィザード';c.hp16=1;
 const fireball=card('fireball',{'Area Damage':'688','Crown Tower Damage':'207'},{Type:'Spell'});fireball.jp='ファイアボール';fireball.s16['Area Damage']=10000;
 const d={cards:[c,fireball]};applyOfficialBalances(d,ledger(),helpers);helpers.retagAll(d.cards);assert.ok(!c.tags.includes('ファイボ圏内'));
});
