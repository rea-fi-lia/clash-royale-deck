#!/usr/bin/env node
/*
 * card-stats.json を Clash Royale 公式Wiki(fandom)から再生成する。
 *
 * 背景（2026-08-02 判明）:
 *   card-stats.json には生成コードが存在せず、一度作られたきりの静的資産だった。
 *   その結果6/11で実数値が凍結し、6月・7月のバランス調整が反映されないまま
 *   分析が回っていた。バランス調整のたびに差分を手で起こすのは追いつかないため、
 *   「現在値を取り直す」方式にして自動追従させる。
 *
 * 使い方:
 *   node tools/build-card-stats.js --base <既存card-stats.json> --out <出力.json> [--limit N] [--only slug1,slug2]
 *
 * 仕様:
 *   - カード一覧(jp/slug/page)は --base から引き継ぐ（日本語名の対応表は手作業の資産なので壊さない）
 *   - 各カードのWikiページを action=parse&prop=wikitext で取得し
 *       unit-attributes-table          → attrs（Cost/Hit Speed/Range/Target/Rarity 等）
 *       unit-statistics-table          → 各レベルの数値。最大レベル行を stats / s16 に採用
 *     を抜き出す。表が複数ある場合は先頭を主とし、2つ目以降は接頭辞つきで統合する。
 *   - n（正規化フィールド: cost/air/bld/splash/speed/range/melee/hitSpeed 等）は attrs から再計算
 *   - 取得に失敗したカードは既存値をそのまま残す（欠損で上書きしない）
 *   - 変更があったカードは changed[] に記録し、差分をログに出す
 */
const fs = require('fs');
const crypto = require('crypto');

const API = 'https://clashroyale.fandom.com/api.php';
const UA = 'crdb-card-stats-builder';

const R2_ACCOUNT_ID = process.env.R2_ACCOUNT_ID || '';
const R2_ACCESS_KEY_ID = process.env.R2_ACCESS_KEY_ID || '';
const R2_SECRET_ACCESS_KEY = process.env.R2_SECRET_ACCESS_KEY || '';
const R2_BUCKET = process.env.R2_BUCKET || 'crdb-data-private';
const R2_PRIVATE_PREFIX = process.env.R2_PRIVATE_PREFIX || 'private/';
const R2_CONFIGURED = !!(R2_ACCOUNT_ID && R2_ACCESS_KEY_ID && R2_SECRET_ACCESS_KEY && R2_BUCKET);

function argOne(name, fb) { const i = process.argv.indexOf(name); return i >= 0 && process.argv[i + 1] ? process.argv[i + 1] : fb; }
function hasArg(name) { return process.argv.includes(name); }
const sleep = ms => new Promise(r => setTimeout(r, ms));

/* ---- R2（S3互換・SigV4）。tools/export-potential-from-sheet.js と同方式 ---- */
function r2ObjectKey(t) { let p = String(R2_PRIVATE_PREFIX || '').replace(/^\/+/, ''); if (p && !p.endsWith('/')) p += '/'; return p + String(t || '').replace(/^\/+/, ''); }
function r2IsoStamp() { return new Date().toISOString().replace(/[:-]|\.\d{3}/g, ''); }
function r2Sha256Hex(v) { return crypto.createHash('sha256').update(v || '').digest('hex'); }
function r2Hmac(k, m, e) { return crypto.createHmac('sha256', k).update(m).digest(e); }
function r2SigningKey(d) {
  return r2Hmac(r2Hmac(r2Hmac(r2Hmac(Buffer.from('AWS4' + R2_SECRET_ACCESS_KEY, 'utf8'), d), 'auto'), 's3'), 'aws4_request');
}
function r2EncodeKey(k) { return String(k || '').split('/').map(encodeURIComponent).join('/'); }
async function r2Request(method, target, body, contentType) {
  if (!R2_CONFIGURED) throw new Error('R2の認証情報がありません（R2_ACCOUNT_ID / R2_ACCESS_KEY_ID / R2_SECRET_ACCESS_KEY）');
  const host = R2_ACCOUNT_ID + '.r2.cloudflarestorage.com';
  const pathname = '/' + encodeURIComponent(R2_BUCKET) + '/' + r2EncodeKey(r2ObjectKey(target));
  const payload = body == null ? '' : body;
  const payloadHash = r2Sha256Hex(payload);
  const amzDate = r2IsoStamp(), date = amzDate.slice(0, 8);
  const headers = { host, 'x-amz-content-sha256': payloadHash, 'x-amz-date': amzDate };
  if (contentType) headers['content-type'] = contentType;
  const signedHeaders = Object.keys(headers).sort().join(';');
  const canonicalHeaders = Object.keys(headers).sort().map(h => h + ':' + headers[h] + '\n').join('');
  const canonicalRequest = [method, pathname, '', canonicalHeaders, signedHeaders, payloadHash].join('\n');
  const scope = date + '/auto/s3/aws4_request';
  const stringToSign = ['AWS4-HMAC-SHA256', amzDate, scope, r2Sha256Hex(canonicalRequest)].join('\n');
  headers.authorization = 'AWS4-HMAC-SHA256 Credential=' + R2_ACCESS_KEY_ID + '/' + scope +
    ', SignedHeaders=' + signedHeaders + ', Signature=' + r2Hmac(r2SigningKey(date), stringToSign, 'hex');
  return fetch('https://' + host + pathname, { method, headers, body: payload || undefined });
}
async function r2ReadJson(target) {
  const res = await r2Request('GET', target, null, null);
  if (res.status !== 200) throw new Error('R2 read ' + target + ' ' + res.status);
  return JSON.parse(await res.text());
}
async function r2WriteJson(target, out) {
  const body = JSON.stringify(out);
  for (let a = 0; a < 3; a++) {
    const res = await r2Request('PUT', target, body, 'application/json; charset=utf-8');
    if (res.status >= 200 && res.status < 300) return true;
    if (res.status < 500) throw new Error('R2 write ' + target + ' ' + res.status + ' :: ' + (await res.text()).slice(0, 200));
    await sleep(400 * (a + 1));
  }
  throw new Error('R2 write ' + target + ' failed');
}

// ★フィールド名の正規化。Wikiはページによって "Damage per second" と "Damage Per Second" が
//   混在する。下流が扱いやすいよう小文字表記へ寄せる（既存データもこの表記だった）。
function normalizeStatKey(k) {
  return String(k).replace(/\bPer Second\b/g, 'per second').replace(/\bPer Hit\b/g, 'per hit');
}

// ★レンダリング済みHTMLを使う。wikitextだと {{#expr:}} などの計算式テンプレートが
//   未評価のまま残り数値が取れない（Wiki側はレベル別の値を式で持っている）。
async function pageHtml(page, depth) {
  const url = API + '?action=parse&page=' + encodeURIComponent(page) + '&format=json&prop=text';
  const res = await fetch(url, { headers: { 'User-Agent': UA } });
  if (!res.ok) throw new Error('wiki ' + res.status);
  const j = await res.json();
  if (j.error) throw new Error('wiki error ' + j.error.code);
  const html = j.parse.text['*'];
  // ★リダイレクトページ（例: P.E.K.K.A → P.E.K.K.A.）を追従する。
  //   追従しないと本文が空で「統計表なし」になる。
  const rd = html.match(/class="redirectText"[\s\S]*?href="\/wiki\/([^"#?]+)"/);
  if (rd && (depth || 0) < 3) {
    const target = decodeURIComponent(rd[1]);
    await sleep(120);
    return pageHtml(target, (depth || 0) + 1);
  }
  return html;
}

/* ---- HTMLテーブルのパース ---- */
function cleanCell(s) {
  return String(s || '')
    .replace(/<br\s*\/?>/gi, ' ')
    .replace(/<[^>]*>/g, '')
    .replace(/&#160;|&nbsp;/g, ' ')
    .replace(/&amp;/g, '&')
    .replace(/\s+/g, ' ')
    .trim();
}

// id が idPrefix で始まる <table> を全部返す
function tablesById(html, idPrefix) {
  const out = [];
  const re = new RegExp('<table[^>]*id="(' + idPrefix + '[^"]*)"[\\s\\S]*?<\\/table>', 'g');
  let m;
  while ((m = re.exec(html))) out.push({ id: m[1], body: m[0] });
  return out;
}

function parseTable(body) {
  const trs = [...body.matchAll(/<tr[^>]*>([\s\S]*?)<\/tr>/g)];
  let headers = [];
  const rows = [];
  for (const tr of trs) {
    const cells = [...tr[1].matchAll(/<t([hd])[^>]*>([\s\S]*?)<\/t\1>/g)].map(c => ({ th: c[1] === 'h', v: cleanCell(c[2]) }));
    if (!cells.length) continue;
    const allTh = cells.every(c => c.th);
    if (allTh && !headers.length) { headers = cells.map(c => c.v); continue; }
    rows.push(cells.map(c => c.v));
  }
  return { headers, rows: rows.filter(r => r.some(c => c !== '')) };
}

/* ---- attrs / stats の組み立て ---- */
function buildAttrs(wt) {
  const tabs = tablesById(wt, 'unit-attributes-table');
  const attrs = {};
  tabs.forEach((t, ti) => {
    const { headers, rows } = parseTable(t.body);
    if (!headers.length || !rows.length) return;
    const row = rows[0];
    headers.forEach((h, i) => {
      if (row[i] == null || row[i] === '') return;
      // 2つ目以降の表で同名見出しが来たら上書きしない（主表を優先）
      if (attrs[h] == null) attrs[h] = row[i];
    });
  });
  return attrs;
}

function buildStats(wt) {
  const tabs = tablesById(wt, 'unit-statistics-table');
  const merged = {};      // フィールド名 → 最大レベル行の値(文字列)
  let maxLv = null;
  tabs.forEach(t => {
    const { headers, rows } = parseTable(t.body);
    if (!headers.length || !rows.length) return;
    const lvIdx = headers.findIndex(h => /^Level$/i.test(h));
    let best = null, bestLv = -1;
    rows.forEach(r => {
      const lv = lvIdx >= 0 ? parseInt(String(r[lvIdx]).replace(/[^0-9]/g, ''), 10) : NaN;
      if (lvIdx < 0) { if (!best) best = r; return; }
      if (Number.isFinite(lv) && lv > bestLv) { bestLv = lv; best = r; }
    });
    if (!best) return;
    if (bestLv > 0 && (maxLv == null || bestLv > maxLv)) maxLv = bestLv;
    headers.forEach((h, i) => {
      if (/^Level$/i.test(h)) return;
      const v = best[i];
      if (v == null || v === '') return;
      const key = normalizeStatKey(h);
      if (merged[key] == null) merged[key] = v;
    });
  });
  return { stats: merged, maxLevel: maxLv };
}

function numOf(s) { const n = parseFloat(String(s == null ? '' : s).replace(/,/g, '')); return Number.isFinite(n) ? n : null; }

/* ───────── 統計表から「そのカード本体」の行を選ぶ ─────────
 * Wikiは1ページに複数の主体を並べる（例: 攻城バーバリアン＝Battle Ram行＋中のBarbarian行）。
 * ★2026-08-11に判明した実害:
 *   Wikiが「Barbarian Hitpoints」を「Hitpoints」へ改名した結果、素の "Hitpoints" を
 *   拾う実装が中身のバーバリアン(1079)を本体HPとして採用し、本体のBattle Ram(1557)を捨てていた。
 *   ゴブリンドリルも同様に 2099 → 325（出てくるゴブリン）へ化けていた。
 * 対処: Wikiの表は本体を先に書くので「表の並び順で最初の候補」を採る。全34枚で検証済み。 */
// Wikiが本体を先に書かない例外だけを明示する（増えたらここに足す）。
// ステルスブッシュ: 先頭は隠れ蓑の茂み(130)で、実体は中から出るゴブリン(490)。
const STAT_ROW_OVERRIDE = { 'suspicious-bush': { hp: 'Bush Goblin Hitpoints' } };
function pickStatKey(s16, re, slug, kind) {
  const ov = slug && STAT_ROW_OVERRIDE[slug] && STAT_ROW_OVERRIDE[slug][kind];
  if (ov && s16[ov] != null) return ov;
  const keys = Object.keys(s16).filter(k => re.test(k)
    && !/lost per second/i.test(k)      // 「毎秒失うHP」は寿命であってHPではない
    && !/crown tower/i.test(k));        // タワー限定ダメージは対ユニット判定に使わない
  if (!keys.length) return null;
  // 段階制（インフェルノ系・マイティディガー・リトルプリンス）は最終段階を代表値とする。
  // 段階1は当たり始めの最弱値で、そのカードの働きを表さない。
  // ★監修シートの「DPS16」列も最終段階で書かれており、規約をそちらへ揃える。
  const staged = keys.filter(k => /stage/i.test(k));
  if (staged.length > 1) {
    const n = k => { const m = k.match(/(?:^|\D)([1-9])(?:\D|$)/); return m ? +m[1] : 0; };
    return staged.slice().sort((a, b) => n(b) - n(a))[0];
  }
  return keys[0];
}
function numFrom(s16, key) {
  if (!key) return null;
  const v = s16[key];
  return typeof v === 'number' ? v : (v && typeof v === 'object' && typeof v.total === 'number') ? v.total : null;
}

/* ───────── 実数値から導出するタグ ─────────
 * ★2026-08-11に判明した実害:
 *   実数値は毎日更新されるのに tags は6/11の導出結果のまま凍結していた。
 *   HPが変わった84枚の「ファイボ圏内」等が古い判定のまま残り、
 *   strategy.js の呪文圏内アドバイスがズレていた。毎回まるごと引き直す。
 * ルールは6/11データから逆算し、121枚中119枚で完全一致を確認（残り2枚は旧データ側の付け漏れ）。
 * 分類タグ（小/中/大呪文・防衛/スポーン/攻城建物）はバランス調整で動かないので既存を維持する。 */
const DERIVED_TAGS = ['ログ圏内', 'ザップ圏内', '矢の雨圏内', 'ファイボ圏内', 'ポイズン圏内', 'ライトニング圏内', 'ロケット圏内',
  '高HPタンク', '準タンク', '単体高DPS', '群れ', '遠距離', '対空可', '飛行', '建物狙い', '範囲攻撃'];
const SPELL_SOURCE = { 'ログ': 'ローリングウッド', 'ザップ': 'ザップ', '矢の雨': '矢の雨', 'ファイボ': 'ファイアボール', 'ポイズン': 'ポイズン', 'ライトニング': 'ライトニング', 'ロケット': 'ロケット' };
function spellDamageTable(cards) {
  const by = {}; cards.forEach(c => by[c.jp] = c);
  const out = {};
  Object.keys(SPELL_SOURCE).forEach(k => {
    const c = by[SPELL_SOURCE[k]];
    out[k] = c ? numFrom(c.s16 || {}, pickStatKey(c.s16 || {}, /area damage|^damage$|damage per second/i, c.slug, 'dmg')) : null;
  });
  return out;
}
function deriveTags(card, spells) {
  const n = card.n || {}, isTroop = n.type === 'Troop', isSpell = n.type === 'Spell', out = [];
  if (isTroop && card.hp16 != null) {
    // 圏内 ＝ 同レベルのその呪文の総ダメージでちょうど落ちるか
    Object.keys(SPELL_SOURCE).forEach(k => {
      if (spells[k] != null && spells[k] >= card.hp16) out.push(k === 'ログ' ? 'ログ圏内' : k + '圏内');
    });
    if (card.hp16 >= 4000) out.push('高HPタンク');
    else if (card.hp16 >= 2400) out.push('準タンク');
  }
  // 単体高DPS＝タンクキラー枠。閾値470は実データの谷（プリンス450／インフェルノドラゴン482）に置く。
  // 範囲攻撃持ち（スパーキー等）は「単体」ではないので除外する。
  if (isTroop && card.dps16 != null && card.dps16 >= 470 && !n.splash) out.push('単体高DPS');
  if (isTroop && (n.count || 1) >= 3) out.push('群れ');
  if (isTroop && n.range != null && n.range >= 5) out.push('遠距離');
  if (!isSpell && n.air) out.push('対空可');
  if (n.flying) out.push('飛行');
  if (n.bld) out.push('建物狙い');
  if (isTroop && n.splash) out.push('範囲攻撃');
  return out;
}
function retagAll(cards) {
  const spells = spellDamageTable(cards);
  const changes = [];
  cards.forEach(card => {
    const keep = (card.tags || []).filter(t => !DERIVED_TAGS.includes(t)); // 分類タグは維持
    const want = deriveTags(card, spells);
    const before = (card.tags || []).filter(t => DERIVED_TAGS.includes(t));
    const add = want.filter(t => !before.includes(t)), del = before.filter(t => !want.includes(t));
    if (add.length || del.length) changes.push({ jp: card.jp, add, del });
    // 並びは「導出タグ → 分類タグ」で安定させる
    card.tags = DERIVED_TAGS.filter(t => want.includes(t)).concat(keep);
  });
  return { spells, changes };
}

function buildN(attrs, prev) {
  const target = String(attrs['Target'] || '');
  const rangeRaw = String(attrs['Range'] || '');
  const melee = /melee/i.test(rangeRaw);
  const rangeNum = melee ? null : numOf((rangeRaw.match(/[\d.]+/) || [])[0]);
  const speedNum = numOf((String(attrs['Speed'] || '').match(/\((\d+)\)/) || [])[1]);
  const countNum = numOf((String(attrs['Count'] || '').match(/(\d+)/) || [])[1]);
  return {
    cost: numOf(attrs['Cost']),
    type: attrs['Type'] || (prev && prev.type) || null,
    rarity: attrs['Rarity'] || (prev && prev.rarity) || null,
    count: countNum != null ? countNum : 1,
    // ★「Friendly Troops & Buildings」（レイジ等の味方バフ）を建物狙い/対空と誤判定しない
    air: !/friendly/i.test(target) && /air/i.test(target),
    // flying（自身が空を飛ぶか）は Transport 由来。Wikiに無い場合は既存値を尊重
    flying: /air/i.test(String(attrs['Transport'] || '')) || !!(prev && prev.flying && !attrs['Transport']),
    bld: !/friendly/i.test(target) && /building/i.test(target),
    splash: !!(prev && prev.splash), // 範囲攻撃はWikiの属性表に無いため既存値を維持（タグ側で管理）
    speed: speedNum,
    range: rangeNum,
    melee: melee,
    hitSpeed: numOf((String(attrs['Hit Speed'] || '').match(/[\d.]+/) || [])[0])
  };
}

async function main() {
  const basePath = argOne('--base');
  const outPath = argOne('--out');
  const limit = parseInt(argOne('--limit', '0'), 10);
  const only = (argOne('--only', '') || '').split(',').map(s => s.trim()).filter(Boolean);
  const fromR2 = hasArg('--from-r2');
  const publish = hasArg('--publish');
  if (!basePath && !fromR2) { console.error('usage: (--base <in.json> | --from-r2) [--out <out.json>] [--publish] [--limit N] [--only slugs]'); process.exit(1); }

  // ★土台は必ず「現在の本番データ」を読む。ローカルの古いコピーを土台にすると、
  //   本番にしか無い更新を巻き戻してしまう（2026-08-02にgit版を土台にして上書きした反省）。
  let base;
  if (fromR2) {
    base = await r2ReadJson('card-stats.json');
    console.log('土台: R2の現物 card-stats.json（updated=' + base.updated + ' cards=' + (base.cards || []).length + '）');
  } else {
    base = JSON.parse(fs.readFileSync(basePath, 'utf8'));
    console.log('土台: ' + basePath + '（updated=' + base.updated + '）');
  }
  let cards = base.cards || [];
  if (only.length) cards = cards.filter(c => only.includes(c.slug));
  if (limit > 0) cards = cards.slice(0, limit);

  const changed = [], failed = [];
  let done = 0;

  for (const card of cards) {
    try {
      const wt = await pageHtml(card.page);
      const attrs = buildAttrs(wt);
      const { stats, maxLevel } = buildStats(wt);
      if (!Object.keys(stats).length) { failed.push(card.slug + '(統計表なし)'); continue; }

      const s16 = {};
      Object.keys(stats).forEach(k => {
        const raw = stats[k];
        // "33 x8 (264)" のような継続ダメージ表記は {per,total} に分解
        const m = String(raw).match(/^([\d.,]+)\s*x\s*(\d+)\s*\(([\d.,]+)\)$/);
        if (m) { s16[k] = { per: numOf(m[1]), total: numOf(m[3]) }; return; }
        const n = numOf(raw);
        if (n != null) s16[k] = n;
      });

      const before = JSON.stringify({ s16: card.s16, attrs: card.attrs });
      card.attrs = Object.keys(attrs).length ? attrs : card.attrs;
      card.stats = stats;
      card.s16 = s16;
      card.lv = maxLevel || card.lv;
      card.n = buildN(card.attrs || {}, card.n || {});
      const hp = numFrom(s16, pickStatKey(s16, /hitpoints/i, card.slug, 'hp'));
      if (hp != null) card.hp16 = hp;
      const dps = numFrom(s16, pickStatKey(s16, /damage per second/i, card.slug, 'dps'));
      if (dps != null) card.dps16 = dps;

      const after = JSON.stringify({ s16: card.s16, attrs: card.attrs });
      if (before !== after) changed.push(card);
      done++;
      if (done % 20 === 0) console.log('  ...' + done + '/' + cards.length);
    } catch (e) {
      failed.push(card.slug + '(' + ((e && e.message) || e) + ')');
    }
    await sleep(120); // Wikiに優しく
  }

  // ★実数値を取り直したら導出タグも必ず引き直す（ここが抜けていて6/11の判定が残っていた）
  const retag = retagAll(base.cards || []);

  base.updated = new Date().toISOString();
  base.source = 'clashroyale.fandom.com';
  base.generator = 'tools/build-card-stats.js';
  if (outPath) fs.writeFileSync(outPath, JSON.stringify(base, null, 1));

  console.log('\n取得成功 ' + done + '/' + cards.length + ' | 変更あり ' + changed.length + ' | 失敗 ' + failed.length);
  console.log('呪文ダメージ(Lv最大): ' + Object.entries(retag.spells).map(([k, v]) => k + '=' + v).join(' / '));
  console.log('導出タグを更新: ' + retag.changes.length + '枚');
  retag.changes.slice(0, 40).forEach(c => console.log('  ' + c.jp +
    (c.add.length ? '  ＋[' + c.add.join(',') + ']' : '') + (c.del.length ? '  −[' + c.del.join(',') + ']' : '')));
  if (retag.changes.length > 40) console.log('  ...他 ' + (retag.changes.length - 40) + '枚');
  if (changed.length) {
    console.log('\n--- 変更のあったカード ---');
    changed.slice(0, 40).forEach(c => {
      const hp = c.s16['Hitpoints'], dmg = c.s16['Damage'] || c.s16['Area Damage'];
      console.log('  ' + c.jp + ' (' + c.slug + ') hp=' + hp + ' dmg=' + JSON.stringify(dmg));
    });
    if (changed.length > 40) console.log('  ...他 ' + (changed.length - 40) + '件');
  }
  if (failed.length) console.log('\n--- 失敗 ---\n  ' + failed.join('\n  '));
  if (outPath) console.log('\nwrote: ' + outPath);

  if (publish) {
    // 全滅（例: Wikiの構造変更やネットワーク障害）で本番を壊さないための安全弁
    if (done < cards.length * 0.8) throw new Error('取得成功が8割未満（' + done + '/' + cards.length + '）のため公開を中止');
    await r2WriteJson('card-stats.json', base);
    console.log('R2へ公開: private/card-stats.json（' + base.cards.length + '枚 / 変更 ' + changed.length + '枚）');
  }
}

main().catch(e => { console.error(e); process.exit(1); });
