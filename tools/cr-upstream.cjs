'use strict';
/**
 * CR API の入口を1か所にまとめる部品（2026-10-03）
 *
 * ふだんは RoyaleAPI の中継（proxy.royaleapi.dev）を通す。中継は CR_TOKEN の許可IP（45.79.218.79）から
 * Supercell 公式APIへ取り次いでくれるので、IPが毎回変わる GitHub Actions からでも使える。
 * ただし中継は第三者の無償サービスで、2026-08-05・10-01・10-03 に 500/520/525 で落ちた
 * （10-03 は成功率20%が5時間以上続き、毎時の収集が全部止まった）。
 *
 * ここでやること：
 *   1. 健康診断（preflight）… 収集の前に軽い要求を数回投げて、上流が生きているか確かめる
 *   2. 回路遮断（note / tripped）… 収集の途中で 5xx・通信失敗が1分以上続いたら、それ以上叩かない
 *      ★これが無いと、半死の中継に1件20秒×再試行で粘り、45分の時間切れまで本番の順番を塞ぐ
 *   3. 公式への切り替え（failover）… CR_DEV_EMAIL / CR_DEV_PASSWORD があるときだけ、
 *      開発者ポータルにログインして「この実行機のIP用の鍵」を作り、api.clashroyale.com を直接使う。
 *      手順は developer.clashroyale.com 自身の画面が使っているもの（login → account/load →
 *      apikey/list → apikey/revoke {id} → apikey/create {name,description,cidrRanges,scopes}）。
 *      ★作る鍵の名前は KEY_PREFIX で始める。消すのも自分で作った鍵だけ（本人の鍵には触らない）
 *   4. 上流停止の印（UpstreamDown）… 切り替えられない・メンテ中なら、早めに降りて
 *      「こちらのコードではなく上流が止まっている」と分かる形で終える。
 *      ログに UPSTREAM_DOWN を出す＝自動修理（auto-repair.yml）はこれを見て AI を起こさない
 */
const fs = require('node:fs');

const PROXY_BASE = 'https://proxy.royaleapi.dev/v1';
const OFFICIAL_BASE = 'https://api.clashroyale.com/v1';
const PORTAL_BASE = 'https://developer.clashroyale.com';
const KEY_PREFIX = 'crdb-actions';
const KEY_SLOTS = 10;                      // 開発者ポータルの1アカウントあたりの鍵の上限

// 回路遮断：直近 SPAN_MS の生の応答のうち、DOWN_RATIO 以上が 5xx/通信失敗で、
// それが HOLD_MS 以上続いていたら「上流が止まった」と見なす。
// ★一瞬の揺れ（1チャンク40件が全部落ちる程度）で収集ごと止めないため、件数と時間の両方を要求する。
const SPAN_MS = 120000, HOLD_MS = 60000, MIN_SAMPLES = 60, DOWN_RATIO = 0.6;

class UpstreamDown extends Error {
  constructor(reason, message, detail = {}) {
    super(message);
    this.name = 'UpstreamDown';
    this.code = 'UPSTREAM_DOWN';
    this.reason = reason;                  // 'proxy' | 'official' | 'maintenance'
    this.detail = detail;
  }
}

function freshState(opts = {}) {
  return { mode: 'proxy', officialToken: '', recent: [], tripped: false, failover: null, counts: {}, switchedAt: null,
    now: opts.now || (() => Date.now()) };
}
let state = freshState();
function reset(opts) { state = freshState(opts); }

function env(k) { const v = process.env[k]; return v == null ? '' : String(v); }
function canFailover() { return !!(env('CR_DEV_EMAIL') && env('CR_DEV_PASSWORD')) && env('CR_UPSTREAM').toLowerCase() !== 'proxy'; }
function sleep(ms) { return new Promise(function (r) { setTimeout(r, ms); }); }
function isDownStatus(status) { return status === 0 || (status >= 500 && status <= 599); }
function retryAfterMs(header, now = Date.now()) {
  if (!header) return 0;
  const ms = /^\d+$/.test(header) ? Number(header) * 1000 : Date.parse(header) - now;
  return Number.isFinite(ms) ? Math.max(0, ms) : 0;
}

// 生の応答を1件ずつ記録する。429（速すぎ）は「上流は生きている」側に数える。
function note(status) {
  const s = Number(status) || 0, t = state.now();
  state.counts[s] = (state.counts[s] || 0) + 1;
  state.recent.push([t, isDownStatus(s) ? 1 : 0]);
  while (state.recent.length && t - state.recent[0][0] > SPAN_MS) state.recent.shift();
  if (state.tripped || state.recent.length < MIN_SAMPLES || t - state.recent[0][0] < HOLD_MS) return;
  const down = state.recent.reduce(function (n, x) { return n + x[1]; }, 0);
  if (down / state.recent.length >= DOWN_RATIO) state.tripped = true;
}
function tripped() { return state.tripped; }

function endpoint(token) {
  const official = state.mode === 'official';
  const bearer = official ? state.officialToken : token;
  return {
    mode: state.mode,
    base: official ? OFFICIAL_BASE : PROXY_BASE,
    headers: function (ua) { return { Authorization: 'Bearer ' + bearer, Accept: 'application/json', 'User-Agent': ua || 'crdb' }; }
  };
}

// ログ・通知・原本に残す要約。★鍵（token）は絶対に入れない
function summary() {
  const down = state.recent.reduce(function (n, x) { return n + x[1]; }, 0);
  return { mode: state.mode, statuses: Object.assign({}, state.counts), recent: state.recent.length, recentDown: down,
    failover: state.failover ? Object.assign({}, state.failover) : null };
}
function provenance() { return { mode: state.mode, base: endpoint('').base, switchedAt: state.switchedAt }; }

function ipFromTemporaryToken(jwt) {
  try {
    const part = String(jwt || '').split('.')[1];
    if (!part) return '';
    const payload = JSON.parse(Buffer.from(part.replace(/-/g, '+').replace(/_/g, '/'), 'base64').toString('utf8'));
    for (const l of payload.limits || []) for (const c of l.cidrs || []) {
      const ip = String(c).split('/')[0];
      if (/^\d{1,3}(\.\d{1,3}){3}$/.test(ip)) return ip;
    }
  } catch (e) { /* 読めなければ別の方法で調べる */ }
  return '';
}
async function publicIp(fetchImpl) {
  try {
    const r = await fetchImpl('https://api.ipify.org', { signal: AbortSignal.timeout(10000) });
    const ip = (await r.text()).trim();
    return /^\d{1,3}(\.\d{1,3}){3}$/.test(ip) ? ip : '';
  } catch (e) { return ''; }
}

// 開発者ポータルで「この実行機のIP用の鍵」を用意する。
async function officialKey({ fetchImpl, log }) {
  const jar = [];
  async function portal(path, body) {
    const headers = { 'Content-Type': 'application/json', Accept: 'application/json' };
    if (jar.length) headers.Cookie = jar.join('; ');
    const res = await fetchImpl(PORTAL_BASE + '/api/' + path, { method: 'POST', headers, body: JSON.stringify(body || {}), signal: AbortSignal.timeout(20000) });
    const cookies = typeof res.headers.getSetCookie === 'function' ? res.headers.getSetCookie() : [res.headers.get('set-cookie')].filter(Boolean);
    for (const c of cookies) {
      const pair = String(c).split(';')[0].trim(), name = pair.split('=')[0];
      if (!name) continue;
      const i = jar.findIndex(function (x) { return x.split('=')[0] === name; });
      if (i >= 0) jar[i] = pair; else jar.push(pair);
    }
    const text = await res.text();
    let json = null;
    try { json = JSON.parse(text); } catch (e) { json = null; }
    if (res.status !== 200) throw new Error('開発者ポータル ' + path + ' ' + res.status + ' ' + ((json && (json.error || json.description)) || text.slice(0, 120)));
    return json || {};
  }
  const login = await portal('login', { email: env('CR_DEV_EMAIL'), password: env('CR_DEV_PASSWORD') });
  const ip = ipFromTemporaryToken(login.temporaryAPIToken) || await publicIp(fetchImpl);
  if (!ip) throw new Error('この実行機の外向きIPが分からない');
  let scopes = null;
  try {
    const account = await portal('account/load', {});
    scopes = account && account.developer && Array.isArray(account.developer.allowedScopes) ? account.developer.allowedScopes : null;
  } catch (e) { log('upstream ポータルのプロフィールが読めない（scopes は既定で作る）: ' + e.message); }
  const listed = await portal('apikey/list', {});
  const keys = Array.isArray(listed.keys) ? listed.keys : [];
  const ours = keys.filter(function (k) { return String(k && k.name || '').startsWith(KEY_PREFIX); });
  const ipOf = function (c) { return String(c).split('/')[0]; };
  const hit = ours.find(function (k) { return k.key && (k.cidrRanges || []).some(function (c) { return ipOf(c) === ip; }); });
  let out;
  if (hit) out = { token: hit.key, ip, reused: true };
  else {
    // 前の実行機のIP用に作った鍵は、もう使わないので片付ける（自分の名前のものだけ）
    for (const k of ours) await portal('apikey/revoke', { id: k.id });
    if (keys.length - ours.length >= KEY_SLOTS) throw new Error('鍵の枠（1アカウント' + KEY_SLOTS + '個）が埋まっている。ポータルで不要な鍵を消すと動く');
    const stamp = new Date(state.now()).toISOString().replace(/[-:]/g, '').slice(0, 13);
    const created = await portal('apikey/create', {
      name: KEY_PREFIX + '-' + stamp,
      description: 'CR Deck Builders collector (GitHub Actions) ' + new Date(state.now()).toISOString(),
      cidrRanges: [ip],
      scopes: scopes || ['royale']
    });
    const token = created && created.key && (typeof created.key === 'string' ? created.key : created.key.key);
    if (!token) throw new Error('鍵を作ったが応答に鍵が入っていない');
    out = { token, ip, reused: false, revoked: ours.length };
  }
  try { await portal('logout', {}); } catch (e) { /* セッションは放っておいても切れる */ }
  return out;
}

async function failover({ fetchImpl = globalThis.fetch, log = console.log } = {}) {
  state.failover = { at: new Date(state.now()).toISOString(), ok: false };
  try {
    const key = await officialKey({ fetchImpl, log });
    // ★鍵がログに出ても伏せ字になるよう、最初に GitHub へ登録しておく
    if (env('GITHUB_ACTIONS') === 'true') console.log('::add-mask::' + key.token);
    state.mode = 'official'; state.officialToken = key.token;
    state.recent = []; state.tripped = false; state.switchedAt = state.failover.at;
    state.failover = Object.assign(state.failover, { ok: true, ip: key.ip, reused: key.reused, revoked: key.revoked || 0 });
    log('upstream 公式APIへ切り替え ip=' + key.ip + (key.reused ? '（このIP用の鍵を再利用）' : '（このIP用の鍵を作成・古い自動鍵' + (key.revoked || 0) + '個を失効）'));
    return true;
  } catch (e) {
    state.failover.error = (e && e.message) || String(e);
    log('upstream 公式APIへの切り替えに失敗: ' + state.failover.error);
    return false;
  }
}

function downError(path, status) {
  return new UpstreamDown(state.mode === 'official' ? 'official' : 'proxy', 'CR API ' + status + ' for ' + path, summary());
}

// 遮断済みなら、公式へ切り替えて続けるか、ここで止める。遮断していなければ何もしない。
async function guard({ fetchImpl = globalThis.fetch, log = console.log } = {}) {
  if (!state.tripped) return;
  if (state.mode === 'proxy' && canFailover() && !state.failover && await failover({ fetchImpl, log })) return;
  throw new UpstreamDown(state.mode === 'official' ? 'official' : 'proxy', '上流が止まっている（直近' + state.recent.length + '件中' +
    state.recent.reduce(function (n, x) { return n + x[1]; }, 0) + '件が5xx/通信失敗）', summary());
}

// CR API を1回分取る。429・5xx・通信失敗は waits に従って再試行する。
// ★再試行のタイマーは「通信1回の直後」に仕掛ける（間に await を挟まない）。既存テストがこの順番を前提に時間を早送りしている
async function getJson(path, token, opts = {}) {
  const fetchImpl = opts.fetchImpl || globalThis.fetch, log = opts.log || console.log;
  const waits = opts.waits || [1200, 3000, 7000], ua = opts.ua || 'crdb', timeoutMs = opts.timeoutMs || 20000;
  for (let i = 0; i <= waits.length; i++) {
    if (state.tripped) await guard({ fetchImpl, log });
    const ep = endpoint(token);
    let res = null;
    try { res = await fetchImpl(ep.base + path, { headers: ep.headers(ua), signal: AbortSignal.timeout(timeoutMs) }); }
    catch (e) { res = null; }
    const status = res ? res.status : 0;
    note(status);
    if (status === 200) return res.json();
    if (status === 503) {
      const text = await res.text().catch(function () { return ''; });
      if (/inMaintenance/.test(text)) throw new UpstreamDown('maintenance', 'Supercell 公式APIがメンテナンス中（' + path + '）', summary());
    }
    if ((status === 429 || isDownStatus(status)) && i < waits.length) {
      await sleep((res && retryAfterMs(res.headers.get('retry-after'))) || waits[i]);
      continue;
    }
    if (isDownStatus(status)) {
      // 再試行し尽くした 5xx/通信失敗＝上流の問題。切り替えられるなら最初から取り直す
      if (state.mode === 'proxy' && canFailover() && !state.failover && await failover({ fetchImpl, log })) { i = -1; continue; }
      throw downError(path, status);
    }
    const text = res ? await res.text().catch(function () { return ''; }) : '';
    throw new Error('CR API ' + status + ' for ' + path + ' :: ' + text.slice(0, 300));
  }
}

async function probe(token, { fetchImpl, ua, samples, need, gapMs }) {
  const out = { n: 0, ok: 0, statuses: {}, maintenance: false, forbidden: '' };
  for (let i = 0; i < samples; i++) {
    const ep = endpoint(token);
    let status = 0, text = '';
    try {
      const res = await fetchImpl(ep.base + '/locations?limit=1', { headers: ep.headers(ua), signal: AbortSignal.timeout(15000) });
      status = res.status;
      text = await res.text().catch(function () { return ''; });
    } catch (e) { status = 0; }
    note(status);
    out.n++; out.statuses[status] = (out.statuses[status] || 0) + 1;
    if (status === 200) out.ok++;
    if (status === 503 && /inMaintenance/.test(text)) { out.maintenance = true; break; }
    if (status === 403) { out.forbidden = text.slice(0, 200); break; }
    if (out.ok >= need || samples - 1 - i + out.ok < need) break;   // 合否が決まったら打ち切る
    await sleep(gapMs);
  }
  return out;
}

// 収集の前の健康診断。生きていれば何もしない。中継が死んでいれば公式へ切り替えるか、UpstreamDown で止める。
// ★合格ラインは甘めにしてある（6回中3回・落ちたら間を置いて1回だけ測り直す）。
//   偽の「停止」は1時間分の収集を丸ごと捨てる（75分ルールが崩れる）が、偽の「生きている」は
//   収集の途中の回路遮断（note/tripped）が1〜2分で拾うので、安い側に倒す。
async function preflight(token, opts = {}) {
  const fetchImpl = opts.fetchImpl || globalThis.fetch, log = opts.log || console.log;
  const p = { fetchImpl, ua: opts.ua || 'crdb', samples: opts.samples || 6, need: opts.need || 3, gapMs: opts.gapMs == null ? 250 : opts.gapMs };
  const recheckMs = opts.recheckMs == null ? 20000 : opts.recheckMs;
  if (env('CR_UPSTREAM').toLowerCase() === 'official') {
    // 手動で公式経路を試すとき（中継が元気でも公式を使う）。設定の誤りは上流停止ではないので普通のエラーにする
    if (!(env('CR_DEV_EMAIL') && env('CR_DEV_PASSWORD'))) throw new Error('CR_UPSTREAM=official だが CR_DEV_EMAIL / CR_DEV_PASSWORD が無い');
    if (!await failover({ fetchImpl, log })) throw new Error('公式APIへの切り替えに失敗: ' + state.failover.error);
  }
  let strikes = 0;
  for (;;) {
    const r = await probe(token, p);
    log('upstream 健康診断 mode=' + state.mode + ' 成功' + r.ok + '/' + r.n + ' ' + JSON.stringify(r.statuses));
    if (r.maintenance) throw new UpstreamDown('maintenance', 'Supercell 公式APIがメンテナンス中', summary());
    if (r.forbidden) throw new Error('CR API 403（鍵が無効か、この経路のIPで使えない） mode=' + state.mode + ' :: ' + r.forbidden);
    if (r.ok >= p.need) return state.mode;
    // 一瞬の揺れで1時間分を捨てないよう、間を置いて1回だけ測り直す
    if (++strikes < 2) { log('upstream 健康診断に落ちた。' + Math.round(recheckMs / 1000) + '秒後に測り直す'); await sleep(recheckMs); continue; }
    if (state.mode === 'proxy' && canFailover() && !state.failover && await failover({ fetchImpl, log })) { strikes = 0; continue; }
    throw new UpstreamDown(state.mode === 'official' ? 'official' : 'proxy',
      (state.mode === 'official' ? '公式APIも' : '中継が') + '応答しない（健康診断 成功' + r.ok + '/' + r.n + '）', summary());
  }
}

function isUpstreamDown(e) { return !!(e && e.code === 'UPSTREAM_DOWN'); }

// 上流停止で降りるときの後始末。ログに印を出し、ワークフローが通知文に使う要約をファイルへ書く。
function report(e, { log = console.log, file = env('UPSTREAM_STATUS_FILE') } = {}) {
  const reason = (e && e.reason) || 'proxy';
  const head = {
    proxy: 'RoyaleAPI の中継（proxy.royaleapi.dev）が応答していません',
    official: 'Supercell 公式APIが応答していません',
    maintenance: 'Supercell 公式APIがメンテナンス中です'
  }[reason] || '上流が応答していません';
  const fo = state.failover;
  let tail = '';
  if (reason !== 'maintenance') {
    if (fo && fo.ok) tail = '公式APIへ切り替えましたが、そちらも応答しませんでした';
    else if (fo) tail = '公式APIへの切り替えに失敗: ' + fo.error;
    else if (!canFailover()) tail = '公式APIへの自動切り替えは未設定（Secrets の CR_DEV_EMAIL / CR_DEV_PASSWORD）';
  }
  const detail = head + '。こちらのコードの故障ではありません。上流が戻れば次の実行で自動的に再開します。' + (tail ? '（' + tail + '）' : '');
  log('UPSTREAM_DOWN reason=' + reason + ' ' + ((e && e.message) || '') + ' ' + JSON.stringify(summary()));
  log('::error title=上流が停止中::' + detail);
  if (file) {
    try { fs.writeFileSync(file, JSON.stringify({ down: true, reason, detail, summary: summary(), at: new Date().toISOString() })); }
    catch (err) { log('upstream status file write error ' + ((err && err.message) || err)); }
  }
  return detail;
}

module.exports = {
  PROXY_BASE, OFFICIAL_BASE, PORTAL_BASE, KEY_PREFIX, UpstreamDown,
  reset, note, tripped, endpoint, summary, provenance, guard, getJson, preflight, failover,
  isUpstreamDown, report, retryAfterMs, ipFromTemporaryToken, isDownStatus
};
