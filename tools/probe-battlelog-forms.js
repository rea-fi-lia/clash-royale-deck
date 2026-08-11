#!/usr/bin/env node
/*
 * バトルログのカードが「進化/ヒーロー」をどう表しているかを実測する。
 *
 * 背景（2026-08-11）:
 *   カードランキングに「エリートバーバリアン⚡」が出ているが、公式API /cards の
 *   evolutionMedium を持つ41枚にエリートバーバリアンは無い＝進化は存在しないはず。
 *   collect.js の classifyDeck は evolutionLevel>0 のとき
 *     hasEvo && hasHero → レベルで振り分け / それ以外 → hasHero ? 'hero' : 'evo'
 *   と書いてあり、iconUrls が省略されていると何でも 'evo' に倒れる。
 *   実際にバトルログが何を返しているのかを見てから直す。
 *
 * 使い方: CR_TOKEN=xxx node tools/probe-battlelog-forms.js
 */
const PROXY = 'https://proxy.royaleapi.dev/v1';
const TOKEN = (process.env.CR_TOKEN || '').replace(/[^A-Za-z0-9._-]/g, '');
const H = { Authorization: 'Bearer ' + TOKEN, Accept: 'application/json', 'User-Agent': 'crdb-form-probe' };
const sleep = ms => new Promise(r => setTimeout(r, ms));

async function get(p) {
  const r = await fetch(PROXY + p, { headers: H });
  if (!r.ok) throw new Error(p + ' → ' + r.status);
  return r.json();
}

(async () => {
  if (!TOKEN) { console.error('CR_TOKEN がありません'); process.exit(1); }

  // 1) 公式が認める形態
  const cards = (await get('/cards')).items || [];
  const cap = {};
  cards.forEach(c => { cap[c.name] = { evo: !!(c.iconUrls || {}).evolutionMedium, hero: !!(c.iconUrls || {}).heroMedium }; });
  console.log('公式 /cards: 進化' + cards.filter(c => cap[c.name].evo).length + '枚 / 英雄' + cards.filter(c => cap[c.name].hero).length + '枚');

  // 2) 上位プレイヤーのバトルログを集める
  const pol = await get('/locations/global/pathoflegend/' + (await get('/locations/global/seasons')).items.slice(-1)[0].id + '/rankings/players?limit=40')
    .catch(async () => await get('/locations/global/rankings/players?limit=40'));
  const tags = (pol.items || []).map(x => x.tag).filter(Boolean).slice(0, 30);
  console.log('対象プレイヤー: ' + tags.length + '人');

  const seen = {};   // カード名 → {lv:{}, keys:{}, n}
  let battles = 0;
  for (let i = 0; i < tags.length; i += 8) {
    const logs = await Promise.all(tags.slice(i, i + 8).map(t =>
      get('/players/' + encodeURIComponent(t) + '/battlelog').catch(() => null)));
    logs.filter(Boolean).forEach(log => {
      (log || []).forEach(b => {
        battles++;
        [].concat(b.team || [], b.opponent || []).forEach(side => {
          (side.cards || []).forEach(c => {
            const e = seen[c.name] || (seen[c.name] = { lv: {}, keys: {}, n: 0 });
            e.n++;
            const el = c.evolutionLevel == null ? 'なし' : String(c.evolutionLevel);
            e.lv[el] = (e.lv[el] || 0) + 1;
            Object.keys(c.iconUrls || {}).forEach(k => { e.keys[k] = (e.keys[k] || 0) + 1; });
          });
        });
      });
    });
    await sleep(300);
  }
  console.log('走査した試合: ' + battles);

  // 3) evolutionLevel>0 が付いたカードを、公式の形態と突き合わせて出す
  console.log('\n=== evolutionLevel が 1以上で観測されたカード ===');
  console.log('カード名 | 出現 | evolutionLevelの内訳 | iconUrlsのキー | 公式:進化/英雄 | ★判定');
  Object.keys(seen).sort((a, b) => seen[b].n - seen[a].n).forEach(name => {
    const e = seen[name];
    const positives = Object.keys(e.lv).filter(k => k !== 'なし' && +k > 0);
    if (!positives.length) return;
    const c = cap[name] || { evo: false, hero: false };
    const verdict = (!c.evo && !c.hero) ? '★公式に形態が無いのに evolutionLevel が付く'
      : (c.evo && c.hero) ? '両方あり（レベルで振り分け必要）'
        : c.hero ? '英雄のみ' : '進化のみ';
    console.log('  ' + name.padEnd(20) + ' n=' + String(e.n).padStart(4) +
      ' lv=' + JSON.stringify(e.lv) +
      ' keys=[' + Object.keys(e.keys).join(',') + ']' +
      ' 公式=' + (c.evo ? '進化' : '') + (c.hero ? '英雄' : '') + (!c.evo && !c.hero ? 'なし' : '') +
      '  ' + verdict);
  });

  // 4) iconUrls がバトルログで省略されているかどうか
  const withEvoKey = Object.keys(seen).filter(n => seen[n].keys.evolutionMedium).length;
  const withHeroKey = Object.keys(seen).filter(n => seen[n].keys.heroMedium).length;
  console.log('\nバトルログの iconUrls に evolutionMedium を含むカード: ' + withEvoKey + '種 / heroMedium: ' + withHeroKey + '種（観測' + Object.keys(seen).length + '種）');
})().catch(e => { console.error(e.stack || e.message); process.exit(1); });
