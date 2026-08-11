#!/usr/bin/env node
/*
 * 監修スプレッドシート「タグ」タブの実数値列を card-stats.json の現在値で洗い替える。
 *
 * 背景（2026-08-11 判明）:
 *   card-stats は毎日Wikiから取り直しているのに、監修シートの HP16 / DPS16 等は
 *   手入力のまま置き去りで、158行中153行が古い値だった。
 *   タグを人が見直すときの土台がズレていては監修の意味がないので、
 *   数値列だけを自動で追従させる。★タグ列（○印）には一切触らない。
 *
 * 書き換える列: HP16 / 単発ダメ16 / 攻撃速度 / DPS16 / 呪文ダメ16 / 呪文タワーダメ16 /
 *               攻撃対象 / 射程 / 移動速度 ＋ 右端「バランス更新日」
 * ⚡進化・👑ヒーロー行はベースカードの数値を入れる（Wikiに個別の数値表が無いため）。
 *
 * 例:
 *   node tools/sync-sheet-stats.js --stats /tmp/card-stats.json --dry
 *   node tools/sync-sheet-stats.js --from-r2
 *
 * 必要なもの: GOOGLE_APPLICATION_CREDENTIALS（未指定なら ~/.config/crdb/google-service-account.json）
 */
const fs = require('fs');
const os = require('os');
const path = require('path');
const crypto = require('crypto');

const SPREADSHEET_ID = process.env.SPREADSHEET_ID || '1cjX3ptT0g0qjfwhoTBKbzRfXGZUNGLy_jspMSRCDPyU';
const TAB = 'タグ';
const DATE_HEADER = 'バランス更新日';
const SCOPES = 'https://www.googleapis.com/auth/spreadsheets';

const R2_ACCOUNT_ID = process.env.R2_ACCOUNT_ID || '';
const R2_ACCESS_KEY_ID = process.env.R2_ACCESS_KEY_ID || '';
const R2_SECRET_ACCESS_KEY = process.env.R2_SECRET_ACCESS_KEY || '';
const R2_BUCKET = process.env.R2_BUCKET || 'crdb-data-private';
const R2_PRIVATE_PREFIX = process.env.R2_PRIVATE_PREFIX || 'private/';

function argOne(n, fb) { const i = process.argv.indexOf(n); return i >= 0 && process.argv[i + 1] ? process.argv[i + 1] : fb; }
function hasArg(n) { return process.argv.includes(n); }
function b64url(x) { return Buffer.from(x).toString('base64').replace(/=/g, '').replace(/\+/g, '-').replace(/\//g, '_'); }
async function req(url, opt = {}) {
  const r = await fetch(url, opt); const t = await r.text();
  if (!r.ok) throw new Error((opt.method || 'GET') + ' ' + url + ' -> ' + r.status + ' ' + t.slice(0, 300));
  return t ? JSON.parse(t) : null;
}
async function token() {
  const kp = process.env.GOOGLE_APPLICATION_CREDENTIALS || path.join(os.homedir(), '.config/crdb/google-service-account.json');
  const key = JSON.parse(fs.readFileSync(kp, 'utf8'));
  const now = Math.floor(Date.now() / 1000);
  const unsigned = b64url(JSON.stringify({ alg: 'RS256', typ: 'JWT' })) + '.' +
    b64url(JSON.stringify({ iss: key.client_email, scope: SCOPES, aud: key.token_uri, iat: now, exp: now + 3600 }));
  const sig = crypto.createSign('RSA-SHA256').update(unsigned).sign(key.private_key);
  const body = new URLSearchParams({ grant_type: 'urn:ietf:params:oauth:grant-type:jwt-bearer', assertion: unsigned + '.' + b64url(sig) });
  return (await req(key.token_uri, { method: 'POST', headers: { 'Content-Type': 'application/x-www-form-urlencoded' }, body })).access_token;
}
function colLetter(i) { let s = ''; i++; while (i > 0) { const m = (i - 1) % 26; s = String.fromCharCode(65 + m) + s; i = Math.floor((i - 1) / 26); } return s; }

/* ---- R2（tools/build-card-stats.js と同方式） ---- */
function r2Key(t) { let p = String(R2_PRIVATE_PREFIX || '').replace(/^\/+/, ''); if (p && !p.endsWith('/')) p += '/'; return p + String(t || '').replace(/^\/+/, ''); }
function sha(v) { return crypto.createHash('sha256').update(v || '').digest('hex'); }
function hmac(k, m, e) { return crypto.createHmac('sha256', k).update(m).digest(e); }
async function r2ReadJson(target) {
  if (!(R2_ACCOUNT_ID && R2_ACCESS_KEY_ID && R2_SECRET_ACCESS_KEY)) throw new Error('R2の認証情報がありません');
  const host = R2_ACCOUNT_ID + '.r2.cloudflarestorage.com';
  const pathname = '/' + encodeURIComponent(R2_BUCKET) + '/' + r2Key(target).split('/').map(encodeURIComponent).join('/');
  const amzDate = new Date().toISOString().replace(/[:-]|\.\d{3}/g, ''), date = amzDate.slice(0, 8);
  const h = { host, 'x-amz-content-sha256': sha(''), 'x-amz-date': amzDate };
  const sh = Object.keys(h).sort().join(';');
  const cr = ['GET', pathname, '', Object.keys(h).sort().map(k => k + ':' + h[k] + '\n').join(''), sh, sha('')].join('\n');
  const scope = date + '/auto/s3/aws4_request';
  const sk = hmac(hmac(hmac(hmac(Buffer.from('AWS4' + R2_SECRET_ACCESS_KEY, 'utf8'), date), 'auto'), 's3'), 'aws4_request');
  h.authorization = 'AWS4-HMAC-SHA256 Credential=' + R2_ACCESS_KEY_ID + '/' + scope + ', SignedHeaders=' + sh +
    ', Signature=' + hmac(sk, ['AWS4-HMAC-SHA256', amzDate, scope, sha(cr)].join('\n'), 'hex');
  const res = await fetch('https://' + host + pathname, { headers: h });
  if (res.status !== 200) throw new Error('R2 read ' + target + ' ' + res.status);
  return JSON.parse(await res.text());
}

/* ---- card-stats → シートのセル値 ---- */
const num = v => (v && typeof v === 'object') ? (v.total != null ? v.total : null) : (typeof v === 'number' ? v : null);
// build-card-stats.js の pickStatKey と同じ規約（段階制は最終段階／タワー限定ダメと寿命は除外）
function pick(s16, re) {
  const keys = Object.keys(s16 || {}).filter(k => re.test(k) && !/crown tower/i.test(k) && !/lost per second/i.test(k));
  if (!keys.length) return null;
  const staged = keys.filter(k => /stage/i.test(k));
  if (staged.length > 1) {
    const nOf = k => { const m = k.match(/(?:^|\D)([1-9])(?:\D|$)/); return m ? +m[1] : 0; };
    return num(s16[staged.slice().sort((a, b) => nOf(b) - nOf(a))[0]]);
  }
  return num(s16[keys[0]]);
}
const or = (v) => (v == null ? '' : v);
function cellsFor(c) {
  const s = c.s16 || {}, n = c.n || {}, a = c.attrs || {};
  const isSpell = n.type === 'Spell';
  return {
    'HP16': or(c.hp16),
    // 呪文は「単発ダメ」ではなく呪文ダメ列で扱う
    '単発ダメ16': isSpell ? '' : or(pick(s, /\bdamage$/i)),
    '攻撃速度': a['Hit Speed'] || '',
    // 呪文にDPSは意味がない（総ダメージは呪文ダメ列にある）ので空にする
    'DPS16': isSpell ? '' : or(c.dps16),
    '呪文ダメ16': isSpell ? or(pick(s, /area damage|\bdamage$|damage per second/i)) : '',
    '呪文タワーダメ16': (() => { const k = Object.keys(s).find(x => /crown tower/i.test(x)); return k ? or(num(s[k])) : ''; })(),
    '攻撃対象': a['Target'] || '',
    '射程': a['Range'] || '',
    '移動速度': a['Speed'] || ''
  };
}

async function main() {
  const dry = hasArg('--dry');
  const stats = hasArg('--from-r2') ? await r2ReadJson('card-stats.json')
    : JSON.parse(fs.readFileSync(argOne('--stats', '/tmp/card-stats.json'), 'utf8'));
  const S = {}; (stats.cards || []).forEach(c => S[c.jp] = c);
  console.log('土台: card-stats（updated=' + stats.updated + ' cards=' + (stats.cards || []).length + '）');

  const tk = await token();
  const H = { Authorization: 'Bearer ' + tk, 'Content-Type': 'application/json' };
  const api = 'https://sheets.googleapis.com/v4/spreadsheets/' + SPREADSHEET_ID;

  const meta = await req(api + '?fields=sheets(properties(sheetId,title,gridProperties))', { headers: H });
  const sh = (meta.sheets || []).find(s => s.properties.title === TAB);
  if (!sh) throw new Error('タブ「' + TAB + '」が見つかりません');
  const props = sh.properties;

  const range = TAB + '!A1:ZZ400';
  const values = (await req(api + '/values/' + encodeURIComponent(range) + '?valueRenderOption=UNFORMATTED_VALUE', { headers: H })).values || [];
  if (!values.length) throw new Error('シートが空です');
  const head = values[0].map(x => String(x == null ? '' : x).trim());
  const nameCol = head.indexOf('カード名');
  if (nameCol < 0) throw new Error('カード名列がありません');

  let dateCol = head.indexOf(DATE_HEADER);
  const newCols = [];
  if (dateCol < 0) { dateCol = head.length; newCols.push({ idx: dateCol, name: DATE_HEADER }); }

  // グリッド幅が足りないと400になるので先に拡張する
  const needCols = dateCol + 1;
  if (props.gridProperties.columnCount < needCols && !dry) {
    await req(api + ':batchUpdate', { method: 'POST', headers: H, body: JSON.stringify({ requests: [{ appendDimension: { sheetId: props.sheetId, dimension: 'COLUMNS', length: needCols - props.gridProperties.columnCount } }] }) });
    console.log('列を ' + props.gridProperties.columnCount + ' → ' + needCols + ' へ拡張');
  }

  const STAT_COLS = ['HP16', '単発ダメ16', '攻撃速度', 'DPS16', '呪文ダメ16', '呪文タワーダメ16', '攻撃対象', '射程', '移動速度'];
  const colIdx = {}; STAT_COLS.forEach(c => { const i = head.indexOf(c); if (i >= 0) colIdx[c] = i; });
  console.log('対象列: ' + Object.keys(colIdx).join(' / ') + (Object.keys(colIdx).length < STAT_COLS.length ? '  （' + STAT_COLS.filter(c => !(c in colIdx)).join(',') + ' はシートに無いので飛ばす）' : ''));

  const today = new Date().toISOString().slice(0, 10);
  const updates = [];
  if (newCols.length) newCols.forEach(c => updates.push({ range: TAB + '!' + colLetter(c.idx) + '1', values: [[c.name]] }));

  let touched = 0, missing = [];
  const stamp = [];
  values.slice(1).forEach((row, i) => {
    const rowNo = i + 2;
    const raw = String(row[nameCol] == null ? '' : row[nameCol]).trim();
    if (!raw) return;
    const c = S[raw.replace(/[⚡👑]/g, '')];
    if (!c) { missing.push(raw); return; }
    const want = cellsFor(c);
    let changedRow = false;
    Object.keys(colIdx).forEach(name => {
      const idx = colIdx[name];
      const cur = row[idx] == null ? '' : row[idx];
      const nv = want[name];
      if (String(cur) !== String(nv)) {
        updates.push({ range: TAB + '!' + colLetter(idx) + rowNo, values: [[nv]] });
        changedRow = true;
      }
    });
    if (changedRow) { touched++; stamp.push({ rowNo, name: raw }); }
  });
  // 数値が動いた行だけ更新日を打つ（動いていない行の日付は残す＝いつの調整で変わったかが読める）
  stamp.forEach(s => updates.push({ range: TAB + '!' + colLetter(dateCol) + s.rowNo, values: [[today]] }));

  console.log('更新する行: ' + touched + ' / セル: ' + updates.length + '（更新日=' + today + '）');
  if (missing.length) console.log('card-statsに無い行(' + missing.length + '): ' + missing.slice(0, 10).join(', '));
  if (dry) { console.log('--dry のため書き込みません'); return; }
  if (!updates.length) { console.log('変更なし'); return; }

  for (let i = 0; i < updates.length; i += 400) {
    await req(api + '/values:batchUpdate', { method: 'POST', headers: H, body: JSON.stringify({ valueInputOption: 'RAW', data: updates.slice(i, i + 400) }) });
  }
  console.log('書き込み完了: ' + updates.length + 'セル');
}
main().catch(e => { console.error(e.stack || e.message); process.exit(1); });
