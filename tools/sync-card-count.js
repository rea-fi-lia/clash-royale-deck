#!/usr/bin/env node
/*
 * 説明文のカード枚数を、共通台帳（catalogue/cards.json）の枚数にそろえる。
 *
 * ★2026-10-12：日本語と17言語の説明文に「全121枚」「all 121 cards」が手書きで残り、台帳（123枚）と食い違っていた。
 *   訳語の表（tools/i18n-content）は日本語の文そのものを見出しにしているので、日本語だけ直すと訳が引けなくなる。
 *   そこで、決まったファイルの中の「いま書かれている枚数」をまとめて台帳の枚数へ置き換える。
 *
 * いま書かれている枚数は index.html の <meta name="description"> の「全N枚」から読む。
 * 置き換えるのは、その数ちょうど（前後が数字でない）だけ。置き換えた場所は全部ログに出す。
 * 言語ページの生成（tools/gen-i18n.js）が毎回これを呼ぶので、毎日のカード更新でも自動でそろう。
 *
 * 使い方: node tools/sync-card-count.js          … そろえる
 *         node tools/sync-card-count.js --check  … 書き換えず、食い違っていれば終了コード1
 */
const fs = require('fs');
const path = require('path');

const ROOT = path.join(__dirname, '..');
const TARGETS = ['index.html', 'strategy.html', 'i18n.js'];
const CONTENT_DIR = path.join('tools', 'i18n-content');

function cardCount() {
  return JSON.parse(fs.readFileSync(path.join(ROOT, 'catalogue', 'cards.json'), 'utf8')).cards.length;
}

function writtenCount() {
  const html = fs.readFileSync(path.join(ROOT, 'index.html'), 'utf8');
  const meta = html.match(/<meta\s+name="description"\s+content="([^"]*)"/i);
  const m = meta && meta[1].match(/全(\d+)枚/);
  return m ? Number(m[1]) : null;
}

function targetFiles() {
  const list = TARGETS.slice();
  const dir = path.join(ROOT, CONTENT_DIR);
  if (fs.existsSync(dir)) {
    for (const f of fs.readdirSync(dir).sort()) if (f.endsWith('.json')) list.push(path.join(CONTENT_DIR, f));
  }
  return list.filter(f => fs.existsSync(path.join(ROOT, f)));
}

function sync({ check = false, log = console.log } = {}) {
  const want = cardCount();
  const have = writtenCount();
  if (have == null) { log('  – 説明文の枚数（index.html の「全N枚」）が見つからないので省略'); return { changed: 0, want, have }; }
  if (have === want) return { changed: 0, want, have };
  if (check) { log('  ✗ 説明文の枚数 ' + have + ' が台帳の ' + want + ' と違う → node tools/sync-card-count.js'); return { changed: -1, want, have }; }
  const re = new RegExp('(?<![0-9])' + have + '(?![0-9])', 'g');
  let changed = 0;
  for (const rel of targetFiles()) {
    const p = path.join(ROOT, rel);
    const src = fs.readFileSync(p, 'utf8');
    let n = 0;
    const out = src.replace(re, (m, off) => {
      n++;
      log('  ' + rel + ': …' + src.slice(Math.max(0, off - 16), off + 20).replace(/\s+/g, ' ') + '…');
      return String(want);
    });
    if (n) { fs.writeFileSync(p, out); changed += n; }
  }
  log('説明文の枚数を ' + have + ' → ' + want + ' にそろえた（' + changed + 'か所）');
  return { changed, want, have };
}

module.exports = { sync, cardCount };

if (require.main === module) {
  const r = sync({ check: process.argv.includes('--check') });
  process.exit(r.changed < 0 ? 1 : 0);
}
