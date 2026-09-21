#!/usr/bin/env node
/**
 * 非公開の分析コードが、この公開リポジトリに紛れ込んでいないかの番人。
 *
 * 背景（2026-09-21）:
 *   このリポジトリは PUBLIC（GitHub Pages で配信しているため private にできない）。
 *   これから作る分析は rea-fi-lia/crdb-tools（PRIVATE）だけに置く決まりにした。
 *   コピペや勘違いで公開側へ持ち込まれた瞬間に漏れるので、CIで毎回止める。
 *
 * 落とす条件:
 *   1. CRDB-PRIVATE マーカーを含むファイル（非公開側の規約でファイル先頭に必ず書く）
 *   2. tools/analysis/ 配下（非公開側の置き場と同じ名前＝取り違えの典型）
 *   3. *-private-*.json / *-private.json（私用の成果物）
 *
 * 使い方: node tools/check-private-leak.js
 * 自己診断: node tools/check-private-leak.js --self-test
 */
'use strict';
const { execSync } = require('child_process');
const fs = require('fs');
const path = require('path');

// マーカー文字列は分割して持つ。この番人自身とドキュメントが自分で引っかからないため。
const MARKER = 'CRDB' + '-PRIVATE';

// 規約を説明する文書はマーカーを書けるので除外する（コードではないため実害が無い）
const DOC_ALLOW = new Set(['tools/check-private-leak.js', 'DATA_EXPOSURE.md', 'README.md']);

function tracked() {
  return execSync('git ls-files', { encoding: 'utf8' }).split('\n').filter(Boolean);
}

function scan(files) {
  const hits = { marker: [], analysisDir: [], privateJson: [] };
  for (const f of files) {
    if (f.startsWith('tools/analysis/')) hits.analysisDir.push(f);
    if (/-private(-[^/]*)?\.json$/.test(path.basename(f))) hits.privateJson.push(f);
    if (DOC_ALLOW.has(f)) continue;
    let buf;
    try { buf = fs.readFileSync(f); } catch { continue; }
    if (buf.includes('\0')) continue;                 // バイナリは見ない
    if (buf.length > 5 * 1024 * 1024) continue;       // 巨大ファイルは見ない
    if (buf.toString('utf8').includes(MARKER)) hits.marker.push(f);
  }
  return hits;
}

function report(hits) {
  const lines = [];
  if (hits.marker.length)
    lines.push(`✗ 非公開マーカー(${MARKER})を含むファイルが公開リポジトリにあります:\n   ` + hits.marker.join('\n   '));
  if (hits.analysisDir.length)
    lines.push('✗ tools/analysis/ は非公開側(crdb-tools)の置き場です。ここに置かないでください:\n   ' + hits.analysisDir.join('\n   '));
  if (hits.privateJson.length)
    lines.push('✗ 私用の成果物(-private*.json)が追跡されています。成果物はR2へ:\n   ' + hits.privateJson.join('\n   '));
  return lines;
}

if (process.argv.includes('--self-test')) {
  // 「落ちることを確かめる」ための自己診断。わざと違反を作って検出できるか見る。
  const tmp = path.join(require('os').tmpdir(), 'crdb-leak-selftest-' + Date.now());
  fs.mkdirSync(tmp, { recursive: true });
  const bad = path.join(tmp, 'bad.js');
  fs.writeFileSync(bad, '// ' + MARKER + ' — わざと置いた違反\n');
  const h = scan([bad]);
  const ok = h.marker.length === 1;
  const h2 = scan(['tools/analysis/x.js', 'foo-private-v1.json']);
  const ok2 = h2.analysisDir.length === 1 && h2.privateJson.length === 1;
  fs.rmSync(tmp, { recursive: true, force: true });
  console.log(`自己診断: マーカー検出=${ok ? 'OK' : 'NG'} / 置き場・成果物検出=${ok2 ? 'OK' : 'NG'}`);
  process.exit(ok && ok2 ? 0 : 1);
}

const files = tracked();
const hits = scan(files);
const lines = report(hits);
if (lines.length) {
  console.error(lines.join('\n'));
  console.error('\n→ 非公開の分析は rea-fi-lia/crdb-tools（PRIVATE）に置いてください。');
  console.error('   ここは PUBLIC です。入れた時点で全世界から読めます。');
  process.exit(1);
}
console.log(`✓ 非公開コードの混入なし（追跡 ${files.length} ファイルを検査）`);
