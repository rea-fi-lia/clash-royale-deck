#!/usr/bin/env node
/*
 * i18n-apply — 訳文の配列から <lang>.json（{"日本語原文":"訳"}）を組み立てる（依存ゼロ・純Node）。
 *
 * なぜ要るか：
 *   言語ファイルは可読性のため「日本語原文」をキーに持つ。しかし17言語ぶん作るとき、
 *   同じ長い日本語キーを毎回書き写すのは無駄で、写し間違いも起きる。
 *   そこで「_keys.json の確定順に並べた訳文の配列」だけを用意すれば、
 *   このスクリプトがキーと結び直して正式な <lang>.json を書き出す。
 *
 * 使い方:
 *   node tools/i18n-apply.js <lang> <訳文配列JSONのパス>
 *   例) node tools/i18n-apply.js de /tmp/de.array.json
 *
 * 安全策:
 *   - 件数が _keys.json と違えばエラーで中断（ズレたまま書かない）
 *   - 空文字/未指定(null)の要素はキーごと出力しない＝未訳として extract に検出させる
 *   - 既存 <lang>.json があれば、配列側が空の項目は既存訳を残す（部分追記ができる）
 */
const fs = require('fs');
const path = require('path');
const CONTENT_DIR = path.join(__dirname, 'i18n-content');

function main() {
  const [lang, arrPath] = process.argv.slice(2);
  if (!lang || !arrPath) {
    console.error('使い方: node tools/i18n-apply.js <lang> <訳文配列JSONのパス>');
    process.exit(1);
  }
  const keysPath = path.join(CONTENT_DIR, '_keys.json');
  if (!fs.existsSync(keysPath)) {
    console.error('_keys.json がありません。先に node tools/i18n-extract.js を実行してください。');
    process.exit(1);
  }
  const keys = JSON.parse(fs.readFileSync(keysPath, 'utf8'));
  const arr = JSON.parse(fs.readFileSync(arrPath, 'utf8'));
  if (!Array.isArray(arr)) { console.error('訳文ファイルは配列である必要があります。'); process.exit(1); }
  if (arr.length !== keys.length) {
    console.error('件数が一致しません: _keys.json ' + keys.length + '件 / 訳文 ' + arr.length + '件');
    console.error('→ 原文が増減した可能性。node tools/i18n-extract.js を実行して数を合わせてください。');
    process.exit(1);
  }

  const outPath = path.join(CONTENT_DIR, lang + '.json');
  let prev = {};
  if (fs.existsSync(outPath)) { try { prev = JSON.parse(fs.readFileSync(outPath, 'utf8')); } catch (e) {} }

  const out = {};
  let filled = 0, kept = 0, empty = 0;
  keys.forEach((k, i) => {
    const v = arr[i];
    if (v != null && String(v).trim() !== '') { out[k] = String(v); filled++; return; }
    if (prev[k] != null && String(prev[k]).trim() !== '') { out[k] = prev[k]; kept++; return; }
    empty++;
  });

  fs.writeFileSync(outPath, JSON.stringify(out, null, 1) + '\n');
  console.log(lang + '.json を書き出し: 新規/更新 ' + filled + ' / 既存維持 ' + kept + ' / 未訳 ' + empty + '（全' + keys.length + '件）');
}
main();
