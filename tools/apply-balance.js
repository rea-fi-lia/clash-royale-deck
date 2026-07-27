#!/usr/bin/env node
/*
 * card-stats.json に公式バランス調整（確定版）の差分を適用する。
 * 変更定義は tools/balance/season-NN-final.json（RoyaleAPI確定版記事から起こした構造化データ）。
 *
 * 例:
 *   node tools/apply-balance.js --in /tmp/card-stats.json --out /tmp/card-stats-new.json \
 *     --changes tools/balance/season-84-final.json tools/balance/season-85-final.json
 *
 * 仕様:
 *   - ratio: [after, before]（Lv11基準値）→ 対象フィールドに比率適用し四捨五入。
 *     stats（表示用生値文字列）の同名フィールドも同率で更新（カンマ書式保持）。
 *   - before/after: attrs系の文字列置換。attrs.Range は n.range にも連動。
 *   - alsoScale: 同比率で連動スケールするフィールド（DPS等）。
 *   - hp16 は s16.Hitpoints と同期。dps16 は変更フィールドの旧値と一致していた場合のみ新値へ。
 *   - 各カードに balance:[{date,season,label,field,before,after}] を追記（適用履歴）。
 *   - トップレベルに appliedBalances / balanceOutOfScope / updated を記録。
 */
const fs = require('fs');

function argAll(name) {
  const out = [];
  const i = process.argv.indexOf(name);
  if (i < 0) return out;
  for (let k = i + 1; k < process.argv.length && !process.argv[k].startsWith('--'); k++) out.push(process.argv[k]);
  return out;
}
function argOne(name, fallback) { const a = argAll(name); return a[0] || fallback; }

function fmtLikeStats(oldStr, newNum) {
  const hasComma = /,/.test(String(oldStr));
  const s = String(Math.round(newNum));
  if (!hasComma) return s;
  return s.replace(/\B(?=(\d{3})+(?!\d))/g, ',');
}

function applyChange(card, ch, meta, log) {
  const [ns, key] = ch.field.split(/\.(.+)/);
  if (ns === 's16') {
    const before = card.s16 ? card.s16[key] : undefined;
    // 継続ダメージ系は {per, total} オブジェクト（tick毎×回数）
    if (before && typeof before === 'object' && typeof before.per === 'number') {
      const r = ch.ratio[0] / ch.ratio[1];
      const after = { per: Math.round(before.per * r), total: Math.round(before.total * r) };
      card.s16[key] = after;
      if (card.stats && card.stats[key] != null) {
        const m = String(card.stats[key]).match(/^([\d.]+)\s*(x\d+)\s*\(([\d.]+)\)$/);
        if (m) card.stats[key] = `${Math.round(parseFloat(m[1]) * r)} ${m[2]} (${Math.round(parseFloat(m[3]) * r)})`;
      }
      card.balance.push({ date: meta.liveAt, season: meta.season, label: ch.label, field: ch.field, before, after });
      log.push(`OK   ${card.slug} ${ch.field}: per ${before.per}->${after.per} / total ${before.total}->${after.total} (${ch.label})`);
      return;
    }
    if (typeof before !== 'number') { log.push(`SKIP ${card.slug} ${ch.field}: フィールド無し`); return; }
    const r = ch.ratio[0] / ch.ratio[1];
    const after = Math.round(before * r);
    card.s16[key] = after;
    if (card.stats && card.stats[key] != null) {
      const raw = String(card.stats[key]).replace(/,/g, '');
      const n = parseFloat(raw);
      if (Number.isFinite(n)) card.stats[key] = fmtLikeStats(card.stats[key], n * r);
    }
    if (key === 'Hitpoints' && typeof card.hp16 === 'number') card.hp16 = after;
    if (typeof card.dps16 === 'number' && card.dps16 === before) card.dps16 = after;
    for (const extra of ch.alsoScale || []) {
      const [, k2] = extra.split(/\.(.+)/);
      const b2 = card.s16 ? card.s16[k2] : undefined;
      if (typeof b2 !== 'number') { log.push(`SKIP ${card.slug} ${extra}: フィールド無し`); continue; }
      const a2 = Math.round(b2 * r);
      card.s16[k2] = a2;
      if (card.stats && card.stats[k2] != null) {
        const raw2 = String(card.stats[k2]).replace(/,/g, '');
        const n2 = parseFloat(raw2);
        if (Number.isFinite(n2)) card.stats[k2] = fmtLikeStats(card.stats[k2], n2 * r);
      }
      if (typeof card.dps16 === 'number' && card.dps16 === b2) card.dps16 = a2;
      card.balance.push({ date: meta.liveAt, season: meta.season, label: ch.label + ' (連動)', field: extra, before: b2, after: a2 });
    }
    card.balance.push({ date: meta.liveAt, season: meta.season, label: ch.label, field: ch.field, before, after });
    log.push(`OK   ${card.slug} ${ch.field}: ${before} -> ${after} (${ch.label})`);
  } else if (ns === 'attrs') {
    const before = card.attrs ? card.attrs[key] : undefined;
    if (before == null) { log.push(`SKIP ${card.slug} ${ch.field}: フィールド無し`); return; }
    card.attrs[key] = ch.after;
    if (key === 'Range' && card.n) card.n.range = parseFloat(ch.after);
    card.balance.push({ date: meta.liveAt, season: meta.season, label: ch.label, field: ch.field, before, after: ch.after });
    log.push(`OK   ${card.slug} ${ch.field}: "${before}" -> "${ch.after}" (${ch.label})`);
  } else {
    log.push(`SKIP ${card.slug} ${ch.field}: 未対応の名前空間`);
  }
}

function main() {
  const inPath = argOne('--in');
  const outPath = argOne('--out');
  const changeFiles = argAll('--changes');
  if (!inPath || !outPath || !changeFiles.length) {
    console.error('usage: apply-balance.js --in <in.json> --out <out.json> --changes <c1.json> [c2.json...]');
    process.exit(1);
  }
  const data = JSON.parse(fs.readFileSync(inPath, 'utf8'));
  const bySlug = {};
  for (const c of data.cards || []) { c.balance = c.balance || []; bySlug[c.slug] = c; }

  data.appliedBalances = data.appliedBalances || [];
  data.balanceOutOfScope = data.balanceOutOfScope || [];
  const log = [];

  for (const f of changeFiles) {
    const meta = JSON.parse(fs.readFileSync(f, 'utf8'));
    const id = `season-${meta.season}-${meta.kind}`;
    if (data.appliedBalances.includes(id)) { log.push(`SKIP ${id}: 適用済み`); continue; }
    for (const ch of meta.changes || []) {
      const card = bySlug[ch.slug];
      if (!card) { log.push(`SKIP ${ch.slug}: カード無し`); continue; }
      applyChange(card, ch, meta, log);
    }
    for (const o of meta.outOfScope || []) {
      data.balanceOutOfScope.push({ season: meta.season, date: meta.liveAt, ...o });
    }
    data.appliedBalances.push(id);
  }

  data.updated = new Date().toISOString();
  data.balanceNote = 'appliedBalances の確定版差分を適用済み。ヒーロー/進化/スポーン数系は balanceOutOfScope 参照。';
  fs.writeFileSync(outPath, JSON.stringify(data, null, 1));
  console.log(log.join('\n'));
  console.log(`\nwrote: ${outPath} (cards=${(data.cards || []).length}, applied=${data.appliedBalances.join(',')})`);
}

main();
