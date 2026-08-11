#!/usr/bin/env node
/*
 * i18n-extract — 日本語ページから「翻訳すべき本文テキスト」を抽出する番人（依存ゼロ・純Node）。
 *
 * 役割：
 *   1. gen-i18n.js の生成対象ページ（GENと同じ一覧）から日本語テキストノードを抽出し、
 *      tools/i18n-content/_ja-segments.json に保存（page → [原文...]）。
 *   2. tools/i18n-content/<lang>.json（{ "日本語原文": "翻訳" }）と突き合わせ、
 *      言語ごとの 翻訳済み/未訳/不要(ページから消えた原文) を表で出す。
 *
 * 運用：日本語ページを編集 → これを実行 → 未訳が増えていたら <lang>.json に訳を足す
 *       → node tools/gen-i18n.js（deploy.shが自動実行）で全言語へ反映。
 * 辞書が無い言語は日本語のまま生成される（壊れない）。翻訳はある言語から順に効く。
 *
 * 使い方: node tools/i18n-extract.js
 */
const fs = require('fs');
const path = require('path');
const ROOT = path.join(__dirname, '..');
const CONTENT_DIR = path.join(__dirname, 'i18n-content');

// gen-i18n.js と同じ対象（あちらのGEN定義と揃えること）
const PAGES = ['index.html', 'decks.html', 'strategy.html', 'guide.html', 'about.html', 'faq.html', 'glossary.html', 'support.html', 'contact.html', 'privacy.html']
  .filter(p => fs.existsSync(path.join(ROOT, p)));
const TARGETS = ['en', 'es', 'pt-br', 'fr', 'de', 'ru', 'ko', 'zh-cn', 'ar', 'tr', 'it', 'id', 'th', 'vi', 'zh-tw', 'fa', 'nl'];
const JA_RE = /[぀-ヿ一-鿿]/;

// gen-i18n.js の swapBodyText と同じトークナイザ（script/style/コメント退避 → タグで分割）
function extractJaTexts(html) {
  html = html.replace(/<script[\s\S]*?<\/script>|<style[\s\S]*?<\/style>|<!--[\s\S]*?-->/gi, '<\u0000>');   // gen-i18n.jsと同じタグ形退避＝トークン列が一致
  const parts = html.split(/(<[^>]+>)/);
  const out = [];
  for (let i = 0; i < parts.length; i += 2) {
    const seg = parts[i];
    if (!seg || !JA_RE.test(seg)) continue;
    const key = seg.trim();                 // gen-i18n.js swapBodyText と同一のキー正規化
    if (key) out.push(key);
  }
  return out;
}

function main() {
  fs.mkdirSync(CONTENT_DIR, { recursive: true });

  // 1) 抽出
  const segments = {};        // page → [原文...]（重複除去・出現順）
  const allKeys = new Set();  // 全ページ横断のユニーク原文
  PAGES.forEach(p => {
    const html = fs.readFileSync(path.join(ROOT, p), 'utf8');
    const seen = new Set();
    segments[p] = [];
    extractJaTexts(html).forEach(k => {
      if (seen.has(k)) return;
      seen.add(k);
      segments[p].push(k);
      allKeys.add(k);
    });
  });
  fs.writeFileSync(path.join(CONTENT_DIR, '_ja-segments.json'), JSON.stringify(segments, null, 1));
  // ★_keys.json＝ユニーク原文の「確定順」。tools/i18n-apply.js が訳文配列をこの順で突き合わせる。
  //   （各言語ファイルに長い日本語キーを書き直さずに済ませるための索引）
  const keyList = [...allKeys];
  fs.writeFileSync(path.join(CONTENT_DIR, '_keys.json'), JSON.stringify(keyList, null, 1));

  const totalChars = [...allKeys].reduce((s, k) => s + k.length, 0);
  console.log('抽出: ' + PAGES.length + 'ページ / ユニーク原文 ' + allKeys.size + '件 / 計 ' + totalChars.toLocaleString() + '字');
  PAGES.forEach(p => console.log('  ' + p + ': ' + segments[p].length + '件'));

  // 2) 言語別カバレッジ
  console.log('\n言語  翻訳済み  未訳  不要(ページから消えた原文)');
  TARGETS.forEach(lang => {
    let dict = null;
    try { dict = JSON.parse(fs.readFileSync(path.join(CONTENT_DIR, lang + '.json'), 'utf8')); } catch (e) {}
    if (!dict) { console.log(pad(lang) + ' （辞書なし＝全' + allKeys.size + '件が未訳）'); return; }
    let done = 0, miss = 0;
    allKeys.forEach(k => { (dict[k] != null && dict[k] !== '') ? done++ : miss++; });
    const obsolete = Object.keys(dict).filter(k => !allKeys.has(k)).length;
    console.log(pad(lang) + '  ' + String(done).padStart(6) + '  ' + String(miss).padStart(4) + '  ' + String(obsolete).padStart(4));
  });
  function pad(s) { return (s + '      ').slice(0, 6); }

  console.log('\n次の一手: tools/i18n-content/<lang>.json に {"日本語原文":"翻訳"} を足す → node tools/gen-i18n.js');
}
main();
