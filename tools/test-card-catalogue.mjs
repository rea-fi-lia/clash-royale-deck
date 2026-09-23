import test from 'node:test';
import assert from 'node:assert/strict';
import {createRequire} from 'node:module';
import fs from 'node:fs';
import vm from 'node:vm';
const require=createRequire(import.meta.url);
const {readCatalogue,buildManifest,collectorMaps,seedStats,digest,validate}=require('./card-catalogue.cjs');
const {reconcileOfficial,hashImages}=require('./update-card-catalogue.js');
const {validateRelease}=require('./build-card-stats.js');
const {applyPatch}=require('./apply-balance.js');
const source=readCatalogue();
test('a single new card appears in builder, collector, image manifest, IDs and stats acquisition',()=>{
  const next=structuredClone(source),card=structuredClone(next.cards[0]);
  Object.assign(card,{id:999999,slug:'future-card',name:'追加カード',english:'Future Card',wiki:{page:'Future_Card'}});next.cards.push(card);
  const manifest=buildManifest(next),maps=collectorMaps(next),stats=seedStats({cards:[]},next);
  assert.equal(manifest.cards.at(-1).id,999999);assert.ok(manifest.cardInfo['追加カード']);
  assert.equal(maps.ID2JP[999999],'追加カード');assert.equal(maps.COST['追加カード'],card.cost);
  assert.equal(stats.cards.at(-1).page,'Future_Card');assert.equal(stats.cards.at(-1).freshness.status,'missing');
});
test('cost, new form and same-URL artwork changes invalidate the catalogue and images',()=>{
  const a=buildManifest(source),next=structuredClone(source),c=next.cards[0];
  c.cost++;c.forms.h={image:'https://cdn.royaleapi.com/static/img/cards/skeletons-hero.png',sha256:'a'.repeat(64)};
  c.forms.n.sha256='b'.repeat(64);const b=buildManifest(next);
  assert.notEqual(a.revision,b.revision);assert.notEqual(a.cards[0].img,b.cards[0].img);
  assert.equal(b.cardInfo[c.name].h,true);assert.equal(b.cardInfo[c.name].c,c.cost);
});
test('stats retain curated fields, repair renamed joins and never reuse normal stats as form stats',()=>{
  const c=source.cards.find(c=>c.forms.e),old={slug:c.slug,jp:'old name',hp16:100,tags:['curated'],s16:{Hitpoints:100}};
  const result=seedStats({cards:[old]},source).cards.find(s=>s.slug===c.slug);
  assert.equal(result.jp,c.name);assert.deepEqual(result.tags,['curated']);assert.equal(result.hp16,100);
  assert.equal(result.formStats.e.status,'unverified');assert.equal(result.formStats.e.s16,undefined);
});
test('official discovery accepts known facts but reports unreviewed new cards and unknown forms',()=>{
  const items=source.cards.map((c,i)=>({id:c.id || 999000+i,name:c.english,elixirCost:c.cost,iconUrls:Object.fromEntries(Object.keys(c.forms).map(f=>[{n:'medium',e:'evolutionMedium',h:'heroMedium'}[f],'https://example.org/image']))}));
  // Identify by stable ID; the one historical missing ID is matched by slug.
  const result=reconcileOfficial(source,{items});assert.equal(result.issues.length,0);
  items[0].iconUrls.futureMedium='https://example.org/future';items.push({id:999999,name:'Future Card'});
  const changed=reconcileOfficial(source,{items});assert.ok(changed.issues.some(x=>x.kind==='new-card'));assert.ok(changed.issues.some(x=>x.kind==='unknown-icon-form'));
});
test('unsupported catalogue forms are rejected instead of silently rendered as normal',()=>{
  const next=structuredClone(source);next.cards[0].forms.future=next.cards[0].forms.n;assert.throws(()=>validate(next),/renderer support/);
});
test('image audit rejects HTML and source remains unchanged on a failed staged refresh',async()=>{
  const next=structuredClone(source);await assert.rejects(hashImages(next,async()=>new Response('<html>down</html>')),/Invalid PNG/);
  assert.deepEqual(readCatalogue(),source);
});
test('missing/partial stats cannot masquerade as a complete release',()=>{
  const prepared=seedStats({cards:[]},source);prepared.refresh={total:source.cards.length,succeeded:0,failed:source.cards.length,partialSelection:false};
  validateRelease(prepared,source);
  prepared.refresh.partialSelection=true;assert.throws(()=>validateRelease(prepared,source),/Unverified/);
  prepared.refresh.partialSelection=false;prepared.cards[0].freshness=null;assert.throws(()=>validateRelease(prepared,source),/coverage/);
});
const initial={cards:[{slug:'knight',s16:{Hitpoints:100},stats:{Hitpoints:'100'},balance:[]}]};
const patch={season:99,kind:'final',source:'https://example.org/verified',liveAt:'2026-01-01',baseHash:digest(initial),changes:[{slug:'knight',field:'s16.Hitpoints',ratio:[110,100]}]};
test('balance patches are atomic and idempotent with a verified base',()=>{
  const once=applyPatch(initial,patch);assert.equal(once.cards[0].s16.Hitpoints,110);assert.deepEqual(applyPatch(once,patch),once);assert.equal(initial.cards[0].s16.Hitpoints,100);
  assert.throws(()=>applyPatch(initial,{...patch,changes:[...patch.changes,{slug:'missing',field:'s16.Hitpoints',ratio:[2,1]}]}),/Missing/);
  assert.throws(()=>applyPatch(initial,{...patch,outOfScope:[{name:'hero'}]}),/Unimplemented/);
  assert.throws(()=>applyPatch(initial,{...patch,baseHash:'old'}),/baseHash/);
  assert.throws(()=>applyPatch(initial,{...patch,liveAt:'2099-01-01'}),/effective/);
});
test('browser errors preserve form, retry once and produce a visible named placeholder',()=>{
  const handlers=[],context={console,window:{},document:{addEventListener:(name,handler)=>{if(name==='error')handlers.push(handler);}}};
  vm.runInNewContext(fs.readFileSync(new URL('../js/cards-data.js',import.meta.url),'utf8'),context);
  assert.equal(handlers.length,1);
  const attrs={};const img={tagName:'IMG',src:'https://cdn.royaleapi.com/static/img/cards/knight-ev1.png?v=123',alt:'ナイト・限界突破',getAttribute:k=>attrs[k],setAttribute:(k,v)=>attrs[k]=v};
  handlers[0]({target:img});assert.match(img.src,/knight-ev1.png\?v=123$/);
  handlers[0]({target:img});assert.match(img.src,/^data:image\/svg\+xml/);assert.equal(attrs['data-image-unavailable'],'true');
  assert.match(decodeURIComponent(img.src),/ナイト・限界突破/);
});
test('unknown-card observations are preserved across disk chunks without a sample cap',async()=>{
  const {UnmappedCardStore}=require('./unmapped-card-store.cjs');const store=new UnmappedCardStore();
  for(let i=0;i<503;i++)store.add({i,battle:{cards:[{id:999999,evolutionLevel:3}]}});
  const chunks=[];await store.flush(async(part,rows)=>{chunks.push(rows);return true;});
  assert.deepEqual(chunks.map(c=>c.length),[250,250,3]);assert.equal(chunks.flat().at(-1).i,502);assert.equal(store.dir,null);
});
