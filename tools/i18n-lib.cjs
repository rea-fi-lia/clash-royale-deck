'use strict';
/*
 * 翻訳の仕組みの共通部品（2026-10-12）
 *
 * 日本語が正本。訳は次の3か所にある（上ほど優先）：
 *   1. i18n.js の DICT …………………… 人が書いた訳（画面の文）
 *   2. tools/i18n-content/<lang>.json … ページの本文の訳（gen-i18n が言語ページへ静的に焼き込む）
 *   3. tools/i18n-runtime/<lang>.json … 画面の文の機械訳（js/i18n/<lang>.js に書き出し、i18n.js が足りない所にだけ使う）
 *
 * 訳す対象は人が並べず、ここで自動で集める（今後ページや文が増えても漏れないように）：
 *   - ページ：ルートにある .html を全部（除外は PAGE_EXCLUDE と <meta name="crdb-i18n" content="off">）
 *   - 本文：そのページの日本語のテキスト（gen-i18n と同じ区切り）と、説明文などの meta
 *   - 画面の文：JS の翻訳関数（_tr / _tf / TR / TRF / TRX / T / tr / tx / CRI18N.tr / CRI18N.t）と印（LBL / L）に渡した日本語・
 *     ページの属性（title / placeholder / aria-label / alt）・カードの役割・i18n.js の英語の表にある文
 */
const fs = require('fs');
const path = require('path');
const vm = require('vm');

const ROOT = path.join(__dirname, '..');
const TARGETS = ['en', 'es', 'pt-br', 'fr', 'de', 'ru', 'ko', 'zh-cn', 'ar', 'tr', 'it', 'id', 'th', 'vi', 'zh-tw', 'fa', 'nl'];
const LANG_EN_NAME = { en: 'English', es: 'Spanish', 'pt-br': 'Brazilian Portuguese', fr: 'French', de: 'German', ru: 'Russian', ko: 'Korean', 'zh-cn': 'Simplified Chinese', ar: 'Arabic', tr: 'Turkish', it: 'Italian', id: 'Indonesian', th: 'Thai', vi: 'Vietnamese', 'zh-tw': 'Traditional Chinese', fa: 'Persian', nl: 'Dutch' };
const JA_RE = /[぀-ヿ一-鿿]/;
const KANA_RE = /[぀-ヿ]/;
const CONTENT_DIR = path.join(ROOT, 'tools', 'i18n-content');
const RUNTIME_DIR = path.join(ROOT, 'tools', 'i18n-runtime');
const OUT_JS_DIR = path.join(ROOT, 'js', 'i18n');

// ── 言語ページを作るページ ─────────────────────────────────────────
// 管理画面・試作・検索の所有確認は言語ページを作らない。ほかのルートの .html は自動で対象になる。
const PAGE_EXCLUDE = new Set(['admin.html', '3d.html']);
const PAGE_ORDER = ['index.html', 'decks.html', 'strategy.html', 'guide.html', 'about.html', 'faq.html', 'glossary.html', 'support.html', 'contact.html', 'privacy.html'];
function readRoot(f) { return fs.readFileSync(path.join(ROOT, f), 'utf8'); }
function pageOptedOut(html) { return /<meta\s+name="crdb-i18n"\s+content="off"\s*\/?>/i.test(html); }
function genPages() {
  const all = fs.readdirSync(ROOT).filter(f => f.endsWith('.html') && !PAGE_EXCLUDE.has(f) && !/^google[0-9a-f]+\.html$/.test(f))
    .filter(f => !pageOptedOut(readRoot(f)));
  return PAGE_ORDER.filter(p => all.includes(p)).concat(all.filter(p => !PAGE_ORDER.includes(p)).sort());
}
function pageNoindex(html) { return /<meta\s+name="robots"\s+content="[^"]*noindex/i.test(html); }

// ── 本文の文（gen-i18n の swapBodyText と同じ区切り） ──────────────────
function stripJaOnly(html) { return html.replace(/<!--JA-ONLY-->[\s\S]*?<!--\/JA-ONLY-->\n?/g, ''); }
function textSegments(html) {
  const h = stripJaOnly(html).replace(/<script[\s\S]*?<\/script>|<style[\s\S]*?<\/style>|<!--[\s\S]*?-->/gi, '<\u0000>');
  const parts = h.split(/(<[^>]+>)/);
  const out = [];
  for (let i = 0; i < parts.length; i += 2) {
    const seg = parts[i];
    if (!seg || !JA_RE.test(seg)) continue;
    const key = seg.trim();
    if (key) out.push(key);
  }
  return out;
}
// 説明文などの meta（言語ページの題名・説明文の対応表が無いページで使う）
const META_KEYS = ['description', 'og:title', 'og:description', 'twitter:title', 'twitter:description'];
function metaContent(html, key) {
  const esc = key.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
  const m = html.match(new RegExp('<meta\\s+(?:name|property)="' + esc + '"\\s+content="([^"]*)"', 'i'));
  return m ? m[1] : null;
}
function metaSegments(html) {
  return META_KEYS.map(k => metaContent(html, k)).filter(v => v && JA_RE.test(v)).map(v => v.trim());
}
// ページの属性（実行時に i18n.js の tr() が訳す）
function attrSegments(html) {
  const h = stripJaOnly(html).replace(/<script[\s\S]*?<\/script>|<style[\s\S]*?<\/style>|<!--[\s\S]*?-->/gi, '');
  const out = [];
  for (const m of h.matchAll(/\s(?:title|placeholder|aria-label|alt)="([^"]*)"/g)) {
    const v = stripLeadingPicto(m[1].trim());   // 先頭の絵文字は tr() が残して残りを訳す
    if (v && JA_RE.test(v) && !v.includes('${')) out.push(v);
  }
  return out;
}

// ── i18n.js の訳語の表を読む（ブラウザの外で動かす） ──────────────────
let _dictCache = null;
function loadI18n() {
  if (_dictCache) return _dictCache;
  const src = fs.readFileSync(path.join(ROOT, 'i18n.js'), 'utf8')
    .replace(/(const|let|var)\s+DICT\s*=/, '$1 DICT = globalThis.__DICT =')
    .replace(/(const|let|var)\s+CARD_EN\s*=/, '$1 CARD_EN = globalThis.__CARD_EN =');
  const noop = () => {};
  const el = { setAttribute: noop, appendChild: noop, addEventListener: noop, style: {}, classList: { add: noop, remove: noop, toggle: noop }, dataset: {} };
  const sb = { console: { log: noop, warn: noop, error: noop }, setTimeout: noop, requestAnimationFrame: noop, URLSearchParams, MutationObserver: function () { this.observe = noop; },
    NodeFilter: { SHOW_TEXT: 4, FILTER_REJECT: 2, FILTER_ACCEPT: 1 }, navigator: { language: 'ja' }, location: { pathname: '/', search: '', hash: '' },
    localStorage: { getItem: () => null, setItem: noop }, sessionStorage: { getItem: () => null, setItem: noop },
    document: { readyState: 'loading', documentElement: el, head: el, body: null, addEventListener: noop, querySelector: () => null, querySelectorAll: () => [],
      getElementById: () => null, createElement: () => Object.assign({}, el), createTreeWalker: () => ({ nextNode: () => null }) } };
  sb.window = sb;
  try { vm.runInNewContext(src, sb, { timeout: 5000 }); } catch (e) { /* 画面が無い所で止まっても、表は先に作られている */ }
  if (!sb.__DICT || !sb.__DICT.en) throw new Error('i18n.js から訳語の表（DICT）を読めなかった');
  _dictCache = { DICT: sb.__DICT, CARD_EN: sb.__CARD_EN || {} };
  return _dictCache;
}

// ── 画面の文（JS の翻訳関数に渡した日本語） ─────────────────────────
const CALL_RE = /(?:\b_tr|\b_tf|\bTRF|\bTRX|\bTR|\bT|\bLBL|\bLF|\bL|\btr|\btx|CRI18N\.tr|CRI18N\.t)\(\s*(['"`])((?:(?!\1)[^\\\n]|\\.)*?)\1/g;
const JS_SKIP = new Set(['cards-data.js', 'neo3d.js']);
function unescapeJs(s) {
  return s.replace(/\\u\{([0-9a-fA-F]+)\}/g, (m, h) => String.fromCodePoint(parseInt(h, 16)))
    .replace(/\\u([0-9a-fA-F]{4})/g, (m, h) => String.fromCharCode(parseInt(h, 16)))
    .replace(/\\n/g, '\n').replace(/\\(['"`\\])/g, '$1');
}
function stripLeadingPicto(s) { return s.replace(/^\p{Extended_Pictographic}️?\s*/u, ''); }
function jsSources() {
  const js = fs.readdirSync(path.join(ROOT, 'js')).filter(f => /\.m?js$/.test(f) && !JS_SKIP.has(f)).map(f => 'js/' + f);
  return js.concat(['auth.js', 'tools/build-static-content.js']).filter(f => fs.existsSync(path.join(ROOT, f)));
}
function jsCallKeys() {
  const out = new Map();   // key → file
  for (const f of jsSources()) {
    const s = readRoot(f);
    for (const m of s.matchAll(CALL_RE)) {
      const raw = m[2];
      if (!JA_RE.test(raw) || raw.includes('${')) continue;
      const k = stripLeadingPicto(unescapeJs(raw));
      if (k && !out.has(k)) out.set(k, f);
    }
  }
  return out;
}
function roleKeys() {
  try {
    const cards = JSON.parse(readRoot('catalogue/cards.json')).cards || [];
    return [...new Set(cards.map(c => c.role).filter(r => r && JA_RE.test(r)))];
  } catch (e) { return []; }
}

// ── 訳す対象の一覧 ────────────────────────────────────────────────
// 画面の文：{ key, ja, en } … key は表のキー（ふつうは日本語の文そのもの・t(key) の形は 'strat.beta' のような名前）
function runtimeItems() {
  const { DICT, CARD_EN } = loadI18n();
  const items = new Map();
  const add = (key, ja) => { if (!key || items.has(key)) return; items.set(key, { key, ja: ja || key }); };
  // i18n.js の英語の表にある日本語の文（カード名は英語のまま使うので除く）
  for (const k of Object.keys(DICT.en)) if (JA_RE.test(k) && !(k in CARD_EN)) add(k);
  // 名前で引く形（data-i18n="strat.beta" など）：原文は DICT.ja
  for (const k of Object.keys(DICT.ja || {})) if (!JA_RE.test(k) && JA_RE.test(String(DICT.ja[k]))) add(k, String(DICT.ja[k]));
  for (const k of jsCallKeys().keys()) if (!(k in CARD_EN)) add(k);
  for (const r of roleKeys()) add(r);
  for (const p of genPages()) for (const a of attrSegments(readRoot(p))) if (!(a in CARD_EN)) add(a);
  return [...items.values()].map(it => Object.assign(it, { en: DICT.en[it.key] != null ? String(DICT.en[it.key]) : null }));
}
// 本文の文：ページごと
function staticItems() {
  const out = new Map();   // ja → [pages]
  for (const p of genPages()) {
    const h = readRoot(p);
    for (const k of textSegments(h).concat(metaSegments(h))) {
      if (!out.has(k)) out.set(k, []);
      if (!out.get(k).includes(p)) out.get(k).push(p);
    }
  }
  return out;
}

// ── 訳の記録（ファイル） ────────────────────────────────────────────
function readJson(f) { try { return JSON.parse(fs.readFileSync(f, 'utf8')); } catch (e) { return {}; } }
function contentMemory(lang) { return readJson(path.join(CONTENT_DIR, lang + '.json')); }
function runtimeMemory(lang) { return readJson(path.join(RUNTIME_DIR, lang + '.json')); }
// 既存の i18n-content と同じ形（字下げ1・最後に改行）
function writeJson(f, obj) { fs.mkdirSync(path.dirname(f), { recursive: true }); fs.writeFileSync(f, JSON.stringify(obj, null, 1) + '\n'); }

// その言語で画面の文の訳があるか（人の訳 → 機械訳）
function runtimeHas(lang, key, mem) {
  const { DICT } = loadI18n();
  return (DICT[lang] && DICT[lang][key] != null) || (mem && mem[key] != null);
}

module.exports = {
  ROOT, TARGETS, LANG_EN_NAME, JA_RE, KANA_RE, CONTENT_DIR, RUNTIME_DIR, OUT_JS_DIR, META_KEYS,
  genPages, pageNoindex, pageOptedOut, stripJaOnly, textSegments, metaSegments, metaContent, attrSegments,
  loadI18n, jsCallKeys, roleKeys, runtimeItems, staticItems,
  contentMemory, runtimeMemory, writeJson, readJson, runtimeHas, stripLeadingPicto,
};
