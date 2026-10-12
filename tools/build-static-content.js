#!/usr/bin/env node
/*
 * 人気デッキのページ（decks.html）に「今日の環境のまとめ」を静的なHTMLで書き出す。
 *
 * ★2026-10-12：AdSense が「有用性の低いコンテンツ」で不承認（2026-08-21）。主な中身（デッキの一覧・数字）が
 *   JavaScript で後から描かれ、静的なHTMLの本文は約800字しかなかった。審査がJavaScriptを実行する保証は無く、
 *   Google 検索も事前の描画を勧めている。そこで、毎時の集計から主な数字を1日1回この欄に書き出す。
 *   画面に出ている数字の要約だけを載せる（新しい生データは出さない・クローラーにだけ見せる内容は作らない）。
 *
 * 日本語のページの欄は <!--JA-ONLY--> で囲む。17言語の版は tools/static-content/decks-summary.json に書き、
 * gen-i18n が言語ページの同じ場所へ入れる（2026-10-12）。文の訳は L()／LF() に渡した文を
 * tools/i18n-translate.js が集めて訳す（i18n.js の DICT → tools/i18n-runtime/<lang>.json → 英語の順）。
 * 訳が英語にも無い言語は書き出さない（その言語のページでは欄ごと外れる）。
 * 使い方: node tools/build-static-content.js --from-api        … 本番の /api/meta から
 *         node tools/build-static-content.js --meta <file.json> … 手元の JSON から
 */
const fs = require('fs');
const path = require('path');
const https = require('https');

const ROOT = path.join(__dirname, '..');
const PAGE = path.join(ROOT, 'decks.html');
const OUT_LANGS = path.join(__dirname, 'static-content', 'decks-summary.json');
const I18N = require('./i18n-lib.cjs');
const START = '<!--JA-ONLY--><!--STATIC-DECKS-->';
const END = '<!--/STATIC-DECKS--><!--/JA-ONLY-->';
const ANCHOR = '<section class="page-guide">';
const API = 'https://crdeckbuilders.com/api/meta';

const arg = k => { const i = process.argv.indexOf(k); return i >= 0 ? (process.argv[i + 1] || true) : null; };
const esc = s => String(s == null ? '' : s).replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
let LANG = 'ja';
const NUM_LOCALE = { 'pt-br': 'pt-BR', 'zh-cn': 'zh-CN', 'zh-tw': 'zh-TW' };
const fmt = n => Number(n || 0).toLocaleString(LANG === 'ja' ? 'ja-JP' : (NUM_LOCALE[LANG] || LANG));
// 文の訳（日本語はそのまま）。訳が無いときは英語、英語も無いときは null を返して、その言語の版を作らない
let MISSING = 0;
function L(s) {
  if (LANG === 'ja') return s;
  const { DICT } = I18N.loadI18n();
  const v = (DICT[LANG] && DICT[LANG][s]) ?? I18N.runtimeMemory(LANG)[s] ?? (DICT.en && DICT.en[s]) ?? I18N.runtimeMemory('en')[s];
  if (v == null) { MISSING++; return s; }
  return String(v);
}
const LF = (s, v) => L(s).replace(/\{(\w+)\}/g, (m, k) => (v[k] != null ? v[k] : m));

function getJson(url) {
  return new Promise((resolve, reject) => {
    https.get(url, { headers: { 'user-agent': 'crdb-static-content', accept: 'application/json' } }, res => {
      if (res.statusCode !== 200) { reject(new Error('HTTP ' + res.statusCode + ' ' + url)); res.resume(); return; }
      let b = ''; res.setEncoding('utf8'); res.on('data', c => b += c); res.on('end', () => { try { resolve(JSON.parse(b)); } catch (e) { reject(e); } });
    }).on('error', reject);
  });
}

function catalogue() {
  const cards = JSON.parse(fs.readFileSync(path.join(ROOT, 'catalogue', 'cards.json'), 'utf8')).cards;
  return new Map(cards.map(c => [c.name, c]));
}

// 形態は絵文字でなく文字で書く（UIアイコンの点検に合わせる）。日本語以外はカード名を英語の公式名で
const FORM = { evo: () => L('（進化）'), hero: () => L('（ヒーロー）') };
let CAT = null;
const cardName = name => { const c = CAT && CAT.get(name); return LANG === 'ja' || !c || !c.english ? name : c.english; };
function cardLink(name, form, cat) {
  const c = cat.get(name);
  const label = esc(cardName(name)) + esc(FORM[form] ? FORM[form]() : '');
  return c && c.slug ? '<a href="cards/' + esc(c.slug) + '.html">' + label + '</a>' : label;
}
function plainArch(a) {
  const s = String(a || '');
  const base = s.replace(/⚡️?/gu, '').replace(/\u{1F451}️?/gu, '').trim();
  const form = /⚡/u.test(s) ? FORM.evo() : /\u{1F451}/u.test(s) ? FORM.hero() : '';
  return esc((CAT && CAT.has(base) ? cardName(base) : L(base)) + form);
}

function jst(iso) {
  const d = new Date(iso);
  if (isNaN(d)) return '';
  const j = new Date(d.getTime() + 9 * 3600 * 1000);
  const p = n => String(n).padStart(2, '0');
  return j.getUTCFullYear() + '年' + (j.getUTCMonth() + 1) + '月' + j.getUTCDate() + '日 ' + p(j.getUTCHours()) + ':' + p(j.getUTCMinutes());
}

function utc(iso) {
  const d = new Date(iso);
  if (isNaN(d)) return '';
  return d.toISOString().slice(0, 16).replace('T', ' ') + ' UTC';
}

function build(meta, lang) {
  LANG = lang || 'ja'; MISSING = 0;
  const dk = meta.decks || {};
  const w = (dk.windows && dk.windows[dk.defaultWindow || '3d']) || dk;
  const cat = catalogue(); CAT = cat;
  const uniqTotal = w.uniquePlayers || dk.uniquePlayers || 0;
  // 表示する「◯人が使用」と並び順をそろえる（APIの並びは延べの観測数の順で、人数の順と食い違う所がある・2026-10-12 Codex の指摘）
  const decks = (w.decks || []).slice().sort((a, b) => (b.uniq || 0) - (a.uniq || 0) || (b.games || 0) - (a.games || 0)).slice(0, 10);
  const wins = (w.winDecks || []).slice(0, 5);
  const archs = (w.meta || []).slice(0, 8);
  const cards = (w.cards || []).slice().sort((a, b) => (b.use || 0) - (a.use || 0)).slice(0, 10);
  if (decks.length < 5 || !uniqTotal) throw new Error('集計が少なすぎるので書き出さない（decks ' + decks.length + '件・人数 ' + uniqTotal + '）');
  const deckLine = d => d.slots.map((n, i) => cardLink(n, d.forms && d.forms[i], cat)).join(LANG === 'ja' ? '・' : ', ');
  const winMin = dk.winMin || 100;
  const out = [];
  out.push(START);
  out.push('<style>.static-summary a{color:#7db4ff;text-decoration:underline;text-decoration-color:rgba(125,180,255,.4)}.static-summary .static-list{padding-left:1.4em;margin:6px 0 12px}.static-summary .static-list li{margin:6px 0;line-height:1.7}.static-summary h3{font-size:15px;margin:16px 0 4px}</style>');
  out.push('<section class="page-guide static-summary" aria-label="' + esc(L('今日の環境のまとめ')) + '">');
  out.push('  <h2>' + esc(L('今日の環境のまとめ')) + '</h2>');
  out.push('  <p>' + esc(LF('ランク戦（伝説の道）の上位{top}人と、その対戦相手が直近3日に使ったデッキをまとめています。', { top: fmt(dk.topPlayers || 1000) }))
    + esc(LF('集計：{when}・{n}人・{g}試合。', { when: LANG === 'ja' ? jst(dk.updated) + '（日本時間）' : utc(dk.updated), n: fmt(uniqTotal), g: fmt(w.games) }))
    + esc(L('上の一覧は毎時の集計で変わり、この欄は1日1回書き直しています。')) + '</p>');
  out.push('  <h3>' + esc(L('使っている人が多いデッキ（上位10）')) + '</h3>');
  out.push('  <ol class="static-list">');
  for (const d of decks) {
    const share = uniqTotal ? (d.uniq / uniqTotal * 100) : 0;
    out.push('    <li><b>' + plainArch(d.arch || d.name) + '</b>' + (LANG === 'ja' ? '：' : ': ') + deckLine(d) + esc(LF('。{n}人が使用（{p}%）・{g}試合。', { n: fmt(d.uniq), p: share.toFixed(1), g: fmt(d.games) })) + '</li>');
  }
  out.push('  </ol>');
  if (wins.length) {
    out.push('  <h3>' + esc(LF('勝率の高いデッキ（{n}試合以上・上位5）', { n: fmt(winMin) })) + '</h3>');
    out.push('  <ol class="static-list">');
    for (const d of wins) out.push('    <li><b>' + plainArch(d.arch || d.name) + '</b>' + (LANG === 'ja' ? '：' : ': ') + deckLine(d) + esc(LF('。勝率{wr}%（{g}試合中{w}勝）。', { wr: Number(d.winRate).toFixed(1), g: fmt(d.games), w: fmt(d.wins) })) + '</li>');
    out.push('  </ol>');
  }
  if (archs.length) {
    out.push('  <h3>' + esc(L('環境で多い勝ち筋')) + '</h3>');
    out.push('  <ul class="static-list">');
    for (const a of archs) out.push('    <li>' + plainArch(a.k) + esc(LF('：環境シェア{s}%・勝率{wr}%（{g}試合）', { s: Number(a.share).toFixed(1), wr: Number(a.win).toFixed(1), g: fmt(a.games) })) + '</li>');
    out.push('  </ul>');
  }
  if (cards.length) {
    out.push('  <h3>' + esc(L('よく使われているカード（上位10）')) + '</h3>');
    out.push('  <ul class="static-list">');
    for (const c of cards) out.push('    <li>' + cardLink(c.name, c.f === 'e' ? 'evo' : c.f === 'h' ? 'hero' : 'norm', cat) + esc(LF('：使用率{u}%・勝率{wr}%（{g}試合）', { u: Number(c.use).toFixed(1), wr: Number(c.win).toFixed(1), g: fmt(c.games) })) + '</li>');
    out.push('  </ul>');
  }
  out.push('  <p>' + esc(LF('数え方：同じ8枚・同じ形態のデッキを1つとして数えています。人数は同じプレイヤーを1回だけ数えた数、試合数はそのデッキが使われた試合の数です。勝率は、試合数が少なくて極端な値にならないよう、{n}試合以上のデッキだけに出しています。数字は観測した試合からの集計で、すべての試合ではありません。', { n: fmt(winMin) })) + '</p>');
  out.push('</section>');
  out.push(END);
  return out.join('\n');
}

function write(html) {
  let page = fs.readFileSync(PAGE, 'utf8');
  const i = page.indexOf(START), j = page.indexOf(END);
  if (i >= 0 && j > i) page = page.slice(0, i) + html + page.slice(j + END.length);
  else {
    const k = page.indexOf(ANCHOR);
    if (k < 0) throw new Error('decks.html に差し込む場所（' + ANCHOR + '）が無い');
    page = page.slice(0, k) + html + '\n' + page.slice(k);
  }
  fs.writeFileSync(PAGE, page);
}

(async () => {
  const meta = arg('--meta') && arg('--meta') !== true ? JSON.parse(fs.readFileSync(arg('--meta'), 'utf8')) : await getJson(API);
  const html = build(meta, 'ja');
  write(html);
  const text = html.replace(/<[^>]+>/g, '').replace(/\s+/g, '');
  console.log('decks.html の「今日の環境のまとめ」を書き出した（本文 ' + text.length + '字）');
  // 各言語の版。言語ページには <!--JA-ONLY--> を付けずに入れる（gen-i18n が差し替える）
  const langs = {}, skipped = [];
  for (const lang of I18N.TARGETS) {
    const h = build(meta, lang);
    if (MISSING) { skipped.push(lang + '（訳の無い文 ' + MISSING + '）'); continue; }
    langs[lang] = h.replace(START, '<!--STATIC-DECKS-->').replace(END, '<!--/STATIC-DECKS-->');
  }
  fs.mkdirSync(path.dirname(OUT_LANGS), { recursive: true });
  fs.writeFileSync(OUT_LANGS, JSON.stringify({ updated: (meta.decks || {}).updated || null, langs }, null, 1) + '\n');
  console.log('各言語の版：' + Object.keys(langs).length + '言語' + (skipped.length ? '（書き出さなかった言語：' + skipped.join('・') + '）' : ''));
})().catch(e => { console.error('書き出しを止めた: ' + e.message); process.exit(1); });
