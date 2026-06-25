#!/usr/bin/env node
const fs = require('fs');
const path = require('path');

const ROOT = path.resolve(__dirname, '..');
const HANDOFF_ROOT = path.resolve(ROOT, '..');
const TSV = path.join(HANDOFF_ROOT, 'Fugu', 'WINCON_POLICY_OWNER_CLASSIFIED_2026-06-26.tsv');
const CARDS_JS = path.join(ROOT, 'js', 'cards-data.js');
const OUT = path.join(ROOT, 'wincon-policy.json');

const axisByType = {
  mainPressure: ['mainWincon', 'pressure'],
  directPressure: ['mainWincon', 'directDamage'],
  chipPressure: ['mainWincon', 'chipDamage'],
  siege: ['mainWincon', 'siege'],
  spellFinish: ['spellFinish', 'towerFinish'],
  secondaryPressure: ['secondaryWincon', 'pressure'],
  supportDamage: ['supportWincon', 'supportDamage'],
  cycleDefense: ['cycle', 'defense', 'pull', 'surround'],
  cycleFreeze: ['cycle', 'freeze', 'tempoControl'],
  cycleSplash: ['cycle', 'splash', 'antiSwarm', 'antiAirSmall'],
  cycleReset: ['cycle', 'reset', 'chain', 'antiSwarm'],
  cycleHeal: ['cycle', 'heal', 'survivability'],
  variableCopy: ['variable', 'copy', 'contextDependent'],
};

const displayByClass = {
  '勝ち筋': '主軸',
  '第2勝ち筋': '第2勝ち筋',
  '補助勝ち筋': '補助勝ち筋',
  'サイクル札': 'サイクル札',
  '変数カード': '変数カード',
};

function readCards() {
  const text = fs.readFileSync(CARDS_JS, 'utf8');
  const re = /\{name:"([^"]+)"[^\n]*?cost:(\d+),\s*type:"([^"]+)"/g;
  const cards = [];
  let match;
  while ((match = re.exec(text))) cards.push({ name: match[1], cost: Number(match[2]), type: match[3] });
  return cards;
}

function parseTsv() {
  const lines = fs.readFileSync(TSV, 'utf8').trimEnd().split(/\r?\n/);
  const header = lines.shift().split('\t');
  return lines.filter(Boolean).map((line, index) => {
    const cols = line.split('\t');
    const row = Object.fromEntries(header.map((key, i) => [key, cols[i] ?? '']));
    return {
      order: index + 1,
      name: row['カード名'],
      cost: Number(row['コスト']),
      class: row['分類'],
      mainWinconScore: Number(row['主勝ち筋度案']),
      secondaryWinconScore: Number(row['第二勝ち筋度案']),
      finishingScore: Number(row['詰め性能案']),
      attackType: row['責めタイプ案'],
      axes: axisByType[row['責めタイプ案']] || [],
      definition: row['定義メモ'],
      reviewMemo: row['監修メモ'],
      displayGroup: displayByClass[row['分類']] || row['分類'],
      ownerReviewed: true,
    };
  });
}

const cards = readCards();
const cardMap = new Map(cards.map(card => [card.name, card]));
const rows = parseTsv();
const policy = {};
const duplicates = [];
for (const row of rows) {
  if (policy[row.name]) duplicates.push(row.name);
  const card = cardMap.get(row.name);
  policy[row.name] = {
    ...row,
    sourceCost: card ? card.cost : null,
    sourceType: card ? card.type : null,
  };
}
const unclassified = cards.filter(card => !policy[card.name]).map(card => card.name);
const missingInCards = rows.filter(row => !cardMap.has(row.name)).map(row => row.name);
const classes = {};
for (const row of rows) classes[row.class] = (classes[row.class] || 0) + 1;
const output = {
  schemaVersion: 1,
  updated: new Date().toISOString(),
  source: 'Fugu/WINCON_POLICY_OWNER_CLASSIFIED_2026-06-26.tsv',
  ownerPolicy: true,
  notes: [
    'Google Sheets/TSV is the editing surface; this JSON is the canonical runtime input for site, Actions, Claude, and Fugu.',
    '主勝ち筋度・第二勝ち筋度はオーナー主観のカード設定。実戦で勝ち筋として成立したかはbattlelog派生データで別計算する。',
    'サイクル札は勝ち筋ではないが、回転力と補助機能でデッキ調整に効くため axes を診断に使う。',
  ],
  counts: {
    totalCards: cards.length,
    classified: rows.length,
    unclassified: unclassified.length,
    byClass: classes,
  },
  cards: policy,
  groups: Object.keys(classes).reduce((acc, key) => {
    acc[key] = rows.filter(row => row.class === key).map(row => row.name);
    return acc;
  }, {}),
  unclassified,
  validation: { duplicates, missingInCards },
};

fs.writeFileSync(OUT, JSON.stringify(output, null, 2) + '\n');
console.log(`wrote ${path.relative(process.cwd(), OUT)}`);
console.log(JSON.stringify(output.counts, null, 2));
if (duplicates.length || missingInCards.length) {
  console.error(JSON.stringify(output.validation, null, 2));
  process.exitCode = 1;
}
