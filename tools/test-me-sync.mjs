import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import vm from 'node:vm';
import * as core from '../js/experience-core.mjs';

const source = fs.readFileSync(new URL('../js/me.js', import.meta.url), 'utf8')
  .replace(/^import .*;\n/gm, '')
  .replace("  if (document.readyState === 'loading')", "  globalThis.meTest = { sync, STATE, renderSyncStatus };\n  if (document.readyState === 'loading')");
const tick = () => new Promise(resolve => setImmediate(resolve));
function fixture(tag = 'TEST', extra = {}) {
  const stamp = days => new Date(Date.now() - days * 864e5).toISOString().replace(/[-:]/g, '');
  return { tag, syncedAt: Date.now() - 864e5, battles: [
    { t: stamp(2), tr: 6000, competition: 'trophy', win: true, opp: [] },
    { t: stamp(3), tr: 5970, competition: 'trophy', win: false, opp: [] },
  ], history: { state: 'complete' }, ...extra };
}
function environment({ cached, fetcher } = {}) {
  const nodes = new Map(), storage = new Map(), timers = new Map(); let nextTimer = 0;
  const make = () => {
    const element = { hidden: false, disabled: false, innerHTML: '', textContent: '', children: [], attrs: {}, listeners: {},
      setAttribute(key, value) { this.attrs[key] = value; },
      addEventListener(key, fn) { this.listeners[key] = fn; },
      append(...items) { this.children.push(...items); },
      insertBefore(item) { this.children.push(item); },
      querySelectorAll() { return []; },
      querySelector() { return make(); },
      classList: { toggle() {} },
    };
    Object.defineProperty(element, 'id', { set(value) { this._id = value; nodes.set(value, this); }, get() { return this._id; } });
    return element;
  };
  for (const id of ['meRoot', 'meBody', 'meTagSetup', 'meTagError', 'meHeader', 'meRecordBody', 'meDecksBody', 'meEnvBody', 'meBand', 'meBandWhen', 'meBandBody', 'meTrendBody', 'meChart']) {
    const element = make(); element.id = id;
  }
  if (cached) storage.set('cr_my_cache_' + cached.tag, JSON.stringify(cached));
  const context = { ...core, console, Date, AbortController,
    CARD_WINCONS: [], cardBaseName: value => value, archetypeImgTag: () => '<svg></svg>',
    mountChart: () => () => {}, showBattle() {}, cardBuildLink: () => '', deckBuildLink: () => '',
    document: { readyState: 'loading', hidden: false, documentElement: { lang: 'ja' },
      getElementById: id => nodes.get(id) || null, querySelectorAll: () => [], createElement: make, addEventListener() {} },
    window: {},
    localStorage: { getItem: key => storage.get(key) || null, setItem: (key, value) => storage.set(key, value) },
    fetch: (...args) => context.fetcher(...args), fetcher,
    setTimeout(fn, ms) { const id = ++nextTimer; timers.set(id, { fn, ms }); return id; },
    clearTimeout(id) { timers.delete(id); },
  };
  vm.runInNewContext(source, context);
  return { api: context.meTest, node: id => nodes.get(id), context, timers,
    async runTimer(ms) { const entry = [...timers].find(([, timer]) => timer.ms === ms); assert.ok(entry, 'expected timer ' + ms); timers.delete(entry[0]); await entry[1].fn(); },
  };
}

test('cached results disclose a failed fetch; manual retry keeps the selected period and last successful timestamp', async () => {
  const cached = fixture(); let attempts = 0;
  const env = environment({ cached, fetcher: async url => {
    if (url === '/api/meta') return Response.json({});
    attempts++;
    if (attempts === 1) throw new Error('offline');
    return Response.json(fixture());
  } });
  const pending = env.api.sync('TEST');
  assert.match(env.node('meSyncMessage').textContent, /保存済み.*確認中/);
  assert.equal(env.node('meSyncRetry').disabled, true);
  await pending;
  assert.match(env.node('meSyncMessage').textContent, /通信に失敗.*保存済み/);
  assert.match(env.node('meSyncWhen').textContent, /戦績の最終取得/);
  assert.equal(env.node('meBody').hidden, false);
  assert.equal(env.node('meSyncRetry').hidden, false);
  env.api.STATE.requestedDays = 7;
  await env.node('meSyncRetry').listeners.click();
  assert.equal(attempts, 2);
  assert.equal(env.api.STATE.days, 7);
  assert.equal(env.api.STATE.requestedDays, 7);
  assert.equal(env.node('meSyncRetry').hidden, true);
  assert.match(env.node('meHeader').innerHTML, /1対1の全モード合算/);
  assert.match(env.node('meHeader').innerHTML, /引き分けも試合数に含み/);
});

test('API fetchError remains visible and a later history response clears it even when battles are unchanged', async () => {
  const saved = fixture('TEST', { fetchError: 'cr 503', history: { state: 'indexing' } });
  let attempts = 0;
  const env = environment({ fetcher: async url => url === '/api/meta' ? Response.json({}) : Response.json(++attempts === 1 ? saved : { ...saved, fetchError: null, syncedAt: Date.now() }) });
  await env.api.sync('TEST');
  assert.match(env.node('meSyncMessage').textContent, /ゲームから最新の戦績を取得できません/);
  assert.equal(env.node('meSyncRetry').hidden, false);
  const oldTime = env.node('meSyncWhen').textContent;
  await env.runTimer(15000);
  assert.equal(attempts, 2);
  assert.doesNotMatch(env.node('meSyncMessage').textContent, /取得できません/);
  assert.notEqual(env.node('meSyncWhen').textContent, oldTime);
  assert.equal(env.node('meSyncRetry').hidden, true);
});

test('first-load failure offers retry outside the hidden result and does not fabricate an acquisition time', async () => {
  let attempts = 0;
  const env = environment({ fetcher: async url => {
    if (url === '/api/meta') return Response.json({});
    if (++attempts === 1) return new Response(null, { status: 503 });
    return Response.json(fixture('TEST', { syncedAt: 0 }));
  } });
  await env.api.sync('TEST');
  assert.equal(env.node('meBody').hidden, true);
  assert.equal(env.node('meTagSetup').hidden, false);
  assert.equal(env.node('meSyncStatus').hidden, false);
  assert.equal(env.node('meSyncRetry').hidden, false);
  assert.equal(env.node('meSyncWhen').hidden, true);
  await env.node('meSyncRetry').listeners.click();
  assert.equal(env.node('meBody').hidden, false);
  assert.equal(env.node('meSyncWhen').textContent, '戦績の取得時刻は確認できません。');
});

test('a failed response for the previous tag cannot replace the current tag or its freshness state', async () => {
  let rejectPrevious;
  const env = environment({ fetcher: async url => {
    if (url === '/api/meta') return Response.json({});
    if (url.includes('OLD')) return new Promise((_, reject) => { rejectPrevious = reject; });
    return Response.json(fixture('NEW'));
  } });
  const old = env.api.sync('OLD'); await tick();
  await env.api.sync('NEW');
  rejectPrevious(new Error('late failure')); await old;
  assert.equal(env.api.STATE.data.tag, 'NEW');
  assert.doesNotMatch(env.node('meSyncMessage').textContent, /失敗|取得できません/);
  assert.equal(env.node('meSyncRetry').hidden, true);
});

test('a stalled JSON response times out, keeps saved results and exposes retry', async () => {
  let signal;
  const env = environment({ cached: fixture(), fetcher: async (url, options) => {
    if (url === '/api/meta') return Response.json({});
    signal = options.signal;
    return { ok: true, json: () => new Promise(() => {}) };
  } });
  const pending = env.api.sync('TEST'); await tick();
  await env.runTimer(12000); await pending;
  assert.equal(signal.aborted, true);
  assert.equal(env.node('meBody').hidden, false);
  assert.match(env.node('meSyncMessage').textContent, /通信に失敗/);
  assert.equal(env.node('meSyncRetry').disabled, false);
  assert.equal(env.node('meSyncRetry').hidden, false);
});
