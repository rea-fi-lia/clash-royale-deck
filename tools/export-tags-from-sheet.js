#!/usr/bin/env node
/*
 * Google Sheets「タグ」タブから card-tags.json を生成する依存ゼロツール。
 * GAS の exportTagSheetV2() と同じ列名ベースで読むため、列追加・並び替えに強い。
 *
 * 例:
 *   node tools/export-tags-from-sheet.js --out /tmp/card-tags.json [--publish --verify]
 */
const fs = require('fs');
const os = require('os');
const path = require('path');
const crypto = require('crypto');

const DEFAULT_SPREADSHEET_ID = '1cjX3ptT0g0qjfwhoTBKbzRfXGZUNGLy_jspMSRCDPyU';
const DEFAULT_SHEET_TITLE = 'タグ';
const DEFAULT_OUT = path.join(os.tmpdir(), 'card-tags.json');
const SCOPES = 'https://www.googleapis.com/auth/spreadsheets.readonly';
// ★2026-08-11: シートで監修したタグを本番へ届ける経路が無く、R2のcard-tags.jsonが
//   シートから取り残されていた（ポテンシャルには経路があったのにタグには無かった）。
const KEY = {
  'タゲ取り:高HP': 'tgHp', 'タゲ取り:振り向き': 'tgKite', 'タゲ取り:建物': 'tgBuilding', 'タゲ取り:施設': 'tgBuilding',
  'タンク': 'tank', '中型タンク': 'minitank', '橋前スパム': 'bridgeSpam', '橋前特攻': 'bridgeSpam', '群れ': 'swarm',
  'タンクキラー': 'tankKiller', '防衛建物': 'defBuilding', '防衛施設': 'defBuilding', '呪文釣り': 'spellBait', '呪文枯渇': 'spellBait',
  'ユニット生成': 'spawner', 'エリクサー生成': 'collector', 'スタン': 'stun', '凍結・停止': 'stop', '減速': 'slow',
  'ノックバック': 'knockback', '引き寄せ': 'pull', '突進': 'charge', '盾持ち': 'shield', '回復': 'heal', 'バフ': 'buff',
  'デス時生成': 'deathSpawn', 'ダッシュ': 'dash', '透明': 'invisible', '範囲攻撃': 'splash', '対空': 'air', '飛行': 'flying',
  'ランプ(生存強化)': 'ramp'
};

const { execFileSync } = require('child_process');

const R2_ACCOUNT_ID = process.env.R2_ACCOUNT_ID || '';
const R2_ACCESS_KEY_ID = process.env.R2_ACCESS_KEY_ID || '';
const R2_SECRET_ACCESS_KEY = process.env.R2_SECRET_ACCESS_KEY || '';
const R2_BUCKET = process.env.R2_BUCKET || 'crdb-data-private';
const R2_PRIVATE_PREFIX = process.env.R2_PRIVATE_PREFIX || 'private/';
const R2_CONFIGURED = !!(R2_ACCOUNT_ID && R2_ACCESS_KEY_ID && R2_SECRET_ACCESS_KEY && R2_BUCKET);
const PUBLIC_GH_MIRROR = process.env.PUBLIC_GH_MIRROR === '1';
const sleep = ms => new Promise(r => setTimeout(r, ms));
function b64(x) { return Buffer.from(x, 'utf8').toString('base64'); }
function hasArg(name) { return process.argv.includes(name); }

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
function comparableJson(text) {
  const obj = JSON.parse(text);
  delete obj.updated;
  return JSON.stringify(obj);
}
function githubToken() {
  if (process.env.GITHUB_TOKEN) return process.env.GITHUB_TOKEN;
  if (process.env.GH_TOKEN) return process.env.GH_TOKEN;
  try { return execFileSync('gh', ['auth', 'token'], { encoding: 'utf8' }).trim(); } catch (e) { return ''; }
}
function r2ObjectKey(target) {
  let prefix = String(R2_PRIVATE_PREFIX || '').replace(/^\/+/, '');
  if (prefix && !prefix.endsWith('/')) prefix += '/';
  return prefix + String(target || '').replace(/^\/+/, '');
}
function r2IsoStamp() { return new Date().toISOString().replace(/[:-]|\.\d{3}/g, ''); }
function r2Sha256Hex(value) { return crypto.createHash('sha256').update(value || '').digest('hex'); }
function r2Hmac(key, msg, enc) { return crypto.createHmac('sha256', key).update(msg).digest(enc); }
function r2SigningKey(date) {
  const kDate = r2Hmac(Buffer.from('AWS4' + R2_SECRET_ACCESS_KEY, 'utf8'), date);
  const kRegion = r2Hmac(kDate, 'auto');
  const kService = r2Hmac(kRegion, 's3');
  return r2Hmac(kService, 'aws4_request');
}
function r2EncodeKey(key) { return String(key || '').split('/').map(encodeURIComponent).join('/'); }
async function r2Request(method, target, body, contentType) {
  if (!R2_CONFIGURED) return { status: 0, text: async () => '' };
  const key = r2ObjectKey(target);
  const host = R2_ACCOUNT_ID + '.r2.cloudflarestorage.com';
  const pathname = '/' + encodeURIComponent(R2_BUCKET) + '/' + r2EncodeKey(key);
  const payload = body == null ? '' : body;
  const payloadHash = r2Sha256Hex(payload);
  const amzDate = r2IsoStamp();
  const date = amzDate.slice(0, 8);
  const headers = { host, 'x-amz-content-sha256': payloadHash, 'x-amz-date': amzDate };
  if (contentType) headers['content-type'] = contentType;
  const signedHeaders = Object.keys(headers).sort().join(';');
  const canonicalHeaders = Object.keys(headers).sort().map(h => h + ':' + headers[h] + '\n').join('');
  const canonicalRequest = [method, pathname, '', canonicalHeaders, signedHeaders, payloadHash].join('\n');
  const scope = date + '/auto/s3/aws4_request';
  const stringToSign = ['AWS4-HMAC-SHA256', amzDate, scope, r2Sha256Hex(canonicalRequest)].join('\n');
  const signature = r2Hmac(r2SigningKey(date), stringToSign, 'hex');
  headers.authorization = 'AWS4-HMAC-SHA256 Credential=' + R2_ACCESS_KEY_ID + '/' + scope + ', SignedHeaders=' + signedHeaders + ', Signature=' + signature;
  return fetch('https://' + host + pathname, { method, headers, body: payload || undefined });
}
async function r2WriteJson(target, out) {
  const body = JSON.stringify(out);
  let lastErr = null;
  for (let attempt = 0; attempt < 3; attempt++) {
    try {
      const res = await r2Request('PUT', target, body, 'application/json; charset=utf-8');
      if (res.status >= 200 && res.status < 300) return true;
      if (res.status >= 500) { lastErr = new Error('R2 write ' + target + ' ' + res.status); await sleep(400 * (attempt + 1)); continue; }
      throw new Error('R2 write ' + target + ' ' + res.status + ' :: ' + (await res.text()).slice(0, 240));
    } catch (e) { lastErr = e; await sleep(400 * (attempt + 1)); }
  }
  throw lastErr || new Error('R2 write ' + target + ' failed');
}
async function r2ReadJson(target) {
  const res = await r2Request('GET', target, null, null);
  if (res.status !== 200) throw new Error('R2 read ' + target + ' ' + res.status + ' :: ' + (await res.text()).slice(0, 240));
  return JSON.parse(await res.text());
}
async function publishGitHubJson(out, filePath, targetOverride) {
  const token = githubToken();
  if (!token) throw new Error('--publish には GITHUB_TOKEN / GH_TOKEN、または gh auth が必要です');
  const repo = process.env.GITHUB_REPOSITORY || process.env.GITHUB_REPO || 'rea-fi-lia/clash-royale-deck';
  const branch = process.env.GITHUB_BRANCH || process.env.DATA_BRANCH || 'data';
  const target = targetOverride || process.env.TAGS_PATH || 'card-tags.json';
  const api = 'https://api.github.com/repos/' + repo + '/contents/' + target;
  const headers = { Authorization: 'Bearer ' + token, Accept: 'application/vnd.github+json', 'User-Agent': 'crdb-tags-export', 'Content-Type': 'application/json' };
  let sha = null;
  let currentText = '';
  try {
    const cur = await requestJson(api + '?ref=' + encodeURIComponent(branch), { headers: { ...headers, Accept: 'application/vnd.github.object' } });
    sha = cur && cur.sha;
    if (cur && cur.content) currentText = Buffer.from(String(cur.content).replace(/\s/g, ''), 'base64').toString('utf8');
  } catch (e) { if (!String(e.message).includes('-> 404 ')) throw e; }
  const nextText = fs.readFileSync(filePath, 'utf8');
  if (currentText) {
    try { if (comparableJson(currentText) === comparableJson(nextText)) return { repo, branch, target, commit: sha, skipped: true }; } catch (e) {}
  }
  const body = { message: 'chore: update ' + target, content: b64(nextText), branch };
  if (sha) body.sha = sha;
  const res = await requestJson(api, { method: 'PUT', headers, body: JSON.stringify(body) });
  return { repo, branch, target, commit: res && res.commit && res.commit.sha };
}
async function publishJson(out, filePath, target) {
  if (R2_CONFIGURED) {
    await r2WriteJson(target, out);
    const gh = PUBLIC_GH_MIRROR ? await publishGitHubJson(out, filePath, target) : null;
    return { r2: true, bucket: R2_BUCKET, key: r2ObjectKey(target), target, gh };
  }
  return publishGitHubJson(out, filePath, target);
}
async function verifyPublished(pub) {
  const repo = pub.repo || process.env.GITHUB_REPOSITORY || process.env.GITHUB_REPO || 'rea-fi-lia/clash-royale-deck';
  const branch = pub.branch || process.env.GITHUB_BRANCH || process.env.DATA_BRANCH || 'data';
  const target = pub.target || process.env.TAGS_PATH || 'card-tags.json';
  const data = pub.r2 ? await r2ReadJson(target) : await requestJson('https://raw.githubusercontent.com/' + repo + '/' + branch + '/' + target + '?cb=' + Date.now());
  const cards = (data && data.cards) || {};
  if (!data || data.count < 100 || Object.keys(cards).length < 100) throw new Error('verify failed: cards=' + (data && data.count));
  // タグが全滅していないか（シート読み違いの安全弁）
  const tagged = Object.keys(cards).filter(k => (cards[k].tags || []).length).length;
  if (tagged < 100) throw new Error('verify failed: タグ付き行が ' + tagged + '件しかない');
  console.log('verified ' + (pub.r2 ? ('R2 ' + pub.bucket + '/' + pub.key) : 'raw') + ' count=' + data.count + ' tagged=' + tagged + ' updated=' + (data.updated || '-'));
}
function publishSummary(pub) {
  if (pub.r2) return 'published R2 ' + pub.bucket + '/' + pub.key + (pub.gh ? ' + GitHub mirror commit=' + (pub.gh.commit || '-') : '');
  return (pub.skipped ? 'up-to-date ' : 'published ') + pub.repo + '/' + pub.target + ' branch=' + pub.branch + ' commit=' + (pub.commit || '-');
}
async function main() {
  const spreadsheetId = argValue('--spreadsheet', process.env.SPREADSHEET_ID || DEFAULT_SPREADSHEET_ID);
  const sheetTitle = argValue('--sheet', process.env.SHEET_TITLE || DEFAULT_SHEET_TITLE);
  const outPath = argValue('--out', process.env.OUT || DEFAULT_OUT);
  const keyPath = process.env.GOOGLE_APPLICATION_CREDENTIALS || path.join(os.homedir(), '.config/crdb/google-service-account.json');
  const target = argValue('--target', process.env.TAGS_PATH || 'card-tags.json');
  const out = buildJson(await readSheetValues(spreadsheetId, sheetTitle, keyPath));
  fs.writeFileSync(outPath, JSON.stringify(out), 'utf8');
  console.log('wrote ' + outPath + ' cards=' + out.count + ' bytes=' + fs.statSync(outPath).size);
  let pub = { repo: process.env.GITHUB_REPOSITORY || process.env.GITHUB_REPO || 'rea-fi-lia/clash-royale-deck', branch: process.env.GITHUB_BRANCH || process.env.DATA_BRANCH || 'data', target, r2: R2_CONFIGURED, bucket: R2_BUCKET, key: r2ObjectKey(target) };
  if (hasArg('--publish')) { pub = await publishJson(out, outPath, target); console.log(publishSummary(pub)); }
  if (hasArg('--verify')) await verifyPublished(pub);
}
main().catch(err => { console.error(err.stack || err.message); process.exit(1); });
