#!/usr/bin/env node
/*
 * CR API（RoyaleAPIプロキシ経由）実測プローブ v3
 *
 * v1/v2で判明:
 *   - /locations/{id}/rankings/players は空（トロフィーランキングは事実上廃止）
 *   - クランランキング/メンバーは生存。「国の規模 × クラン順位の深さ」で全帯へ到達可
 *   - 同時60件は全成功、90件で429が10件
 *
 * v3の目的（「網羅的に確実に取る」ための数値を出す）:
 *   1. 429の正確な閾値（65/70/75/80/85を刻んで探す）
 *   2. 持続レート（バーストではなく数十秒連続で回して429が出ないか）
 *      → 毎時どれだけの人数を「1時間に1回」見られるかの上限が決まる
 *   3. PoLランキングの深さ（1000位以下＝ランク戦トロフィー0〜がどこまで取れるか）
 *
 * 使い方: CR_TOKEN=xxx node tools/probe-api-limits.js
 */
const PROXY = 'https://proxy.royaleapi.dev/v1';
const TOKEN = (process.env.CR_TOKEN || '').replace(/[^A-Za-z0-9._-]/g, '');
const UA = 'crdb-probe';
const MAX_TOTAL_REQUESTS = 4000;

let totalSent = 0;
const headers = { Authorization: 'Bearer ' + TOKEN, Accept: 'application/json', 'User-Agent': UA };
const sleep = ms => new Promise(r => setTimeout(r, ms));

async function call(path) {
  if (totalSent >= MAX_TOTAL_REQUESTS) return { status: -1 };
  totalSent++;
  try {
    const res = await fetch(PROXY + path, { headers });
    const rl = {};
    for (const k of ['x-ratelimit-limit', 'x-ratelimit-remaining', 'retry-after']) {
      const v = res.headers.get(k); if (v != null) rl[k] = v;
    }
    let body = null;
    if (res.status === 200) { try { body = await res.json(); } catch (e) {} }
    return { status: res.status, rl, body };
  } catch (e) { return { status: 0, err: String((e && e.message) || e) }; }
}

/* ---- 1. PoLランキングの深さ（1000位以下はどこまで取れるか） ---- */
async function probePolDepth() {
  console.log('\n===== 1. PoLランキングの深さ（ランク戦トロフィー0〜まで届くか） =====');
  let after = null, page = 0, total = 0;
  const pages = [];
  while (page < 12) {
    const q = '/locations/global/pathoflegend/players?limit=1000' + (after ? '&after=' + encodeURIComponent(after) : '');
    const r = await call(q);
    if (r.status !== 200) { console.log(`page${page + 1} → ${r.status} で停止`); break; }
    const items = (r.body && r.body.items) || [];
    if (!items.length) { console.log(`page${page + 1} → 0件で終端`); break; }
    const elos = items.map(x => x.eloRating).filter(n => typeof n === 'number');
    const ranks = items.map(x => x.rank).filter(n => typeof n === 'number');
    total += items.length;
    pages.push({
      page: page + 1, 件数: items.length,
      順位: ranks.length ? [Math.min(...ranks), Math.max(...ranks)] : null,
      eloRating: elos.length ? [Math.min(...elos), Math.max(...elos)] : null
    });
    console.log(`page${page + 1}: ${items.length}件 順位 ${ranks.length ? Math.min(...ranks) + '〜' + Math.max(...ranks) : '?'} / elo ${elos.length ? Math.min(...elos) + '〜' + Math.max(...elos) : '?'}`);
    after = r.body && r.body.paging && r.body.paging.cursors && r.body.paging.cursors.after;
    if (!after) { console.log('  → after カーソル無し＝ここが終端'); break; }
    page++;
    await sleep(400);
  }
  console.log(`PoL 合計取得可能人数: ${total}人（${pages.length}ページ）`);
  return { pages, total };
}

/* ---- 2. 429の正確な閾値 ---- */
async function probeThreshold(tags) {
  console.log('\n===== 2. 429の正確な閾値（65→85を刻む） =====');
  const steps = [65, 70, 75, 80, 85];
  const out = [];
  let safeMax = 60;
  for (const conc of steps) {
    if (totalSent + conc > MAX_TOTAL_REQUESTS) break;
    const use = []; for (let i = 0; i < conc; i++) use.push(tags[i % tags.length]);
    const t0 = Date.now();
    const rs = await Promise.all(use.map(t => call('/players/' + encodeURIComponent(t) + '/battlelog')));
    const ms = Date.now() - t0;
    const ok = rs.filter(r => r.status === 200).length;
    const r429 = rs.filter(r => r.status === 429).length;
    out.push({ 同時: conc, 成功: ok, 於429: r429, ms, reqPerSec: Math.round(conc / (ms / 1000)) });
    console.log(`同時${conc}件 → 成功${ok} / 429が${r429} | ${ms}ms (${Math.round(conc / (ms / 1000))} req/s)`);
    if (r429 > 0) { console.log(`  ★${conc}件で429 → 安全上限は ${safeMax} 件`); break; }
    safeMax = conc;
    await sleep(3000);
  }
  console.log(`安全上限（429が出なかった最大同時実行数）: ${safeMax}`);
  return { steps: out, safeMax };
}

/* ---- 3. 持続レート（連続で回して落ちないか） ---- */
async function probeSustained(tags, conc, seconds) {
  console.log(`\n===== 3. 持続レート（同時${conc}件を${seconds}秒連続） =====`);
  const t0 = Date.now();
  let sent = 0, ok = 0, r429 = 0, rounds = 0;
  while ((Date.now() - t0) < seconds * 1000) {
    if (totalSent + conc > MAX_TOTAL_REQUESTS) { console.log('  予算上限で終了'); break; }
    const use = []; for (let i = 0; i < conc; i++) use.push(tags[(rounds * conc + i) % tags.length]);
    const rs = await Promise.all(use.map(t => call('/players/' + encodeURIComponent(t) + '/battlelog')));
    sent += conc; rounds++;
    ok += rs.filter(r => r.status === 200).length;
    const n429 = rs.filter(r => r.status === 429).length;
    r429 += n429;
    if (n429 > 0) { console.log(`  ラウンド${rounds}で429が${n429}件 → 持続不可、ここで停止`); break; }
    await sleep(300);
  }
  const sec = (Date.now() - t0) / 1000;
  const rate = Math.round(sent / sec);
  console.log(`送信${sent} / 成功${ok} / 429が${r429} | ${sec.toFixed(1)}秒 → 持続 ${rate} req/s`);
  console.log(`→ この持続レートなら 1時間で最大 ${(rate * 3600).toLocaleString()} 件（＝毎時ポーリングできる人数の上限）`);
  return { sent, ok, r429, sec, rate, 毎時上限人数: rate * 3600 };
}

async function main() {
  if (!TOKEN) { console.error('CR_TOKEN がありません'); process.exit(1); }
  console.log('CR API 事前計測 v3（総リクエスト上限 ' + MAX_TOTAL_REQUESTS + '）');

  const pol = await probePolDepth();

  // 計測用タグ：PoLランキングから
  const g = await call('/locations/global/pathoflegend/players?limit=1000');
  let tags = ((g.body && g.body.items) || []).map(p => p.tag).filter(Boolean);
  console.log('\n計測用タグ:', tags.length, '件');
  if (tags.length < 65) { console.log('タグ不足で中止'); return; }

  const th = await probeThreshold(tags);
  await sleep(4000);
  const sus = await probeSustained(tags, Math.max(40, th.safeMax - 10), 25);

  console.log('\n===== まとめ =====');
  console.log(JSON.stringify({
    PoL取得可能人数: pol.total, PoLページ数: pol.pages.length,
    安全上限同時実行: th.safeMax, 持続レート: sus.rate, 毎時ポーリング可能人数: sus.毎時上限人数,
    総送信数: totalSent
  }, null, 1));
}

main().catch(e => { console.error('probe error', e); process.exit(1); });
