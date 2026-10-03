#!/usr/bin/env node
/*
 * 失敗の「型」を指紋にする（2026-10-03）
 *
 * ★自動修理が「同じ失敗」にAIを何度も呼ばないための部品。
 *   9/7〜9/18、人にしか直せない同じ失敗（アイスウィザードの英雄が手元の定義に無い）に、
 *   Fugu を12日続けて呼んでいた。同じ指紋の失敗をAIが一度試して直せなかったら、次は呼ばない。
 *
 * 指紋＝エラー行（✗ / ❌ / ##[error] / FATAL / Error:）の集合。実行ごとに変わる部分
 * （行頭の時刻、6桁以上の番号＝実行番号など、所要時間）は落とす。印が1行も無ければ何も出さない。
 *
 *   node tools/failure-signature.js <失敗ログのファイル>   → 16桁の指紋
 */
const fs = require('fs');
const crypto = require('crypto');

function signature(text) {
  const marks = /(✗ |❌|##\[error\]|FATAL|Error:)/;
  const lines = new Set();
  for (const raw of String(text || '').split('\n')) {
    // gh run view --log の行頭「ジョブ名<TAB>ステップ名<TAB>時刻 」を落とす
    let l = raw.replace(/^[^\t]*\t[^\t]*\t/, '').replace(/^\uFEFF?\d{4}-\d\d-\d\dT[\d:.]+Z ?/, '').trim();
    if (!marks.test(l) || /Process completed with exit code/.test(l)) continue;
    l = l.replace(/\b\d{6,}\b/g, '#').replace(/\d+(\.\d+)?\s*(ms|s|秒|分)(?![A-Za-z])/g, '#').replace(/\s+/g, ' ');
    lines.add(l.slice(0, 300));
  }
  if (!lines.size) return '';
  return crypto.createHash('sha256').update([...lines].sort().join('\n')).digest('hex').slice(0, 16);
}

if (require.main === module) {
  const sig = signature(fs.readFileSync(process.argv[2] || 0, 'utf8'));
  if (sig) console.log(sig);
}
module.exports = { signature };
