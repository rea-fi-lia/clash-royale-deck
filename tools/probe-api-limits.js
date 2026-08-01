#!/usr/bin/env node
/*
 * CR API（RoyaleAPIプロキシ経由）の可用エンドポイントとレート上限を実測する（v2）。
 *
 * v1の計測で判明:
 *   - /locations/{id}/rankings/players は 200 を返すが items が空（トロフィーランキングは事実上廃止）
 *   - /locations/{id}/rankings/clans と /clans/{tag}/members は生きている
 *   - よって「全トロフィー帯へ届く入口」はクラン経由が本命
 *
 * v2 の目的:
 *   1. 国の規模別にクランランキング下位までたどり、メンバーのトロフィー分布を見る
 *      → 「小国の下位クランなら低帯に届く」が本当か
 *   2. クラン検索(/clans)で低スコア帯のクランを直接引けるか
 *   3. クランメンバーのタグでレート上限を実測（429で即停止）
 *
 * 使い方: CR_TOKEN=xxx node tools/probe-api-limits.js
 */
const PROXY = 'https://proxy.royaleapi.dev/v1';
const TOKEN = (process.env.CR_TOKEN || '').replace(/[^A-Za-z0-9._-]/g, '');
const UA = 'crdb-probe';
const MAX_TOTAL_REQUESTS = 900;

let totalSent = 0;
const headers = { Authorization: 'Bearer ' + TOKEN, Accept: 'application/json', 'User-Agent': UA };
const sleep = ms => new Promise(r => setTimeout(r, ms));

async function call(path) {
  if (totalSent >= MAX_TOTAL_REQUESTS) return { status: -1, note: 'budget exhausted' };
  totalSent++;
  try {
    const res = await fetch(PROXY + path, { headers });
    const rl = {};
    for (const k of ['x-ratelimit-limit', 'x-ratelimit-remaining', 'retry-after', 'ratelimit-limit', 'ratelimit-remaining']) {
      const v = res.headers.get(k); if (v != null) rl[k] = v;
    }
    let body = null;
    if (res.status === 200) { try { body = await res.json(); } catch (e) {} }
    return { status: res.status, rl, body };
  } catch (e) { return { status: 0, err: String((e && e.message) || e) }; }
}

function stat(nums) {
  if (!nums.length) return null;
  const s = nums.slice().sort((a, b) => a - b);
  const q = p => s[Math.min(s.length - 1, Math.floor(s.length * p))];
  return { n: s.length, 最低: s[0], 中央: q(0.5), 最高: s[s.length - 1] };
}

/* ---- 1. クランランキングの深さ × 国の規模 ---- */
async function probeClanDepth() {
  console.log('\n===== 1. クラン経由でどこまで低い帯に届くか =====');
  const loc = await call('/locations');
  const countries = ((loc.body && loc.body.items) || []).filter(l => l.isCountry);
  console.log('国数:', countries.length);

  // 大国 / 中規模 / 小国 を選ぶ
  const want = ['United States', 'Japan', 'Iceland', 'Fiji', 'Tonga', 'Nauru', 'Tuvalu', 'San Marino'];
  const picks = want.map(n => countries.find(c => c.name === n)).filter(Boolean);
  const out = [];

  for (const c of picks) {
    const r = await call('/locations/' + c.id + '/rankings/clans?limit=1000');
    const items = (r.body && r.body.items) || [];
    if (!items.length) { console.log(`${c.name}: クラン0件`); continue; }
    const scores = items.map(x => x.clanScore).filter(n => typeof n === 'number');
    // 先頭・中間・末尾のクランのメンバー分布を見る
    const idxs = [...new Set([0, Math.floor(items.length / 2), items.length - 1])];
    const members = [];
    for (const i of idxs) {
      const cl = items[i];
      const m = await call('/clans/' + encodeURIComponent(cl.tag) + '/members');
      const tro = ((m.body && m.body.items) || []).map(x => x.trophies).filter(n => typeof n === 'number');
      members.push({ 順位: i + 1, clanScore: cl.clanScore, トロフィー: stat(tro) });
      await sleep(350);
    }
    const rec = { 国: c.name, クラン数: items.length, スコア範囲: scores.length ? [Math.min(...scores), Math.max(...scores)] : null, メンバー分布: members };
    out.push(rec);
    console.log(`\n【${c.name}】クラン${items.length}件 スコア ${rec.スコア範囲 && rec.スコア範囲[0]}〜${rec.スコア範囲 && rec.スコア範囲[1]}`);
    members.forEach(m => console.log(`   順位${m.順位}(score ${m.clanScore}) → メンバートロフィー ${m.トロフィー && m.トロフィー.最低}〜${m.トロフィー && m.トロフィー.最高} (中央 ${m.トロフィー && m.トロフィー.中央})`));
    await sleep(350);
  }
  return out;
}

/* ---- 2. クラン検索で低スコア帯を直接引けるか ---- */
async function probeClanSearch() {
  console.log('\n===== 2. クラン検索で低スコア帯を引けるか =====');
  const out = [];
  const cases = [
    { label: '条件ゆるめ(最小人数10)', q: '/clans?minMembers=10&limit=50' },
    { label: '最小スコア指定なし・人数多め', q: '/clans?minMembers=45&limit=50' },
    { label: '名前検索(a)', q: '/clans?name=a&limit=50' },
    { label: '名前検索(a)+人数少なめ', q: '/clans?name=a&maxMembers=20&limit=50' }
  ];
  for (const c of cases) {
    const r = await call(c.q);
    const items = (r.body && r.body.items) || [];
    const scores = items.map(x => x.clanScore).filter(n => typeof n === 'number');
    const rec = { 条件: c.label, status: r.status, 件数: items.length, スコア: stat(scores) };
    out.push(rec);
    console.log(`${c.label} → ${r.status} | ${items.length}件 スコア ${rec.スコア ? rec.スコア.最低 + '〜' + rec.スコア.最高 + '(中央' + rec.スコア.中央 + ')' : 'なし'}`);
    await sleep(400);
  }

  // 低スコアのクランが引けたら、そのメンバーのトロフィーを見る
  const r = await call('/clans?name=a&maxMembers=20&limit=50');
  const items = ((r.body && r.body.items) || []).slice().sort((a, b) => (a.clanScore || 0) - (b.clanScore || 0));
  const lowest = items.slice(0, 3);
  const detail = [];
  for (const cl of lowest) {
    const m = await call('/clans/' + encodeURIComponent(cl.tag) + '/members');
    const tro = ((m.body && m.body.items) || []).map(x => x.trophies).filter(n => typeof n === 'number');
    detail.push({ clanScore: cl.clanScore, トロフィー: stat(tro) });
    console.log(`  低スコアクラン(score ${cl.clanScore}) → メンバートロフィー ${stat(tro) ? stat(tro).最低 + '〜' + stat(tro).最高 : 'なし'}`);
    await sleep(350);
  }
  return { cases: out, 低スコアクラン: detail };
}

/* ---- 3. レート上限の実測 ---- */
async function probeRateLimit(tags) {
  console.log('\n===== 3. レート上限の実測（429で即停止） =====');
  const steps = [20, 40, 60, 90, 120];
  const result = [];
  for (const conc of steps) {
    if (totalSent + conc > MAX_TOTAL_REQUESTS) { console.log(`同時${conc}: 予算上限のため中止`); break; }
    const use = [];
    for (let i = 0; i < conc; i++) use.push(tags[i % tags.length]);
    const t0 = Date.now();
    const rs = await Promise.all(use.map(t => call('/players/' + encodeURIComponent(t) + '/battlelog')));
    const ms = Date.now() - t0;
    const ok = rs.filter(r => r.status === 200).length;
    const r429 = rs.filter(r => r.status === 429).length;
    const other = rs.filter(r => r.status !== 200 && r.status !== 429);
    const rec = { 同時実行: conc, 成功: ok, 於429: r429, その他: other.length, 所要ms: ms, 実効req毎秒: Math.round(conc / (ms / 1000)) };
    result.push(rec);
    console.log(`同時${conc}件 → 成功${ok} / 429が${r429} / その他${other.length} | ${ms}ms (実効 ${rec.実効req毎秒} req/s)`);
    if (other.length) console.log('  その他:', JSON.stringify(other.slice(0, 3).map(o => ({ s: o.status, e: o.err }))));
    const rlS = rs.find(r => r.rl && Object.keys(r.rl).length);
    if (rlS) console.log('  レート関連ヘッダ:', JSON.stringify(rlS.rl));
    if (r429 > 0) { console.log('  ★429検出 → 打ち切り。安全上限はこの一段下。'); break; }
    await sleep(3000);
  }
  return result;
}

async function main() {
  if (!TOKEN) { console.error('CR_TOKEN がありません'); process.exit(1); }
  console.log('CR API 事前計測 v2 開始（総リクエスト上限 ' + MAX_TOTAL_REQUESTS + '）');

  const clanDepth = await probeClanDepth();
  const clanSearch = await probeClanSearch();

  // レート計測用タグをクランメンバーから集める（プレイヤーランキングが空のため）
  const loc = await call('/locations');
  const us = ((loc.body && loc.body.items) || []).find(l => l.name === 'United States');
  let tags = [];
  if (us) {
    const cr = await call('/locations/' + us.id + '/rankings/clans?limit=20');
    const clans = ((cr.body && cr.body.items) || []).slice(0, 4);
    for (const cl of clans) {
      const m = await call('/clans/' + encodeURIComponent(cl.tag) + '/members');
      tags = tags.concat(((m.body && m.body.items) || []).map(x => x.tag).filter(Boolean));
      await sleep(300);
    }
  }
  console.log('\nレート計測用タグ:', tags.length, '件');

  let rate = [];
  if (tags.length >= 20) rate = await probeRateLimit(tags);
  else console.log('タグ不足でレート計測スキップ');

  console.log('\n===== まとめ =====');
  console.log(JSON.stringify({ clanDepth, clanSearch, rate, 総送信数: totalSent }, null, 1));
}

main().catch(e => { console.error('probe error', e); process.exit(1); });
