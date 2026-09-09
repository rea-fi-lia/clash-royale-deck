#!/usr/bin/env node
/*
 * 「実際に何回収集したか」を数える（2026-09-09）
 *
 * ★なぜ要るか
 *   2026-09-09、実行は全部success・データも90分以内・帯も47/47なのに、
 *   収集ステップが5回中4回スキップされ、実質半分しか働いていない状態が
 *   誰にも気づかれずに続いていた。
 *   「個別の検査は全部合格なのに、全体としては働いていない」種類の故障は、
 *   成否や鮮度では捕まらない。**回数**を見るしかない。
 *
 * ★数え方
 *   収集が1回成功するたび data ブランチに「freshness marker」のコミットが1本増える。
 *   つまり data ブランチのコミット履歴がそのまま収集の実績。API 1回で取れる。
 *
 *   node tools/collect-rate.js [--hours 24] [--json]
 */
const { execFileSync } = require('child_process');

const args = process.argv.slice(2);
const argOne = (n, d) => { const i = args.indexOf(n); return i >= 0 && args[i + 1] ? args[i + 1] : d; };
const HOURS = Number(argOne('--hours', '24'));
const REPO = argOne('--repo', 'rea-fi-lia/clash-royale-deck');
const asJson = args.includes('--json');

// 毎時1回が正常。取りこぼしを1〜2回許容して18を下限にする
const EXPECTED = Math.round(HOURS);
const FLOOR = Math.max(1, Math.round(HOURS * 0.75));

let commits = [];
try {
  const since = new Date(Date.now() - HOURS * 3600e3).toISOString();
  const out = execFileSync('gh', [
    'api', `repos/${REPO}/commits?sha=data&since=${since}&per_page=100`,
    '-q', '[.[] | .commit.committer.date] | join(" ")'
  ], { encoding: 'utf8', maxBuffer: 8e6 });
  commits = out.trim().split(/\s+/).filter(Boolean);
} catch (e) {
  const msg = '収集回数が数えられなかった: ' + ((e && e.message) || e);
  if (asJson) { console.log(JSON.stringify({ ok: null, error: msg })); process.exit(0); }
  console.error(msg); process.exit(0);
}

const n = commits.length;
// 一番あいた間隔。75分ルール（battlelog 25戦×最低3分）を超えていないか
const times = commits.map(t => new Date(t).getTime()).sort((a, b) => b - a);
let maxGapMin = 0;
for (let i = 0; i + 1 < times.length; i++) {
  maxGapMin = Math.max(maxGapMin, Math.round((times[i] - times[i + 1]) / 60000));
}
const ok = n >= FLOOR && (maxGapMin === 0 || maxGapMin <= 75);

if (asJson) {
  console.log(JSON.stringify({ ok, count: n, expected: EXPECTED, floor: FLOOR, maxGapMin, hours: HOURS }));
} else {
  console.log(`収集回数 ${n}/${EXPECTED}回（下限${FLOOR}）  最大間隔 ${maxGapMin}分  判定 ${ok ? 'OK' : 'NG'}`);
}
