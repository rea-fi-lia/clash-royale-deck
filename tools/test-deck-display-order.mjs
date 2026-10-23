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

test('popularity explanation does not use repeated observations as the percentage denominator',()=>{
 const el={innerHTML:''};
 const view=vm.createContext({document:{getElementById:()=>el},activeTab:'pop',PLAYERS_TOTAL:69505,UNIQUE_TOTAL:1719,CUR_WINDOW:'3d',winLabel:()=> '3 days',_t:(key)=>key});
 vm.runInContext(src.slice(src.indexOf('function updateDeckTabDesc('),src.indexOf('// タブ切り替え')),view);
 view.updateDeckTabDesc();assert.equal(el.innerHTML,'decks.descUsage');
});

test('fetch failure is shown only after failure, never while the first request is pending',()=>{
 const note={textContent:''};
 const view=vm.createContext({document:{getElementById:id=>id==='aggNote'?note:null},window:{},_agg:{updated:null,failed:false},srcTextI18n:()=>'',winLabel:()=>'',CUR_WINDOW:'3d',_t:(key)=>key});
 vm.runInContext(src.slice(src.indexOf('function renderAggText('),src.indexOf('// 言語切替時：集計テキスト')),view);
 view.renderAggText();assert.equal(note.textContent,'');
 view._agg.failed=true;view.renderAggText();assert.equal(note.textContent,'decks.fetchFail');
 view._agg.failed=false;view._agg.updated='2026-10-23T16:00:00Z';view.renderAggText();assert.equal(note.textContent,'decks.lastUpdated');
});
