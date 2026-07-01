#!/usr/bin/env node
/*
 * Google Sheets「エリクサー価値」タブの「最終」列から
 * card-elixir-vectors-v1.json を生成する依存ゼロツール。
 *
 * 例:
 *   node tools/export-elixir-vectors-from-sheet.js --out /tmp/card-elixir-vectors-v1.json
 *   node tools/export-elixir-vectors-from-sheet.js --out /tmp/card-elixir-vectors-v1.json --publish --verify
 *
 * 必要なもの:
 *   - GOOGLE_APPLICATION_CREDENTIALS（未指定なら ~/.config/crdb/google-service-account.json）
 *   - --publish 時は R2_* secrets があれば Cloudflare R2 へ保存
 *   - R2未設定時、または *_GH_MIRROR=1 時は GITHUB_TOKEN / GH_TOKEN、または gh auth token
 */
const fs = require('fs');
const os = require('os');
const path = require('path');
const crypto = require('crypto');
const { execFileSync } = require('child_process');

const DEFAULT_SPREADSHEET_ID = '1cjX3ptT0g0qjfwhoTBKbzRfXGZUNGLy_jspMSRCDPyU';
const DEFAULT_SHEET_TITLE = 'エリクサー価値';
const DEFAULT_OUT = path.join(os.tmpdir(), 'card-elixir-vectors-v1.json');
const SCOPES = 'https://www.googleapis.com/auth/spreadsheets.readonly';
const TOP = [['火力', 'fire'], ['耐久', 'dur'], ['処理', 'clear'], ['制御', 'ctrl'], ['範囲', 'area'], ['到達', 'reach'], ['防衛', 'def'], ['回転', 'cycle'], ['柔軟', 'flex']];
const SUB = [['小物処理', 'small'], ['中型処理', 'mid'], ['群れ処理', 'swarm'], ['空中処理', 'airClear'], ['タンク処理', 'tank'], ['ノックバック', 'knock'], ['リセット', 'reset'], ['スタン', 'stun'], ['スロー', 'slow'], ['対空', 'antiAir'], ['大型受け', 'bigBlock'], ['速攻受け', 'fastBlock'], ['建物受け', 'bldBlock'], ['射程圧', 'range'], ['手数圧', 'tempo'], ['レイジ適性', 'rage']];
const R2_ACCOUNT_ID = process.env.R2_ACCOUNT_ID || '';
const R2_ACCESS_KEY_ID = process.env.R2_ACCESS_KEY_ID || '';
const R2_SECRET_ACCESS_KEY = process.env.R2_SECRET_ACCESS_KEY || '';
const R2_BUCKET = process.env.R2_BUCKET || 'crdb-data-private';
const R2_PRIVATE_PREFIX = process.env.R2_PRIVATE_PREFIX || 'private/';
const R2_CONFIGURED = !!(R2_ACCOUNT_ID && R2_ACCESS_KEY_ID && R2_SECRET_ACCESS_KEY && R2_BUCKET);
const PRIVATE_GH_MIRROR = String(process.env.PRIVATE_GH_MIRROR || '0') === '1';
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
function round1(value) {
  const n = parseFloat(value);
  return Number.isFinite(n) ? Math.round(n * 10) / 10 : 0;
}
function scoreValue(value, cardName, label) {
  const text = String(value ?? '').trim();
  if (text.startsWith('#')) throw new Error(cardName + ' / ' + label + ' がシートエラーです: ' + text);
  if (text && !Number.isFinite(parseFloat(text))) throw new Error(cardName + ' / ' + label + ' が数値ではありません: ' + text);
  return round1(value);
}
function columnIndex(headers, label) {
  const exact = headers.indexOf(label + ' 最終');
  if (exact >= 0) return exact;
  const finalLike = headers.findIndex(h => h.startsWith(label) && h.includes('最終'));
  if (finalLike >= 0) return finalLike;
  const oldLike = headers.findIndex(h => h === label + '価値' || h === label);
  if (oldLike >= 0) return oldLike;
  return headers.findIndex(h => h.startsWith(label));
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
  const range = encodeURIComponent(sheetTitle + '!A1:ZZ300');
  const url = 'https://sheets.googleapis.com/v4/spreadsheets/' + spreadsheetId + '/values/' + range + '?valueRenderOption=UNFORMATTED_VALUE';
  const data = await requestJson(url, { headers: { Authorization: 'Bearer ' + token } });
  return data.values || [];
}
function buildJson(values) {
  if (!values.length) throw new Error('シートが空です');
  const headers = values[0].map(v => String(v || '').trim());
  const nameCol = headers.findIndex(h => h.startsWith('カード名'));
  if (nameCol < 0) throw new Error('カード名列が見つかりません');
  const topCols = Object.fromEntries(TOP.map(([jp, key]) => [key, columnIndex(headers, jp)]));
  const subCols = Object.fromEntries(SUB.map(([jp, key]) => [key, columnIndex(headers, jp)]));
  const missing = Object.entries({ ...topCols, ...subCols }).filter(([, idx]) => idx < 0).map(([key]) => key);
  if (missing.length) throw new Error('必要な列が見つかりません: ' + missing.join(', '));
  const cards = {};
  for (const row of values.slice(1)) {
    const name = String(row[nameCol] || '').trim();
    if (!name) continue;
    const card = {};
    for (const [jp, key] of TOP) card[key] = scoreValue(row[topCols[key]], name, jp);
    card.sub = {};
    for (const [jp, key] of SUB) card.sub[key] = scoreValue(row[subCols[key]], name, jp);
    cards[name] = card;
  }
  const count = Object.keys(cards).length;
  if (count < 100) throw new Error('カード数が少なすぎます: ' + count);
  return {
    updated: new Date().toISOString(),
    source: 'エリクサー価値（9ベクトル＋細分・シート最終列）',
    scale: '0-10',
    note: '1エリクサー当たりの解決力。回転は単体の軽さ素点で、実デッキ文脈はフロントで再計算。射程圧/手数圧/レイジ適性を含む。',
    vectors: TOP.map(([, key]) => key),
    subs: SUB.map(([, key]) => key),
    count,
    cards
  };
}
function buildPublicJson(out) {
  return {
    updated: out.updated,
    version: 1,
    visibility: 'public-display',
    scale: out.scale,
    vectors: out.vectors,
    subs: out.subs,
    count: out.count,
    cards: out.cards
  };
}
function publicOutPath(outPath) {
  if (/card-elixir-vectors-v1\.json$/.test(outPath)) return outPath.replace(/card-elixir-vectors-v1\.json$/, 'card-elixir-vectors-public-v1.json');
  return outPath.replace(/\.json$/, '-public.json');
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
function r2IsoStamp() {
  return new Date().toISOString().replace(/[:-]|\.\d{3}/g, '');
}
function r2Sha256Hex(value) {
  return crypto.createHash('sha256').update(value || '').digest('hex');
}
function r2Hmac(key, msg, enc) {
  return crypto.createHmac('sha256', key).update(msg).digest(enc);
}
function r2SigningKey(date) {
  const kDate = r2Hmac(Buffer.from('AWS4' + R2_SECRET_ACCESS_KEY, 'utf8'), date);
  const kRegion = r2Hmac(kDate, 'auto');
  const kService = r2Hmac(kRegion, 's3');
  return r2Hmac(kService, 'aws4_request');
}
function r2EncodeKey(key) {
  return String(key || '').split('/').map(encodeURIComponent).join('/');
}
async function r2Request(method, target, body, contentType) {
  if (!R2_CONFIGURED) return { status: 0, text: async () => '' };
  const key = r2ObjectKey(target);
  const host = R2_ACCOUNT_ID + '.r2.cloudflarestorage.com';
  const pathname = '/' + encodeURIComponent(R2_BUCKET) + '/' + r2EncodeKey(key);
  const payload = body == null ? '' : body;
  const payloadHash = r2Sha256Hex(payload);
  const amzDate = r2IsoStamp();
  const date = amzDate.slice(0, 8);
  const headers = {
    host,
    'x-amz-content-sha256': payloadHash,
    'x-amz-date': amzDate
  };
  if (contentType) headers['content-type'] = contentType;
  const signedHeaders = Object.keys(headers).sort().join(';');
  const canonicalHeaders = Object.keys(headers).sort().map(h => h + ':' + headers[h] + '\n').join('');
  const canonicalRequest = [method, pathname, '', canonicalHeaders, signedHeaders, payloadHash].join('\n');
  const scope = date + '/auto/s3/aws4_request';
  const stringToSign = ['AWS4-HMAC-SHA256', amzDate, scope, r2Sha256Hex(canonicalRequest)].join('\n');
  const signature = r2Hmac(r2SigningKey(date), stringToSign, 'hex');
  headers.authorization = 'AWS4-HMAC-SHA256 Credential=' + R2_ACCESS_KEY_ID + '/' + scope + ', SignedHeaders=' + signedHeaders + ', Signature=' + signature;
  return fetch('https://' + host + pathname, { method, headers, body: body == null ? undefined : payload });
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
    } catch (e) {
      lastErr = e;
      await sleep(400 * (attempt + 1));
    }
  }
  throw lastErr || new Error('R2 write ' + target + ' failed');
}
async function r2ReadJson(target) {
  let lastErr = null;
  for (let attempt = 0; attempt < 3; attempt++) {
    try {
      const res = await r2Request('GET', target, null, null);
      if (res.status === 404 || res.status === 0) return null;
      if (res.status >= 500) { lastErr = new Error('R2 read ' + target + ' ' + res.status); await sleep(400 * (attempt + 1)); continue; }
      if (res.status !== 200) throw new Error('R2 read ' + target + ' ' + res.status + ' :: ' + (await res.text()).slice(0, 240));
      return JSON.parse(await res.text());
    } catch (e) {
      lastErr = e;
      await sleep(400 * (attempt + 1));
    }
  }
  throw lastErr || new Error('R2 read ' + target + ' failed');
}
async function publishGitHubJson(out, filePath, targetOverride) {
  const token = githubToken();
  if (!token) throw new Error('--publish には GITHUB_TOKEN / GH_TOKEN、または gh auth が必要です');
  const repo = process.env.GITHUB_REPOSITORY || process.env.GITHUB_REPO || 'rea-fi-lia/clash-royale-deck';
  const branch = process.env.GITHUB_BRANCH || process.env.DATA_BRANCH || 'data';
  const target = targetOverride || process.env.ELIXIR_VECTORS_PATH || 'card-elixir-vectors-v1.json';
  const api = 'https://api.github.com/repos/' + repo + '/contents/' + target;
  const headers = { Authorization: 'Bearer ' + token, Accept: 'application/vnd.github+json', 'User-Agent': 'crdb-elixir-export', 'Content-Type': 'application/json' };
  let sha = null;
  let currentText = '';
  try {
    const cur = await requestJson(api + '?ref=' + encodeURIComponent(branch), { headers: { ...headers, Accept: 'application/vnd.github.object' } });
    sha = cur && cur.sha;
    if (cur && cur.content) currentText = Buffer.from(String(cur.content).replace(/\s/g, ''), 'base64').toString('utf8');
  } catch (e) {
    if (!String(e.message).includes('-> 404 ')) throw e;
  }
  const nextText = fs.readFileSync(filePath, 'utf8');
  if (currentText) {
    try {
      if (comparableJson(currentText) === comparableJson(nextText)) return { repo, branch, target, commit: sha, skipped: true };
    } catch (e) {}
  }
  const body = {
    message: 'chore: update ' + target,
    content: Buffer.from(nextText).toString('base64'),
    branch
  };
  if (sha) body.sha = sha;
  const res = await requestJson(api, { method: 'PUT', headers, body: JSON.stringify(body) });
  return { repo, branch, target, commit: res && res.commit && res.commit.sha };
}
async function publishJson(out, filePath, targetOverride, opts = {}) {
  const target = targetOverride || process.env.ELIXIR_VECTORS_PATH || 'card-elixir-vectors-v1.json';
  const visibility = opts.visibility || 'private';
  if (R2_CONFIGURED) {
    await r2WriteJson(target, out);
    const mirror = visibility === 'public' ? PUBLIC_GH_MIRROR : PRIVATE_GH_MIRROR;
    const gh = mirror ? await publishGitHubJson(out, filePath, target) : null;
    return { r2: true, bucket: R2_BUCKET, key: r2ObjectKey(target), target, gh };
  }
  return publishGitHubJson(out, filePath, target);
}
async function verifyPublished(pub) {
  const repo = pub.repo || process.env.GITHUB_REPOSITORY || process.env.GITHUB_REPO || 'rea-fi-lia/clash-royale-deck';
  const branch = pub.branch || process.env.GITHUB_BRANCH || process.env.DATA_BRANCH || 'data';
  const target = pub.target || process.env.ELIXIR_VECTORS_PATH || 'card-elixir-vectors-v1.json';
  const data = pub.r2 ? await r2ReadJson(target) : await requestJson('https://raw.githubusercontent.com/' + repo + '/' + branch + '/' + target + '?cb=' + Date.now());
  const cards = data && data.cards ? data.cards : {};
  const sampleName = Object.keys(cards)[0];
  const sample = sampleName ? cards[sampleName] : null;
  const missingVec = TOP.map(([, key]) => key).filter(key => !sample || sample[key] == null);
  const missingSub = SUB.map(([, key]) => key).filter(key => !sample || !sample.sub || sample.sub[key] == null);
  if (!data || data.count < 100 || Object.keys(cards).length < 100) throw new Error('verify failed: cards=' + (data && data.count));
  if (missingVec.length || missingSub.length) throw new Error('verify failed: missing ' + missingVec.concat(missingSub).join(', '));
  console.log('verified ' + (pub.r2 ? ('R2 ' + pub.bucket + '/' + pub.key) : 'raw') + ' count=' + data.count + ' vectors=' + (data.vectors || []).length + ' subs=' + (data.subs || []).length + ' updated=' + (data.updated || '-'));
}
function publishSummary(pub) {
  if (pub.r2) {
    return 'published R2 ' + pub.bucket + '/' + pub.key + (pub.gh ? ' + GitHub mirror commit=' + (pub.gh.commit || '-') : '');
  }
  return (pub.skipped ? 'up-to-date ' : 'published ') + pub.repo + '/' + pub.target + ' branch=' + pub.branch + ' commit=' + (pub.commit || '-');
}
async function main() {
  const spreadsheetId = argValue('--spreadsheet', process.env.SPREADSHEET_ID || DEFAULT_SPREADSHEET_ID);
  const sheetTitle = argValue('--sheet', process.env.SHEET_TITLE || DEFAULT_SHEET_TITLE);
  const outPath = argValue('--out', process.env.OUT || DEFAULT_OUT);
  const keyPath = process.env.GOOGLE_APPLICATION_CREDENTIALS || path.join(os.homedir(), '.config/crdb/google-service-account.json');
  const values = await readSheetValues(spreadsheetId, sheetTitle, keyPath);
  const out = buildJson(values);
  const publicOut = buildPublicJson(out);
  const publicPath = argValue('--public-out', process.env.PUBLIC_OUT || publicOutPath(outPath));
  fs.writeFileSync(outPath, JSON.stringify(out), 'utf8');
  fs.writeFileSync(publicPath, JSON.stringify(publicOut), 'utf8');
  console.log('wrote ' + outPath + ' cards=' + out.count + ' bytes=' + fs.statSync(outPath).size);
  console.log('wrote ' + publicPath + ' cards=' + publicOut.count + ' bytes=' + fs.statSync(publicPath).size);
  let pub = { repo: process.env.GITHUB_REPOSITORY || process.env.GITHUB_REPO || 'rea-fi-lia/clash-royale-deck', branch: process.env.GITHUB_BRANCH || process.env.DATA_BRANCH || 'data', target: process.env.ELIXIR_VECTORS_PATH || 'card-elixir-vectors-v1.json', r2: R2_CONFIGURED, bucket: R2_BUCKET, key: r2ObjectKey(process.env.ELIXIR_VECTORS_PATH || 'card-elixir-vectors-v1.json') };
  let publicPub = { repo: pub.repo, branch: pub.branch, target: process.env.ELIXIR_VECTORS_PUBLIC_PATH || 'card-elixir-vectors-public-v1.json', r2: R2_CONFIGURED, bucket: R2_BUCKET, key: r2ObjectKey(process.env.ELIXIR_VECTORS_PUBLIC_PATH || 'card-elixir-vectors-public-v1.json') };
  if (hasArg('--publish')) {
    pub = await publishJson(out, outPath, pub.target, { visibility: 'private' });
    console.log(publishSummary(pub));
    publicPub = await publishJson(publicOut, publicPath, publicPub.target, { visibility: 'public' });
    console.log(publishSummary(publicPub));
  }
  if (hasArg('--verify')) { await verifyPublished(pub); await verifyPublished(publicPub); }
}
main().catch(err => { console.error(err.stack || err.message); process.exit(1); });
