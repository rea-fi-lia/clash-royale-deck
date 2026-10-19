#!/usr/bin/env node
/**
 * 勝ち筋（アーキタイプ）の定義が複数箇所でずれていないかの番人。
 *
 * 背景（2026-10-19）:
 *   勝ち筋の定義が3系統あり、食い違っていた。
 *     ① cards-data.js の winConditionPriority（CARD_WINCONS）… 37件。収集側の主軸判定とデッキ命名の正本
 *     ② tools/card-catalogue.cjs の collectorMaps().WINCONS … 37件（①と一致していた）
 *     ③ js/builder.js の ASSIST_WINCONS … 29件（①と8件食い違い）
 *   結果：上位100デッキのうち10件（ガーゴイルジャイアント8・ボスアサシン2）が
 *   主軸を持つのに診断で「主軸が薄い」と出ていた。
 *   ③を①由来に変えたので、再発したらここで落とす。
 *
 * 使い方   : node tools/check-wincon-sources.js
 * 自己診断 : node tools/check-wincon-sources.js --self-test
 */
'use strict';
const fs = require('fs');
const path = require('path');
const ROOT = path.join(__dirname, '..');

function cardWincons() {
  const src = fs.readFileSync(path.join(ROOT, 'js/cards-data.js'), 'utf8');
  const m = src.match(/const CARDS\s*=\s*(\[[\s\S]*?\n\]);/);
  if (!m) throw new Error('cards-data.js の CARDS を読めない');
  const CARDS = eval(m[1]);
  return CARDS.filter(c => c.winConditionPriority != null)
    .sort((a, b) => a.winConditionPriority - b.winConditionPriority)
    .map(c => c.name);
}

function collectorWincons() {
  return require(path.join(ROOT, 'tools/card-catalogue.cjs')).collectorMaps().WINCONS || [];
}

/** builder.js の ASSIST_WINCONS が「単一ソース由来」になっているか。固定リストに戻ったら落とす。 */
function assistSource() {
  const src = fs.readFileSync(path.join(ROOT, 'js/builder.js'), 'utf8');
  const m = src.match(/const ASSIST_WINCONS\s*=\s*([^;]+);/);
  if (!m) return { ok: false, how: 'ASSIST_WINCONS の定義が見つからない' };
  const expr = m[1].replace(/\s+/g, ' ').trim();
  if (/new Set\(\s*CARD_WINCONS\s*\)/.test(expr)) return { ok: true, how: expr };
  return { ok: false, how: expr };
}

function diff(a, b) {
  return { onlyA: a.filter(x => !b.includes(x)), onlyB: b.filter(x => !a.includes(x)) };
}

if (process.argv.includes('--self-test')) {
  // わざと食い違いを作って、検出できるかを確かめる（合格するだけの検査にしない）
  const d1 = diff(['A', 'B', 'C'], ['A', 'B']);
  const ok1 = d1.onlyA.length === 1 && d1.onlyB.length === 0;
  const ok2 = !/new Set\(\s*CARD_WINCONS\s*\)/.test("new Set(['ホグライダー','ジャイアント'])");
  const ok3 = /new Set\(\s*CARD_WINCONS\s*\)/.test('new Set(CARD_WINCONS)');
  console.log(`自己診断: 差分検出=${ok1 ? 'OK' : 'NG'} / 固定リストを落とす=${ok2 ? 'OK' : 'NG'} / 単一ソースを通す=${ok3 ? 'OK' : 'NG'}`);
  process.exit(ok1 && ok2 && ok3 ? 0 : 1);
}

const errs = [];
const card = cardWincons();
let col = [];
try { col = collectorWincons(); } catch (e) { errs.push('collector の WINCONS を読めない: ' + e.message); }

console.log(`① cards-data.js の winConditionPriority : ${card.length}件（正本）`);
console.log(`② collector の WINCONS                  : ${col.length}件`);

const d = diff(card, col);
if (d.onlyA.length || d.onlyB.length) {
  errs.push('① と ② が食い違っています:\n   ①のみ: ' + (d.onlyA.join(' ') || 'なし') + '\n   ②のみ: ' + (d.onlyB.join(' ') || 'なし'));
} else {
  console.log('   → ①②一致 ✓');
}

const a = assistSource();
console.log(`③ builder.js の ASSIST_WINCONS          : ${a.how}`);
if (!a.ok) {
  errs.push('③ が単一ソース由来になっていません。`new Set(CARD_WINCONS)` に戻してください。\n   いまの式: ' + a.how);
} else {
  console.log('   → ③は①由来 ✓');
}

if (errs.length) {
  console.error('\n✗ 勝ち筋の定義がずれています:\n' + errs.map(e => ' - ' + e).join('\n'));
  console.error('\n→ 正本は js/cards-data.js の winConditionPriority。ここを直し、他は参照に統一してください。');
  process.exit(1);
}
console.log(`\n✓ 勝ち筋の定義は1箇所（${card.length}件）に揃っています`);
