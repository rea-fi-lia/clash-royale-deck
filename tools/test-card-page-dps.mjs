import test from 'node:test';
import assert from 'node:assert/strict';
import { createRequire } from 'node:module';
const require = createRequire(import.meta.url);
const { hasDpsSourceMismatch, cardBody, DPS_SOURCE_NOTE } = require('./build-card-pages.js');

test('inconsistent base DPS is flagged without mutating source values', () => {
  const stats = { Damage: 163, 'Damage per Second': 77, 'Reflected Damage': 192 };
  const attrs = { 'Hit Speed': '1.8 sec' };
  const before = structuredClone({ stats, attrs });
  assert.equal(hasDpsSourceMismatch(stats, attrs, 77), true);
  assert.deepEqual({ stats, attrs }, before);
  assert.equal(hasDpsSourceMismatch({ 'Area Damage': 212, 'Damage per second': 125 }, attrs, 125), true);
});

test('consistent values and source rounding remain displayed', () => {
  for (const dps of [90, 91]) {
    assert.equal(hasDpsSourceMismatch({ Damage: 163, 'Damage per second': dps }, { 'Hit Speed': '1.8 sec' }, dps), false);
  }
});

test('compound, staged and separately selected DPS are not treated as a plain attack cycle', () => {
  const attrs = { 'Hit Speed': '2.2 sec' };
  assert.equal(hasDpsSourceMismatch({ Damage: { per: 84, total: 840 }, 'Damage per second': 380 }, attrs, 380), false);
  assert.equal(hasDpsSourceMismatch({ Damage: 84, 'Damage per second': 380, 'Stage 2 Damage': 200 }, attrs, 380), false);
  assert.equal(hasDpsSourceMismatch({ Damage: 84, 'Damage per second': 380 }, attrs, 500), false);
});

test('missing or ambiguous source fields do not imply a numerical correction', () => {
  for (const speed of ['', '0 sec', '1–2 sec', '1.8 sec / 2 sec']) {
    assert.equal(hasDpsSourceMismatch({ Damage: 163, 'Damage per second': 77 }, { 'Hit Speed': speed }, 77), false);
  }
  assert.equal(hasDpsSourceMismatch({ Damage: 163 }, { 'Hit Speed': '1.8 sec' }, 77), false);
  assert.equal(hasDpsSourceMismatch({ Damage: 163, 'Damage per second': 77, 'Damage per Second': 90 }, { 'Hit Speed': '1.8 sec' }, 77), false);
});

test('card detail marks only conflicting DPS as pending and explains why', () => {
  const card = { name: '検証用カード', slug: 'test-card', type: 'troop' };
  const source = { attrs: { 'Hit Speed': '1.8 sec' }, combat: { level: 11, hp: 3952, dps: 77, stats: { Hitpoints: 3952, Damage: 163, 'Damage per Second': 77 } } };
  const data = { stats: { [card.name]: source }, tags: {}, use: {}, opp: {}, band: {}, partner: {}, decksOf: {}, imgOf: () => '', related: () => [] };
  const html = cardBody(card, {}, data);
  assert.match(html, /<th>毎秒ダメージ<\/th><td>確認中<\/td>/);
  assert.match(html, /<th>攻撃力<\/th><td>163<\/td>/);
  assert.match(html, /<th>体力<\/th><td>3,952<\/td>/);
  assert.ok(html.includes(DPS_SOURCE_NOTE));
  assert.equal(source.combat.dps, 77);
  source.combat.stats['Damage per Second'] = source.combat.dps = 90;
  const consistent = cardBody(card, {}, data);
  assert.match(consistent, /<th>毎秒ダメージ<\/th><td>90<\/td>/);
  assert.ok(!consistent.includes(DPS_SOURCE_NOTE));
});
