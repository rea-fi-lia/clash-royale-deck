import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import vm from 'node:vm';
const src=fs.readFileSync(new URL('../js/decks.js',import.meta.url),'utf8');
const fn=src.slice(src.indexOf('function popularByPlayers('),src.indexOf('// APIがカタカナ'));
const ctx=vm.createContext({activeTab:'pop',ALL_DECKS:[],WIN_DECKS:[],TREND_DECKS:[]});vm.runInContext(fn,ctx);
test('displayed popularity ranks by distinct people, not repeated observations',()=>{
 const input=[{uniq:47,count:1829,games:100},{uniq:54,count:1695,games:200},{uniq:78,count:1678,games:90}];
 assert.deepEqual(Array.from(ctx.popularByPlayers(input),d=>d.uniq),[78,54,47]);assert.equal(input[0].uniq,47);
});
test('legacy mixed data keeps its order; win and trend orders stay independent',()=>{
 const input=[{count:20},{uniq:10}];assert.deepEqual(Array.from(ctx.popularByPlayers(input)),input);
 ctx.WIN_DECKS=[{winRate:80},{winRate:70}];ctx.activeTab='win';assert.equal(ctx.currentList(),ctx.WIN_DECKS);
 ctx.TREND_DECKS=[{rise:3},{rise:1}];ctx.activeTab='trend';assert.equal(ctx.currentList(),ctx.TREND_DECKS);
});
