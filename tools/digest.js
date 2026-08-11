#!/usr/bin/env node
/*
 * 日次サマリー（2026-08-11）
 *
 * 「落ちたら鳴る」だけだと、静かなときに何も返ってこない。
 * 1日1回、数字を返す。増減が見えるように前日の値と比べる。
 *
 *   node tools/digest.js [--state tools/.digest-state.json]
 *
 * 送り先は notify.js に委ねる（Secretが未設定なら黙ってスキップ）。
 */
const fs = require('fs');
const { execFileSync } = require('child_process');

const args = process.argv.slice(2);
const argOne = (n) => { const i = args.indexOf(n); return i >= 0 && args[i + 1] ? args[i + 1] : null; };
const STATE = argOne('--state') || 'tools/.digest-state.json';
const BASE = argOne('--base') || 'https://crdeckbuilders.com';

const num = (n) => (n == null ? '—' : Number(n).toLocaleString('ja-JP'));
// 前日比。増減が無ければ何も出さない（ノイズを減らす）
function delta(now, before) {
  if (now == null || before == null) return '';
  const d = now - before;
  if (!d) return '';
  return ' (' + (d > 0 ? '+' : '') + num(d) + ')';
}
function pad2(s, w) { // 全角を2幅として数える
  let width = 0;
  for (const ch of String(s)) width += /[　-ヿ一-鿿＀-｠]/.test(ch) ? 2 : 1;
  return String(s) + ' '.repeat(Math.max(0, w - width));
}

(async () => {
  const res = await fetch(BASE + '/api/meta?cb=' + Math.floor(Date.now() / 1000));
  if (!res.ok) throw new Error('/api/meta が ' + res.status);
  const m = await res.json();

  const now = {
    games: m.decks?.games,
    players: m.decks?.players,
    uniquePlayers: m.decks?.uniquePlayers,
    playersPerRun: m.decks?.playersPerRun,
    bands: Object.keys(m.trophyBandIntel?.byBand || {}).length,
    bandEvents: m.trophyBandIntel?.count,
    cards: m.polCardIntel?.count,
    at: new Date().toISOString()
  };

  let before = {};
  try { before = JSON.parse(fs.readFileSync(STATE, 'utf8')); } catch (_) { /* 初回 */ }

  const updated = new Date(m.decks?.updated || 0);
  const ageMin = Math.round((Date.now() - updated.getTime()) / 60000);
  const jst = new Date(updated.getTime() + 9 * 3600e3).toISOString().slice(5, 16).replace('T', ' ');
  const stale = ageMin > 90; // 毎時なので90分を超えたら異常

  const lines = [
    pad2('収集した試合', 16) + num(now.games) + '戦' + delta(now.games, before.games),
    pad2('見たプレイヤー', 16) + num(now.players) + '人' + delta(now.players, before.players),
    pad2('毎時の新規', 16) + num(now.playersPerRun) + '人/回' + delta(now.playersPerRun, before.playersPerRun),
    pad2('トロフィー帯', 16) + now.bands + '/47 帯' + (now.bands < 47 ? ' ⚠️' : ''),
    pad2('帯データ', 16) + num(now.bandEvents) + '件' + delta(now.bandEvents, before.bandEvents),
    pad2('カード', 16) + num(now.cards) + '枚' + (now.cards < 122 ? ' ⚠️' : ''),
    pad2('最終更新', 16) + jst + ' JST（' + ageMin + '分前）' + (stale ? ' ⚠️停止の疑い' : '')
  ];

  const title = (stale || now.bands < 47 ? '⚠️' : '📊') + ' CRDB 日次サマリー';
  const body = lines.join('\n');
  console.log(title + '\n' + body);

  fs.writeFileSync(STATE, JSON.stringify(now, null, 2));

  try {
    execFileSync('node', ['tools/notify.js', '--level', stale ? 'error' : 'ok', '--title', title, '--body', body],
      { stdio: 'inherit' });
  } catch (e) {
    console.error('通知に失敗: ' + ((e && e.message) || e));
  }
})().catch((e) => { console.error(e.message || e); process.exit(1); });
