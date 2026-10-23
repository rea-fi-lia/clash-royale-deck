import test from 'node:test';
import assert from 'node:assert/strict';
import {createRequire} from 'node:module';
const {retagAll}=createRequire(import.meta.url)('./build-card-stats.js');
const spell=(jp,damage)=>({jp,slug:jp,n:{type:'Spell'},combat:{stats:{'Area Damage':damage}}});
const unit=(n={},stats={Hitpoints:100})=>({jp:'test',n:{type:'Troop',...n},combat:{hp:stats.Hitpoints,stats},tags:['ログ圏内']});
function check(c){retagAll([spell('ローリングウッド',268),spell('矢の雨',366),c]);return c;}
test('ground-targeting Log never gets an airborne target tag, including old cached tags',()=>{
 const c=check(unit({flying:true}));assert.ok(!c.tags.includes('ログ圏内'));assert.ok(c.tags.includes('矢の雨圏内'));
});
test('a ground unit still receives the same-level HP comparison tag',()=>{
 assert.ok(check(unit()).tags.includes('ログ圏内'));
});
test('shield and body cannot be flattened into a guaranteed one-cast kill',()=>{
 const c=check(unit({}, {Hitpoints:81,'Shield Hitpoints':256}));
 assert.equal(c.spellZoneAssessment,'shield-unverified');assert.ok(!c.tags.some(x=>x.endsWith('圏内')));
});
test('missing damage or HP does not create a lethal-spell tag',()=>{
 const c=unit({},{});retagAll([c]);assert.ok(!c.tags.some(x=>x.endsWith('圏内')));
});
