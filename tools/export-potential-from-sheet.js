#!/usr/bin/env node
/*
 * Google Sheets「ポテンシャル」タブから card-potential.json を生成する依存ゼロツール。
 * GAS の exportPotentialV1() と同じ列名ベースで読むため、列追加・並び替えに強い。
 *
 * 例:
 *   node tools/export-potential-from-sheet.js --out /tmp/card-potential.json
 *   node tools/export-potential-from-sheet.js --out /tmp/card-potential.json --publish --verify
 *
 * 必要なもの:
 *   - GOOGLE_APPLICATION_CREDENTIALS（未指定なら ~/.config/crdb/google-service-account.json）
 *   - --publish 時は R2_* secrets があれば Cloudflare R2 へ保存
 *   - R2未設定時、または PUBLIC_GH_MIRROR=1 時は GITHUB_TOKEN / GH_TOKEN、または gh auth token
 */
const fs = require('fs');
const os = require('os');
const path = require('path');
const crypto = require('crypto');
const { execFileSync } = require('child_process');

const DEFAULT_SPREADSHEET_ID = '1cjX3ptT0g0qjfwhoTBKbzRfXGZUNGLy_jspMSRCDPyU';
const DEFAULT_SHEET_TITLE = 'ポテンシャル';
const DEFAULT_OUT = path.join(os.tmpdir(), 'card-potential.json');
const SCOPES = 'https://www.googleapis.com/auth/spreadsheets.readonly';
const R2_ACCOUNT_ID = process.env.R2_ACCOUNT_ID || '';
const R2_ACCESS_KEY_ID = process.env.R2_ACCESS_KEY_ID || '';
const R2_SECRET_ACCESS_KEY = process.env.R2_SECRET_ACCESS_KEY || '';
const R2_BUCKET = process.env.R2_BUCKET || 'crdb-data-private';
const R2_PRIVATE_PREFIX = process.env.R2_PRIVATE_PREFIX || 'private/';
const R2_CONFIGURED = !!(R2_ACCOUNT_ID && R2_ACCESS_KEY_ID && R2_SECRET_ACCESS_KEY && R2_BUCKET);
const PUBLIC_GH_MIRROR = String(process.env.PUBLIC_GH_MIRROR || (R2_CONFIGURED ? '0' : '1')) === '1';

function argValue(name, fallback) {
  const idx = process.argv.indexOf(name);
  return idx >= 0 && process.argv[idx + 1] ? process.argv[idx + 1] : fallback;
}
function hasArg(name) { return process.argv.includes(name); }
function sleep(ms) { return new Promise(resolve => setTimeout(resolve, ms)); }
function b64url(input) {
  return Buffer.from(input).toString('base64').replace(/=/g, '').replace(/\+/g, '-').replace(/\//g, '_');
}
function b64(input) { return Buffer.from(input).toString('base64'); }
function numOf(value) {
  const n = parseFloat(value);
  return Number.isFinite(n) ? n : null;
}
function strOf(value) { return String(value == null ? '' : value).trim(); }
function flagOf(value) {
  const s = strOf(value);
  return s === '〇' || s === '◯' || s === '○' || s === '●' || s === '✓' || s === 'v' || s === 'V' || s === '1' || s === 'TRUE' || s === 'true';
}
function findCol(headers, name) {
  return headers.findIndex(h => h.startsWith(name));
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
  const assertion = unsigned + '.' + b64url(sig);
  const body = new URLSearchParams({ grant_type: 'urn:ietf:params:oauth:grant-type:jwt-bearer', assertion });
  const token = await requestJson(key.token_uri || 'https://oauth2.googleapis.com/token', {
    method: 'POST',
    headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
    body
  });
  return token.access_token;
}
async function readSheetValues(spreadsheetId, sheetTitle, keyPath) {
  const token = await googleToken(keyPath);
  const range = encodeURIComponent(sheetTitle + '!A1:ZZ400');
  const url = 'https://sheets.googleapis.com/v4/spreadsheets/' + spreadsheetId + '/values/' + range + '?valueRenderOption=UNFORMATTED_VALUE';
  const data = await requestJson(url, { headers: { Authorization: 'Bearer ' + token } });
  return data.values || [];
}
function requireCol(headers, name) {
  const idx = findCol(headers, name);
  if (idx < 0) throw new Error('必要な列が見つかりません: ' + name);
  return idx;
}
function optionalCol(headers, name) { return findCol(headers, name); }
function buildJson(values) {
  if (!values.length) throw new Error('シートが空です');
  const headers = values[0].map(v => strOf(v));
  const cName = requireCol(headers, 'カード名');
  const cHp = requireCol(headers, 'HP効率');
  const cDps = requireCol(headers, 'DPS効率');
  const cSp = requireCol(headers, '呪文ダメ効率');
  const cCt = requireCol(headers, '呪文タワー効率');
  const c1 = optionalCol(headers, '1倍適性');
  const c2 = optionalCol(headers, '2倍適性');
  const c3 = optionalCol(headers, '3倍適性');
  const cKi = optionalCol(headers, 'キラー');
  const cSc = optionalCol(headers, 'スケーリング型');
  const cPa = optionalCol(headers, '噛み合う相手');
  const cSo = optionalCol(headers, '素出し適性');
  const cSep = optionalCol(headers, 'セパレート適性');
  const cMe = optionalCol(headers, 'メモ');
  const cWc = optionalCol(headers, '勝ち筋');
  const cWc2 = optionalCol(headers, '第2勝ち筋');
  const cWc3 = optionalCol(headers, '補助勝ち筋');
  const cWcCombo = optionalCol(headers, '組んだら勝ち筋');
  const cChip = optionalCol(headers, '削り役');
  const cBrk = optionalCol(headers, '突破補助');
  const cSpS = optionalCol(headers, '呪文勝ち筋補助');
  const cDefS = optionalCol(headers, '防衛起点');
  const cCnt = optionalCol(headers, 'カウンター起点');
  const cTol = optionalCol(headers, '被ダメ許容');
  const cT1 = optionalCol(headers, '1倍向き');
  const cT2 = optionalCol(headers, '2倍向き');
  const cT3 = optionalCol(headers, '延長向き');
  const cards = {};
  for (const row of values.slice(1)) {
    const name = strOf(row[cName]);
    if (!name) continue;
    const card = {
      hpEff: numOf(row[cHp]),
      dpsEff: numOf(row[cDps]),
      spellEff: numOf(row[cSp]),
      towerEff: numOf(row[cCt]),
      phase: [c1 >= 0 ? strOf(row[c1]) : '', c2 >= 0 ? strOf(row[c2]) : '', c3 >= 0 ? strOf(row[c3]) : ''],
      killer: cKi >= 0 ? strOf(row[cKi]) : '',
      scaling: cSc >= 0 ? strOf(row[cSc]) : '',
      partner: cPa >= 0 ? strOf(row[cPa]) : '',
      solo: cSo >= 0 ? strOf(row[cSo]) : '',
      sep: cSep >= 0 ? strOf(row[cSep]) : ''
    };
    const memo = cMe >= 0 ? strOf(row[cMe]) : '';
    if (memo) card.memo = memo;
    const flags = [];
    if (cWc >= 0 && flagOf(row[cWc])) flags.push('勝ち筋');
    if (cWc2 >= 0 && flagOf(row[cWc2])) flags.push('第2勝ち筋');
    if (cWc3 >= 0 && flagOf(row[cWc3])) flags.push('補助勝ち筋');
    if (flags.length) card.winconFlags = flags;
    if (cWcCombo >= 0 && flagOf(row[cWcCombo])) card.comboWincon = true;
    if (cChip >= 0 && flagOf(row[cChip])) card.damageRole = true;
    if (cBrk >= 0 && flagOf(row[cBrk])) card.breakthroughSupport = true;
    if (cSpS >= 0 && flagOf(row[cSpS])) card.spellWinconSupport = true;
    if (cDefS >= 0 && flagOf(row[cDefS])) card.defenseStarter = true;
    if (cCnt >= 0 && flagOf(row[cCnt])) card.counterStarter = true;
    if (cTol >= 0) { const v = numOf(row[cTol]); if (v != null) card.tolerance = v; }
    if (cT1 >= 0) { const v = numOf(row[cT1]); if (v != null) card.timingEarly = v; }
    if (cT2 >= 0) { const v = numOf(row[cT2]); if (v != null) card.timingMid = v; }
    if (cT3 >= 0) { const v = numOf(row[cT3]); if (v != null) card.timingOvertime = v; }
    cards[name] = card;
  }
  const count = Object.keys(cards).length;
  if (count < 100) throw new Error('カード数が少なすぎます: ' + count);
  return { updated: new Date().toISOString(), source: 'ポテンシャル', count, cards };
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
  const target = targetOverride || process.env.POTENTIAL_PATH || 'card-potential.json';
  const api = 'https://api.github.com/repos/' + repo + '/contents/' + target;
  const headers = { Authorization: 'Bearer ' + token, Accept: 'application/vnd.github+json', 'User-Agent': 'crdb-potential-export', 'Content-Type': 'application/json' };
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
  const target = pub.target || process.env.POTENTIAL_PATH || 'card-potential.json';
  const data = pub.r2 ? await r2ReadJson(target) : await requestJson('https://raw.githubusercontent.com/' + repo + '/' + branch + '/' + target + '?cb=' + Date.now());
  const cards = data && data.cards ? data.cards : {};
  const sample = cards['ディガー'] || cards[Object.keys(cards)[0]] || {};
  if (!data || data.count < 100 || Object.keys(cards).length < 100) throw new Error('verify failed: cards=' + (data && data.count));
  if (sample.tolerance == null || sample.timingEarly == null || !sample.winconFlags) throw new Error('verify failed: potential planning fields missing');
  console.log('verified ' + (pub.r2 ? ('R2 ' + pub.bucket + '/' + pub.key) : 'raw') + ' count=' + data.count + ' updated=' + (data.updated || '-'));
}
function publishSummary(pub) {
  if (pub.r2) return 'published R2 ' + pub.bucket + '/' + pub.key + (pub.gh ? ' + GitHub mirror commit=' + (pub.gh.commit || '-') : '');
  return (pub.skipped ? 'up-to-date ' : 'published ') + pub.repo + '/' + pub.target + ' branch=' + pub.branch + ' commit=' + (pub.commit || '-');
}
async function main() {
  const spreadsheetId = argValue('--spreadsheet', process.env.SPREADSHEET_ID || DEFAULT_SPREADSHEET_ID);
  const sheetTitle = argValue('--sheet', process.env.SHEET_TITLE || DEFAULT_SHEET_TITLE);
  const outPath = argValue('--out', process.env.OUT || DEFAULT_OUT);
  const target = argValue('--target', process.env.POTENTIAL_PATH || 'card-potential.json');
  const keyPath = process.env.GOOGLE_APPLICATION_CREDENTIALS || path.join(os.homedir(), '.config/crdb/google-service-account.json');
  const values = await readSheetValues(spreadsheetId, sheetTitle, keyPath);
  const out = buildJson(values);
  fs.writeFileSync(outPath, JSON.stringify(out), 'utf8');
  console.log('wrote ' + outPath + ' cards=' + out.count + ' bytes=' + fs.statSync(outPath).size);
  let pub = { repo: process.env.GITHUB_REPOSITORY || process.env.GITHUB_REPO || 'rea-fi-lia/clash-royale-deck', branch: process.env.GITHUB_BRANCH || process.env.DATA_BRANCH || 'data', target, r2: R2_CONFIGURED, bucket: R2_BUCKET, key: r2ObjectKey(target) };
  if (hasArg('--publish')) { pub = await publishJson(out, outPath, target); console.log(publishSummary(pub)); }
  if (hasArg('--verify')) await verifyPublished(pub);
}
main().catch(err => { console.error(err.stack || err.message); process.exit(1); });
