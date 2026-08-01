#!/usr/bin/env node
/*
 * CR API（RoyaleAPIプロキシ経由）の利用可能エンドポイントとレート上限を実測する。
 * 帯別メタ収集を全トロフィー帯へ広げる前の事前計測用。1回だけ実行して数値を取る。
 *
 * 安全設計:
 *   - 段階的に同時実行数を上げ、429が出た時点で即座に打ち切る（上限を叩き続けない）
 *   - 各段階のあいだに冷却待機を入れる
 *   - 総リクエスト数に上限を設ける
 *
 * 使い方: CR_TOKEN=xxx node tools/probe-api-limits.js
 */
const PROXY = 'https://proxy.royaleapi.dev/v1';
const TOKEN = (process.env.CR_TOKEN || '').replace(/[^A-Za-z0-9._-]/g, '');
const UA = 'crdb-probe';
const MAX_TOTAL_REQUESTS = 900; // 総量の上限（安全弁）

let totalSent = 0;
const headers = { Authorization: 'Bearer ' + TOKEN, Accept: 'application/json', 'User-Agent': UA };

function sleep(ms) { return new Promise(r => setTimeout(r, ms)); }

async function call(path) {
  if (totalSent >= MAX_TOTAL_REQUESTS) return { status: -1, note: 'probe budget exhausted' };
  totalSent++;
  try {
    const res = await fetch(PROXY + path, { headers });
    const rl = {};
    for (const k of ['x-ratelimit-limit', 'x-ratelimit-remaining', 'x-ratelimit-reset', 'retry-after', 'ratelimit-limit', 'ratelimit-remaining']) {
      const v = res.headers.get(k);
      if (v != null) rl[k] = v;
    }
    let body = null;
    if (res.status === 200) { try { body = await res.json(); } catch (e) {} }
    return { status: res.status, rl, body };
  } catch (e) {
    return { status: 0, err: String((e && e.message) || e) };
  }
}

/* ---------- 1. エンドポイントの可用性 ---------- */
async function probeEndpoints() {
  console.log('\n===== 1. エンドポイント可用性 =====');
  const out = {};

  const loc = await call('/locations');
  const locs = (loc.body && loc.body.items) || [];
  const countries = locs.filter(l => l.isCountry);
  out.locations = { status: loc.status, 総数: locs.length, 国数: countries.length };
  console.log('GET /locations →', loc.status, '| 地域数', locs.length, '（うち国', countries.length, '）');
  if (loc.rl && Object.keys(loc.rl).length) console.log('  レート関連ヘッダ:', JSON.stringify(loc.rl));

  // 代表的な国を3つ選んでランキングの深さを見る（大国/中規模/小国）
  const samples = [];
  const pick = (name) => countries.find(c => c.name === name);
  for (const nm of ['United States', 'Japan', 'Iceland', 'Fiji', 'Tonga']) {
    const c = pick(nm);
    if (c) samples.push(c);
  }
  out.countryRankings = [];
  for (const c of samples.slice(0, 5)) {
    const r = await call('/locations/' + c.id + '/rankings/players?limit=1000');
    const items = (r.body && r.body.items) || [];
    const trophies = items.map(x => x.trophies).filter(n => typeof n === 'number');
    const rec = {
      国: c.name, status: r.status, 人数: items.length,
      最高トロフィー: trophies.length ? Math.max(...trophies) : null,
      最低トロフィー: trophies.length ? Math.min(...trophies) : null
    };
    out.countryRankings.push(rec);
    console.log(`GET /locations/${c.id}/rankings/players → ${r.status} | ${c.name}: ${items.length}人 トロフィー ${rec.最低トロフィー}〜${rec.最高トロフィー}`);
    await sleep(400);
  }

  // クラン系
  const anyCountry = samples[0] || countries[0];
  if (anyCountry) {
    const cr = await call('/locations/' + anyCountry.id + '/rankings/clans?limit=1000');
    const citems = (cr.body && cr.body.items) || [];
    out.clanRankings = { 国: anyCountry.name, status: cr.status, クラン数: citems.length };
    console.log(`GET /locations/${anyCountry.id}/rankings/clans → ${cr.status} | ${citems.length}クラン`);

    // 上位・中位・下位のクランのメンバー構成を見る（実力の幅を確認）
    out.clanMembers = [];
    const picks = citems.length ? [0, Math.floor(citems.length / 2), citems.length - 1] : [];
    for (const idx of picks) {
      const c = citems[idx];
      if (!c) continue;
      const m = await call('/clans/' + encodeURIComponent(c.tag) + '/members');
      const items = (m.body && m.body.items) || [];
      const tro = items.map(x => x.trophies).filter(n => typeof n === 'number');
      const rec = {
        順位: idx + 1, clanScore: c.clanScore, status: m.status, 人数: items.length,
        最高: tro.length ? Math.max(...tro) : null, 最低: tro.length ? Math.min(...tro) : null
      };
      out.clanMembers.push(rec);
      console.log(`GET /clans/{tag}/members → ${m.status} | クラン順位${idx + 1}(score ${c.clanScore}): ${items.length}人 トロフィー ${rec.最低}〜${rec.最高}`);
      await sleep(400);
    }
  }

  // クラン検索
  const search = await call('/clans?minMembers=10&limit=20');
  out.clanSearch = { status: search.status, 件数: ((search.body && search.body.items) || []).length };
  console.log('GET /clans?minMembers=10 →', search.status, '| 件数', out.clanSearch.件数);

  return out;
}

/* ---------- 2. レート上限の実測 ---------- */
async function probeRateLimit(sampleTags) {
  console.log('\n===== 2. レート上限の実測（429が出たら即停止） =====');
  const steps = [20, 40, 60, 90, 120, 160];
  const result = [];
  for (const conc of steps) {
    if (totalSent + conc > MAX_TOTAL_REQUESTS) { console.log(`同時${conc}: 予算上限のため中止`); break; }
    const tags = [];
    for (let i = 0; i < conc; i++) tags.push(sampleTags[i % sampleTags.length]);
    const t0 = Date.now();
    const rs = await Promise.all(tags.map(t => call('/players/' + encodeURIComponent(t) + '/battlelog')));
    const ms = Date.now() - t0;
    const ok = rs.filter(r => r.status === 200).length;
    const r429 = rs.filter(r => r.status === 429).length;
    const other = rs.filter(r => r.status !== 200 && r.status !== 429);
    const rec = { 同時実行: conc, 成功: ok, 於429: r429, その他: other.length, 所要ms: ms, 実効req毎秒: Math.round(conc / (ms / 1000)) };
    result.push(rec);
    console.log(`同時${conc}件 → 成功${ok} / 429が${r429} / その他${other.length} | ${ms}ms (実効 ${rec.実効req毎秒} req/s)`);
    if (other.length) console.log('  その他の内訳:', JSON.stringify(other.slice(0, 3).map(o => ({ s: o.status, e: o.err }))));
    const rlSample = rs.find(r => r.rl && Object.keys(r.rl).length);
    if (rlSample) console.log('  レート関連ヘッダ:', JSON.stringify(rlSample.rl));
    if (r429 > 0) { console.log('  ★429を検出 → ここで打ち切り。安全上限はこの一段下。'); break; }
    await sleep(3000); // 冷却
  }
  return result;
}

async function main() {
  if (!TOKEN) { console.error('CR_TOKEN がありません'); process.exit(1); }
  console.log('CR API 事前計測を開始（総リクエスト上限 ' + MAX_TOTAL_REQUESTS + '）');

  const endpoints = await probeEndpoints();

  // レート計測に使うプレイヤータグをグローバルランキングから取得
  const g = await call('/locations/global/rankings/players?limit=200');
  const tags = ((g.body && g.body.items) || []).map(p => p.tag).filter(Boolean);
  console.log('\nレート計測用のタグ:', tags.length, '件取得');

  let rate = [];
  if (tags.length >= 20) rate = await probeRateLimit(tags);
  else console.log('タグが足りずレート計測をスキップ');

  console.log('\n===== まとめ =====');
  console.log(JSON.stringify({ endpoints, rate, 総送信数: totalSent }, null, 1));
}

main().catch(e => { console.error('probe error', e); process.exit(1); });
