#!/usr/bin/env node
/*
 * 公式CR APIの /cards が返すアイコンURLを棚卸しし、
 * js/cards-data.js の hero/evolved 定義とのズレを表にする。
 *
 * 背景:
 *   画像の配布元にしていた RoyaleAPI/cr-api-assets は最終更新2026-03-05で止まっており、
 *   新ヒーロー/新進化の画像が入らない（2026-08-04に判明）。
 *   ★2026-08-11: 公式APIに `heroMedium` が現れた（8/4時点は medium と evolutionMedium だけ）。
 *   これでヒーローも公式APIが正になったので、実装済みかどうかの判定はここだけで完結する。
 *
 * 使い方: CR_TOKEN=xxx node tools/probe-card-icons.js
 */
const fs = require('fs');
const path = require('path');
const vm = require('vm');

const PROXY = 'https://proxy.royaleapi.dev/v1';
const TOKEN = (process.env.CR_TOKEN || '').replace(/[^A-Za-z0-9._-]/g, '');

function loadLocalCards() {
  const p = path.join(__dirname, '..', 'js', 'cards-data.js');
  const src = fs.readFileSync(p, 'utf8');
  const ctx = vm.createContext({ document: { addEventListener() {} }, window: {}, console });
  vm.runInContext(src.replace(/^const /gm, 'var '), ctx);
  return ctx.CARDS || [];
}

async function main() {
  if (!TOKEN) { console.error('CR_TOKEN がありません'); process.exit(1); }
  const res = await fetch(PROXY + '/cards', { headers: { Authorization: 'Bearer ' + TOKEN, Accept: 'application/json', 'User-Agent': 'crdb-icon-probe' } });
  if (!res.ok) { console.error('CR API ' + res.status + ' ' + (await res.text()).slice(0, 200)); process.exit(1); }
  const j = await res.json();
  const items = j.items || [];

  const iconKeys = {};
  items.forEach(c => Object.keys(c.iconUrls || {}).forEach(k => { iconKeys[k] = (iconKeys[k] || 0) + 1; }));
  console.log('=== items ' + items.length + '枚 / iconUrls のキー ===');
  Object.entries(iconKeys).sort((a, b) => b[1] - a[1]).forEach(([k, n]) => console.log('  ' + k + ': ' + n + '/' + items.length));

  const evo = items.filter(c => c.iconUrls && c.iconUrls.evolutionMedium);
  const hero = items.filter(c => c.iconUrls && c.iconUrls.heroMedium);
  console.log('\n=== 公式APIが認める形態（これが正） ===');
  console.log('進化 ' + evo.length + '枚: ' + evo.map(c => c.name).join(', '));
  console.log('\n英雄 ' + hero.length + '枚: ' + hero.map(c => c.name).join(', '));

  // ローカル定義との突合。英名⇔日本語名は slug（画像URL）で結ぶ
  const local = loadLocalCards();
  const slugOf = u => (String(u || '').match(/\/([a-z0-9-]+)\.png/i) || [])[1] || '';
  const bySlug = {}; local.forEach(c => { const s = slugOf(c.img); if (s) bySlug[s] = c; });
  const apiSlug = c => String(c.name).toLowerCase().replace(/[.']/g, '').replace(/\s+/g, '-');

  console.log('\n=== js/cards-data.js とのズレ ===');
  const miss = { evo: [], evoExtra: [], hero: [], heroExtra: [] };
  const apiEvo = new Set(), apiHero = new Set();
  items.forEach(c => {
    const s = apiSlug(c);
    if (c.iconUrls && c.iconUrls.evolutionMedium) apiEvo.add(s);
    if (c.iconUrls && c.iconUrls.heroMedium) apiHero.add(s);
  });
  Object.keys(bySlug).forEach(s => {
    const c = bySlug[s];
    if (apiEvo.has(s) && !c.evolved) miss.evo.push(c.name + '(' + s + ')');
    if (!apiEvo.has(s) && c.evolved) miss.evoExtra.push(c.name + '(' + s + ')');
    if (apiHero.has(s) && !c.hero) miss.hero.push(c.name + '(' + s + ')');
    if (!apiHero.has(s) && c.hero) miss.heroExtra.push(c.name + '(' + s + ')');
  });
  const line = (label, arr) => console.log('  ' + label + ': ' + (arr.length ? arr.join(', ') : 'なし'));
  line('★進化を足すべき', miss.evo);
  line('★進化を外すべき（公式に無い）', miss.evoExtra);
  line('★英雄を足すべき', miss.hero);
  line('★英雄を外すべき（公式に無い）', miss.heroExtra);
  const unmatched = [...apiEvo, ...apiHero].filter(s => !bySlug[s]);
  if (unmatched.length) console.log('  （slug照合できず要確認: ' + [...new Set(unmatched)].join(', ') + '）');

  if (j.supportItems) console.log('\nsupportItems: ' + j.supportItems.length + '件 ' + j.supportItems.map(x => x.name).join(', '));
}
main().catch(e => { console.error(e); process.exit(1); });
