#!/usr/bin/env node
/*
 * 人気デッキのページ（decks.html）に「今日の環境のまとめ」を静的なHTMLで書き出す。
 *
 * ★2026-10-12：AdSense が「有用性の低いコンテンツ」で不承認（2026-08-21）。主な中身（デッキの一覧・数字）が
 *   JavaScript で後から描かれ、静的なHTMLの本文は約800字しかなかった。審査がJavaScriptを実行する保証は無く、
 *   Google 検索も事前の描画を勧めている。そこで、毎時の集計から主な数字を1日1回この欄に書き出す。
 *   画面に出ている数字の要約だけを載せる（新しい生データは出さない・クローラーにだけ見せる内容は作らない）。
 *
 * 日本語のページだけの欄（<!--JA-ONLY--> で囲む）。言語ページでは gen-i18n が外す。
 * 使い方: node tools/build-static-content.js --from-api        … 本番の /api/meta から
 *         node tools/build-static-content.js --meta <file.json> … 手元の JSON から
 */
const fs = require('fs');
const path = require('path');
const https = require('https');

const ROOT = path.join(__dirname, '..');
const PAGE = path.join(ROOT, 'decks.html');
const START = '<!--JA-ONLY--><!--STATIC-DECKS-->';
const END = '<!--/STATIC-DECKS--><!--/JA-ONLY-->';
const ANCHOR = '<section class="page-guide">';
const API = 'https://crdeckbuilders.com/api/meta';

const arg = k => { const i = process.argv.indexOf(k); return i >= 0 ? (process.argv[i + 1] || true) : null; };
const esc = s => String(s == null ? '' : s).replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
const fmt = n => Number(n || 0).toLocaleString('ja-JP');

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

// 形態は絵文字でなく文字で書く（UIアイコンの点検に合わせる）
const FORM = { evo: '（進化）', hero: '（ヒーロー）' };
function cardLink(name, form, cat) {
  const c = cat.get(name);
  const label = esc(name) + (FORM[form] || '');
  return c && c.slug ? '<a href="cards/' + esc(c.slug) + '.html">' + label + '</a>' : label;
}
const plainArch = a => esc(String(a || '').replace(/⚡️?/gu, '（進化）').replace(/\u{1F451}️?/gu, '（ヒーロー）'));

function jst(iso) {
  const d = new Date(iso);
  if (isNaN(d)) return '';
  const j = new Date(d.getTime() + 9 * 3600 * 1000);
  const p = n => String(n).padStart(2, '0');
  return j.getUTCFullYear() + '年' + (j.getUTCMonth() + 1) + '月' + j.getUTCDate() + '日 ' + p(j.getUTCHours()) + ':' + p(j.getUTCMinutes());
}

function build(meta) {
  const dk = meta.decks || {};
  const w = (dk.windows && dk.windows[dk.defaultWindow || '3d']) || dk;
  const cat = catalogue();
  const uniqTotal = w.uniquePlayers || dk.uniquePlayers || 0;
  // 表示する「◯人が使用」と並び順をそろえる（APIの並びは延べの観測数の順で、人数の順と食い違う所がある・2026-10-12 Codex の指摘）
  const decks = (w.decks || []).slice().sort((a, b) => (b.uniq || 0) - (a.uniq || 0) || (b.games || 0) - (a.games || 0)).slice(0, 10);
  const wins = (w.winDecks || []).slice(0, 5);
  const archs = (w.meta || []).slice(0, 8);
  const cards = (w.cards || []).slice().sort((a, b) => (b.use || 0) - (a.use || 0)).slice(0, 10);
  if (decks.length < 5 || !uniqTotal) throw new Error('集計が少なすぎるので書き出さない（decks ' + decks.length + '件・人数 ' + uniqTotal + '）');
  const deckLine = d => d.slots.map((n, i) => cardLink(n, d.forms && d.forms[i], cat)).join('・');
  const winMin = dk.winMin || 100;
  const out = [];
  out.push(START);
  out.push('<style>.static-summary a{color:#7db4ff;text-decoration:underline;text-decoration-color:rgba(125,180,255,.4)}.static-summary .static-list{padding-left:1.4em;margin:6px 0 12px}.static-summary .static-list li{margin:6px 0;line-height:1.7}.static-summary h3{font-size:15px;margin:16px 0 4px}</style>');
  out.push('<section class="page-guide static-summary" aria-label="今日の環境のまとめ">');
  out.push('  <h2>今日の環境のまとめ</h2>');
  out.push('  <p>ランク戦（伝説の道）の上位' + fmt(dk.topPlayers || 1000) + '人と、その対戦相手が直近3日に使ったデッキをまとめています。集計：' + esc(jst(dk.updated)) + '（日本時間）・' + fmt(uniqTotal) + '人・' + fmt(w.games) + '試合。上の一覧は毎時の集計で変わり、この欄は1日1回書き直しています。</p>');
  out.push('  <h3>使っている人が多いデッキ（上位10）</h3>');
  out.push('  <ol class="static-list">');
  for (const d of decks) {
    const share = uniqTotal ? (d.uniq / uniqTotal * 100) : 0;
    out.push('    <li><b>' + plainArch(d.arch || d.name) + '</b>：' + deckLine(d) + '。' + fmt(d.uniq) + '人が使用（' + share.toFixed(1) + '%）・' + fmt(d.games) + '試合。</li>');
  }
  out.push('  </ol>');
  if (wins.length) {
    out.push('  <h3>勝率の高いデッキ（' + fmt(winMin) + '試合以上・上位5）</h3>');
    out.push('  <ol class="static-list">');
    for (const d of wins) out.push('    <li><b>' + plainArch(d.arch || d.name) + '</b>：' + deckLine(d) + '。勝率' + Number(d.winRate).toFixed(1) + '%（' + fmt(d.games) + '試合中' + fmt(d.wins) + '勝）。</li>');
    out.push('  </ol>');
  }
  if (archs.length) {
    out.push('  <h3>環境で多い勝ち筋</h3>');
    out.push('  <ul class="static-list">');
    for (const a of archs) out.push('    <li>' + plainArch(a.k) + '：環境シェア' + Number(a.share).toFixed(1) + '%・勝率' + Number(a.win).toFixed(1) + '%（' + fmt(a.games) + '試合）</li>');
    out.push('  </ul>');
  }
  if (cards.length) {
    out.push('  <h3>よく使われているカード（上位10）</h3>');
    out.push('  <ul class="static-list">');
    for (const c of cards) out.push('    <li>' + cardLink(c.name, c.f === 'e' ? 'evo' : c.f === 'h' ? 'hero' : 'norm', cat) + '：使用率' + Number(c.use).toFixed(1) + '%・勝率' + Number(c.win).toFixed(1) + '%（' + fmt(c.games) + '試合）</li>');
    out.push('  </ul>');
  }
  out.push('  <p>数え方：同じ8枚・同じ形態のデッキを1つとして数えています。人数は同じプレイヤーを1回だけ数えた数、試合数はそのデッキが使われた試合の数です。勝率は、試合数が少なくて極端な値にならないよう、' + fmt(winMin) + '試合以上のデッキだけに出しています。数字は観測した試合からの集計で、すべての試合ではありません。</p>');
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
  const html = build(meta);
  write(html);
  const text = html.replace(/<[^>]+>/g, '').replace(/\s+/g, '');
  console.log('decks.html の「今日の環境のまとめ」を書き出した（本文 ' + text.length + '字）');
})().catch(e => { console.error('書き出しを止めた: ' + e.message); process.exit(1); });
