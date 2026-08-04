#!/usr/bin/env node
/*
 * 公式CR APIの /cards が返すアイコンURLを棚卸しする。
 *
 * 背景（2026-08-03）:
 *   画像の配布元にしている RoyaleAPI/cr-api-assets は最終更新2026-03-05で止まっており、
 *   7月に実装された新ヒーロー/新進化の画像が存在しない（404）。
 *   公式APIが進化・ヒーローのアイコンURLを持っているなら、そちらを正にした方が確実。
 *
 * 使い方: CR_TOKEN=xxx node tools/probe-card-icons.js
 */
const PROXY = 'https://proxy.royaleapi.dev/v1';
const TOKEN = (process.env.CR_TOKEN || '').replace(/[^A-Za-z0-9._-]/g, '');

async function main() {
  if (!TOKEN) { console.error('CR_TOKEN がありません'); process.exit(1); }
  const res = await fetch(PROXY + '/cards', { headers: { Authorization: 'Bearer ' + TOKEN, Accept: 'application/json', 'User-Agent': 'crdb-icon-probe' } });
  if (!res.ok) { console.error('CR API ' + res.status + ' ' + (await res.text()).slice(0, 200)); process.exit(1); }
  const j = await res.json();

  const groups = Object.keys(j).filter(k => Array.isArray(j[k]));
  console.log('トップレベルの配列:', groups.map(g => g + '(' + j[g].length + ')').join(', '));

  const items = j.items || [];
  console.log('\n=== items の総数:', items.length, '===');

  // どんなアイコンURLのキーがあるか
  const iconKeys = {};
  items.forEach(c => Object.keys(c.iconUrls || {}).forEach(k => { iconKeys[k] = (iconKeys[k] || 0) + 1; }));
  console.log('\n--- iconUrls のキーと出現数 ---');
  Object.entries(iconKeys).sort((a, b) => b[1] - a[1]).forEach(([k, n]) => console.log('  ' + k + ': ' + n + '/' + items.length));

  // カード側のフィールド一覧
  const fieldKeys = {};
  items.forEach(c => Object.keys(c).forEach(k => { fieldKeys[k] = (fieldKeys[k] || 0) + 1; }));
  console.log('\n--- カードのフィールド ---');
  Object.entries(fieldKeys).sort((a, b) => b[1] - a[1]).forEach(([k, n]) => console.log('  ' + k + ': ' + n));

  // 今回の対象（新ヒーロー/新進化）が取れるか
  console.log('\n--- 対象カードの実URL ---');
  ['Berserker', 'Valkyrie', 'Elite Barbarians', 'Knight', 'Goblins'].forEach(nm => {
    const c = items.find(x => x.name === nm);
    if (!c) { console.log('  ' + nm + ' → 見つからず'); return; }
    console.log('  ' + nm + ' (id=' + c.id + ' maxLevel=' + c.maxLevel + ')');
    Object.entries(c.iconUrls || {}).forEach(([k, v]) => console.log('      ' + k + ': ' + v));
    if (c.maxEvolutionLevel != null) console.log('      maxEvolutionLevel: ' + c.maxEvolutionLevel);
    if (c.elixirCost != null) console.log('      elixirCost: ' + c.elixirCost);
  });

  // 進化アイコンを持つカードの数＝進化カードの正
  const withEvo = items.filter(c => c.iconUrls && c.iconUrls.evolutionMedium);
  console.log('\n進化アイコンを持つカード: ' + withEvo.length + '枚');
  console.log('  ' + withEvo.map(c => c.name).join(', '));

  // support items（タワートループ等）も見る
  if (j.supportItems) {
    console.log('\nsupportItems: ' + j.supportItems.length + '件 例: ' + j.supportItems.slice(0, 5).map(x => x.name).join(', '));
  }
}
main().catch(e => { console.error(e); process.exit(1); });
