import test from 'node:test';
import assert from 'node:assert/strict';
import vm from 'node:vm';
import fs from 'node:fs';
import { normalizeTag, bindTagInput, inPeriod, availablePeriod, trophyEfficiency, mergeProgress, pendingSteps } from '../js/experience-core.mjs';

const now = Date.UTC(2026,8,22,12);
const time = ms => new Date(ms).toISOString().replace(/[-:]/g,'').replace(/\.\d+Z$/,'.000Z');
const battle = (days, extras={}) => ({t:time(now-days*864e5), ...extras});

test('ASCII, fullwidth, pasted hash and whitespace normalize identically', () => {
  assert.equal(normalizeTag(' ＃ａｂＣ１２３ q9 '),'ABC123Q9');
  assert.equal(normalizeTag('#abc123'),'ABC123');
  assert.equal(normalizeTag(null),'');
  assert.equal(normalizeTag('a-あ\n2'),'A2');
});
test('IME composition is preserved until committed, including cursor position', () => {
  const events = {}, input = {dataset:{},value:'ａ２',selectionStart:2,setAttribute(){},setSelectionRange(a,b){this.cursor=[a,b];},addEventListener(type,cb){events[type]=cb;}};
  bindTagInput(input);
  events.compositionstart(); events.input({isComposing:true});
  assert.equal(input.value,'ａ２');
  events.compositionend(); assert.equal(input.value,'A2'); assert.deepEqual(input.cursor,[2,2]);
  input.value='#ｂ３9';input.selectionStart=3;events.input({});
  assert.equal(input.value,'B39');assert.deepEqual(input.cursor,[2,2]);
});
for (const [age,days] of [[0.5,1],[3,7],[12,30],[60,365],[400,0]]) {
  test(`empty selected period falls back to shortest available: ${age} days old`,()=>assert.equal(availablePeriod([battle(age)],1,now).days,days));
}
test('a deliberate populated period is retained; no records is not an invented count',()=>{
  assert.equal(availablePeriod([battle(.2)],30,now).days,30);
  assert.deepEqual(availablePeriod([],30,now),{days:1,available:[]});
  assert.equal(inPeriod([battle(2),{t:'invalid'},battle(-1)],7,now).length,1);
});
test('trophy efficiency uses observed gain/loss, not win rate or the last unfinished interval',()=>{
  const b = [0,1,2].map((i)=>({t:time(now+i*4*60e3),tr:[9000,9030,9010][i],win:i!==1}));
  const e=trophyEfficiency(b.reverse());
  assert.deepEqual(e,{gain:30,loss:20,intervals:2,net:10,percent:60});
});
test('missing trophies, long gaps, resets and incompatible results do not inflate efficiency',()=>{
  const a={t:time(now),tr:9000,win:true};
  for(const b of [ {...a,t:time(now+864e5),tr:9030}, {...a,t:time(now+60e3),tr:7000}, {...a,t:time(now+60e3),tr:null}, {...a,t:time(now+60e3),tr:8990}]) assert.equal(trophyEfficiency([a,b]).intervals,0);
  assert.equal(trophyEfficiency([a]).percent,null);
});
test('progress retains earliest facts across devices and only new steps remain pending',()=>{
  const progress=mergeProgress({slot_v1:{shownAt:100,completedAt:300}},{slot_v1:{shownAt:200},pin_v1:{skippedAt:400}});
  assert.deepEqual(progress.slot_v1,{shownAt:100,completedAt:300});
  assert.deepEqual(pendingSteps([{id:'slot_v1'},{id:'pin_v1'},{id:'assist_v2'}],progress),[{id:'assist_v2'}]);
  assert.deepEqual(mergeProgress({'bad.path':{shownAt:1},valid:{shownAt:'x'}}),{valid:{}});
});
// Execute the production history reader/writer, with a minimal browser boundary.
test('history entry restores SLOT 2 and filters; explicit different URLs never inherit it',()=>{
  const source=fs.readFileSync(new URL('../js/builder.js',import.meta.url),'utf8');
  const start=source.indexOf('function readBuilderNavigation()');
  const end=source.indexOf("window.addEventListener('pageshow'",start);
  const elements = new Map();
  const el = key => elements.get(key) || (elements.set(key,{value:'アイス',style:{},scrollTop:140,classList:{toggle(){}},getAttribute:()=> 'true'}),elements.get(key));
  const cards = Array.from({length:8},(_,i)=>({name:'card'+i}));
  const context=vm.createContext({
    history:{state:{other:'keep'},replaceState(s){this.state=s;}},location:{pathname:'/index.html',search:'?deck=original'},
    deck:cards,currentSlot:2,_loadedSig:cards.map(c=>c.name).join(','),_slotOwner:'owner',CARDS:cards,
    activeTypes:new Set(['unit']),activeCosts:new Set([2]),costDesc:true,favSort:true,assistMode:false,
    window:{scrollY:400,CRAuth:{getUser:()=>({uid:'owner'})},addEventListener(){}},
    document:{getElementById:el,querySelector:el,querySelectorAll:()=>[]},syncTabUI(){},renderDeck(){},render(){},updateAssistPanel(){},updateSlotLoadBtn(){}
  });
  vm.runInContext(source.slice(start,end),context);
  vm.runInContext('saveBuilderNavigation(); deck=[]; currentSlot=null; restoreBuilderNavigation(readBuilderNavigation());',context);
  assert.equal(context.currentSlot,2); assert.equal(context.deck.length,8);assert.equal(context._slotOwner,'owner');
  assert.equal(context.history.state.other,'keep'); assert.equal(context.history.state.crdbBuilder.y,400);
  assert.equal(context.history.state.crdbBuilder.search,'アイス'); assert.equal(context.costDesc,true);
  context.location.search='?deck=different';assert.equal(vm.runInContext('readBuilderNavigation()',context),null);
});

test('tutorial persistence cannot cross accounts even if auth changes during a write',async()=>{
  const source=fs.readFileSync(new URL('../auth.js',import.meta.url),'utf8');
  const start=source.indexOf('  async saveTutorialProgress('), end=source.indexOf('  // ── クラロワID連携',start);
  const writes=[];let finish;
  const context=vm.createContext({mergeProgress,currentUser:{uid:'account-a'},currentProfile:{},db:{},FB:{doc:(_db,collection,uid)=>({collection,uid}),updateDoc:(ref,patch)=>{writes.push({ref,patch});return new Promise(resolve=>{finish=resolve;});}}});
  const api=vm.runInContext('({'+source.slice(start,end)+'})',context);
  const pending=api.saveTutorialProgress('account-a',{desktop_slots_v1:{shownAt:10}});
  context.currentUser={uid:'account-b'};context.currentProfile={};finish();await pending;
  assert.equal(writes[0].ref.uid,'account-a');assert.deepEqual(context.currentProfile,{});
  assert.equal(await api.saveTutorialProgress('account-a',{desktop_pin_v1:{shownAt:20}}),false);
  assert.equal(writes.length,1);
  assert.equal(writes[0].patch['tutorialProgress.desktop_slots_v1.shownAt'],10);
});
test('progress input cannot mutate prototypes',()=>{
  mergeProgress(JSON.parse('{"__proto__":{"shownAt":1},"constructor":{"shownAt":2}}'));
  assert.equal({}.shownAt,undefined);
});
