#!/usr/bin/env node
/*
 * Google Sheets「タグ」タブから card-tags.json を生成する依存ゼロツール。
 * GAS の exportTagSheetV2() と同じ列名ベースで読むため、列追加・並び替えに強い。
 *
 * 例:
 *   node tools/export-tags-from-sheet.js --out /tmp/card-tags.json
 */
const fs = require('fs');
const os = require('os');
const path = require('path');
const crypto = require('crypto');

const DEFAULT_SPREADSHEET_ID = '1cjX3ptT0g0qjfwhoTBKbzRfXGZUNGLy_jspMSRCDPyU';
const DEFAULT_SHEET_TITLE = 'タグ';
const DEFAULT_OUT = path.join(os.tmpdir(), 'card-tags.json');
const SCOPES = 'https://www.googleapis.com/auth/spreadsheets.readonly';
const KEY = {
  'タゲ取り:高HP': 'tgHp', 'タゲ取り:振り向き': 'tgKite', 'タゲ取り:建物': 'tgBuilding', 'タゲ取り:施設': 'tgBuilding',
  'タンク': 'tank', '中型タンク': 'minitank', '橋前スパム': 'bridgeSpam', '橋前特攻': 'bridgeSpam', '群れ': 'swarm',
  'タンクキラー': 'tankKiller', '防衛建物': 'defBuilding', '防衛施設': 'defBuilding', '呪文釣り': 'spellBait', '呪文枯渇': 'spellBait',
  'ユニット生成': 'spawner', 'エリクサー生成': 'collector', 'スタン': 'stun', '凍結・停止': 'stop', '減速': 'slow',
  'ノックバック': 'knockback', '引き寄せ': 'pull', '突進': 'charge', '盾持ち': 'shield', '回復': 'heal', 'バフ': 'buff',
  'デス時生成': 'deathSpawn', 'ダッシュ': 'dash', '透明': 'invisible', '範囲攻撃': 'splash', '対空': 'air', '飛行': 'flying',
  'ランプ(生存強化)': 'ramp'
};

function argValue(name, fallback) {
  const idx = process.argv.indexOf(name);
  return idx >= 0 && process.argv[idx + 1] ? process.argv[idx + 1] : fallback;
}
function b64url(input) {
  return Buffer.from(input).toString('base64').replace(/=/g, '').replace(/\+/g, '-').replace(/\//g, '_');
}
function str(value) { return String(value == null ? '' : value).trim(); }
function flag(value) {
  const v = str(value);
  return v === '○' || v === '◯' || v.toLowerCase() === 'o' || v === '1' || v.toLowerCase() === 'true';
}
async function requestJson(url, options = {}) {
  const res = await fetch(url, options);
  const text = await res.text();
  if (!res.ok) throw new Error((options.method || 'GET') + ' ' + url + ' -> ' + res.status + ' ' + text.slice(0, 240));
  return text ? JSON.parse(text) : null;
}
async function googleToken(keyPath) {
  const key = JSON.parse(fs.readFileSync(keyPath, 'utf8'));
  const now = Math.floor(Date.now() / 1000);
  const header = b64url(JSON.stringify({ alg: 'RS256', typ: 'JWT' }));
  const claim = b64url(JSON.stringify({
    iss: key.client_email,
    scope: SCOPES,
    aud: key.token_uri || 'https://oauth2.googleapis.com/token',
    iat: now,
    exp: now + 3600
  }));
  const unsigned = header + '.' + claim;
  const sig = crypto.createSign('RSA-SHA256').update(unsigned).sign(key.private_key);
  const body = new URLSearchParams({ grant_type: 'urn:ietf:params:oauth:grant-type:jwt-bearer', assertion: unsigned + '.' + b64url(sig) });
  return (await requestJson(key.token_uri || 'https://oauth2.googleapis.com/token', {
    method: 'POST', headers: { 'Content-Type': 'application/x-www-form-urlencoded' }, body
  })).access_token;
}
async function readSheetValues(spreadsheetId, sheetTitle, keyPath) {
  const token = await googleToken(keyPath);
  const range = encodeURIComponent(sheetTitle + '!A1:ZZ400');
  const url = 'https://sheets.googleapis.com/v4/spreadsheets/' + spreadsheetId + '/values/' + range + '?valueRenderOption=UNFORMATTED_VALUE';
  return (await requestJson(url, { headers: { Authorization: 'Bearer ' + token } })).values || [];
}
function buildJson(values) {
  if (!values.length) throw new Error('シートが空です');
  const headers = values[0].map(str);
  const nameCol = headers.indexOf('カード名');
  const memoCol = headers.indexOf('メモ');
  if (nameCol < 0) throw new Error('カード名列が見つかりません');
  const tagCols = [];
  headers.forEach((h, idx) => { if (KEY[h]) tagCols.push([idx, KEY[h]]); });
  if (!tagCols.length) throw new Error('タグ列が見つかりません');
  const cards = {};
  for (const row of values.slice(1)) {
    const name = str(row[nameCol]);
    if (!name) continue;
    const tags = [];
    for (const [idx, key] of tagCols) if (flag(row[idx])) tags.push(key);
    const memo = memoCol >= 0 ? str(row[memoCol]) : '';
    cards[name] = memo ? { tags, memo } : { tags };
  }
  const count = Object.keys(cards).length;
  if (count < 100) throw new Error('カード数が少なすぎます: ' + count);
  return { updated: new Date().toISOString(), source: 'タグ表v2', count, cards };
}
async function main() {
  const spreadsheetId = argValue('--spreadsheet', process.env.SPREADSHEET_ID || DEFAULT_SPREADSHEET_ID);
  const sheetTitle = argValue('--sheet', process.env.SHEET_TITLE || DEFAULT_SHEET_TITLE);
  const outPath = argValue('--out', process.env.OUT || DEFAULT_OUT);
  const keyPath = process.env.GOOGLE_APPLICATION_CREDENTIALS || path.join(os.homedir(), '.config/crdb/google-service-account.json');
  const out = buildJson(await readSheetValues(spreadsheetId, sheetTitle, keyPath));
  fs.writeFileSync(outPath, JSON.stringify(out), 'utf8');
  console.log('wrote ' + outPath + ' cards=' + out.count + ' bytes=' + fs.statSync(outPath).size);
}
main().catch(err => { console.error(err.stack || err.message); process.exit(1); });
