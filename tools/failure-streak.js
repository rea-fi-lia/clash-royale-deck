#!/usr/bin/env node
/*
 * 「何回続けて失敗しているか」を数える（2026-08-11）
 *
 * ★通知と自動修理の両方がこの判定を使う。定義を1箇所に置くための部品。
 *
 * 定義：**別々の実行(run)** が新しい順に何回続けて failure か。
 *   同じ実行の中で2回試す、という意味ではない（リトライは無い）。
 *   実行中(conclusion=null)・キャンセル・スキップは数に入れず、そこで打ち切る。
 *
 *   node tools/failure-streak.js --workflow collect.yml [--exclude <run_id>]
 *     → 標準出力に回数だけを出す
 */
const { execFileSync } = require('child_process');

const args = process.argv.slice(2);
const argOne = (n) => { const i = args.indexOf(n); return i >= 0 && args[i + 1] ? args[i + 1] : null; };
const workflow = argOne('--workflow');
const exclude = argOne('--exclude') || '';
if (!workflow) { console.error('--workflow が要る'); process.exit(1); }

let rows = [];
try {
  const out = execFileSync('gh', [
    'run', 'list', '--workflow', workflow, '--limit', '20',
    '--json', 'conclusion,databaseId,createdAt'
  ], { encoding: 'utf8' });
  rows = JSON.parse(out);
} catch (e) {
  // 数えられないときは0を返す（数えられないことを理由に鳴らさない／直さない）
  console.error('実行履歴が取れなかった: ' + ((e && e.message) || e));
  console.log('0');
  process.exit(0);
}

let streak = 0;
const seen = [];
for (const r of rows) {
  if (String(r.databaseId) === String(exclude)) continue;
  if (!r.conclusion) continue;              // 実行中は飛ばす
  seen.push(r.conclusion);
  if (r.conclusion === 'failure') streak++;
  else break;                               // 成功に当たったらそこで途切れる
}
console.error('直近の結果(新しい順): ' + seen.slice(0, 6).join(' → '));
console.log(String(streak));
