// Public card metadata only. Analysis and battle data do not belong here.
const fs = require('node:fs');
const path = require('node:path');
const crypto = require('node:crypto');
const ROOT = path.resolve(__dirname, '..');
const SOURCE = path.join(ROOT, 'catalogue/cards.json');
const digest = value => crypto.createHash('sha256').update(typeof value === 'string' || Buffer.isBuffer(value) ? value : JSON.stringify(value)).digest('hex');
const slugOf = name => String(name).toLowerCase().replace(/[.']/g, '').replace(/&/g, 'and').replace(/[^a-z0-9]+/g, '-').replace(/^-+|-+$/g, '');
function validate(source) {
  if (source.schemaVersion !== 1 || !Array.isArray(source.cards) || !source.cards.length) throw Error('Invalid card catalogue');
  const names = new Set(), slugs = new Set(), ids = new Set();
  for (const c of source.cards) {
    if (!c.name || !c.english || !/^[a-z0-9-]+$/.test(c.slug) || names.has(c.name) || slugs.has(c.slug)) throw Error('Duplicate/invalid card: ' + c.slug);
    names.add(c.name); slugs.add(c.slug);
    if (c.id != null && (!Number.isSafeInteger(c.id) || ids.has(c.id))) throw Error('Duplicate/invalid ID: ' + c.slug);
    if (c.id != null) ids.add(c.id);
    if (!Number.isInteger(c.cost) || c.cost < 0 || c.cost > 10 || !['troop','spell','building'].includes(c.type) || !c.wiki?.page) throw Error('Missing metadata: ' + c.slug);
    if (!c.forms?.n) throw Error('Missing normal form: ' + c.slug);
    for (const [form, asset] of Object.entries(c.forms)) {
      if (!['n','e','h'].includes(form)) throw Error('New form needs renderer support: ' + c.slug + '/' + form);
      const u = new URL(asset.image);
      if (u.protocol !== 'https:' || u.hostname !== 'cdn.royaleapi.com' || !/^\/static\/img\/cards\/[a-z0-9-]+\.png$/.test(u.pathname) || u.search) throw Error('Invalid card asset: ' + c.slug);
      if (asset.sha256 && !/^[a-f0-9]{64}$/.test(asset.sha256)) throw Error('Invalid image digest: ' + c.slug);
    }
  }
  return source;
}
function readCatalogue(file = SOURCE) { return validate(JSON.parse(fs.readFileSync(file, 'utf8'))); }
function buildManifest(source) {
  validate(source);
  const revision = digest(source.cards);
  const cards = source.cards.map(c => {
    const image = f => c.forms[f] ? c.forms[f].image + '?v=' + (c.forms[f].sha256 || revision).slice(0, 16) : '';
    return {name:c.name, english:c.english, slug:c.slug, id:c.id || null, yomi:c.yomi || '', cost:c.cost, type:c.type, role:c.role || '', img:image('n'),
      ...(c.forms.e ? {evolved:true, imgEvolved:image('e')} : {}), ...(c.forms.h ? {hero:true, imgHero:image('h')} : {}), ...(c.champion ? {champion:true} : {})};
  });
  const cardInfo = Object.fromEntries(cards.map(c => [c.name, {c:c.cost,i:c.img,iv:c.imgEvolved || '',ih:c.imgHero || '',e:!!c.evolved,h:!!c.hero,ch:!!c.champion}]));
  return {schemaVersion:1, revision, cards, cardInfo};
}
function collectorMaps(source = readCatalogue()) {
  return {SLUG2JP:Object.fromEntries(source.cards.map(c=>[c.slug,c.name])), COST:Object.fromEntries(source.cards.map(c=>[c.name,c.cost])), ID2JP:Object.fromEntries(source.cards.filter(c=>c.id).map(c=>[c.id,c.name]))};
}
function seedStats(base, source = readCatalogue()) {
  const bySlug = new Map((base.cards || []).map(c=>[c.slug,c]));
  // Existing curated stats/tags remain intact; the catalogue determines membership and names.
  return {...base, catalogueRevision:buildManifest(source).revision, cards:source.cards.map(c=>({
    ...(bySlug.get(c.slug) || {attrs:{},stats:{},s16:{},n:{},tags:[],balance:[],freshness:{status:'missing'}}),
    jp:c.name,slug:c.slug,page:c.wiki.page,
    attrs:{...(bySlug.get(c.slug)?.attrs || {}),Cost:String(c.cost)},
    n:{...(bySlug.get(c.slug)?.n || {}),cost:c.cost},
    formStats:Object.fromEntries(Object.entries(c.forms).filter(([f])=>f!=='n').map(([f,a])=>[f,{
      ...(bySlug.get(c.slug)?.formStats?.[f] || {}),page:a.wikiPage || null,
      status:bySlug.get(c.slug)?.formStats?.[f]?.status || 'unverified'
    }]))
  }))};
}
module.exports = {ROOT,SOURCE,digest,slugOf,validate,readCatalogue,buildManifest,collectorMaps,seedStats};
