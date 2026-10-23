import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import vm from 'node:vm';
import { createRequire } from 'node:module';

const require = createRequire(import.meta.url);
const source = fs.readFileSync(new URL('./i18n-translate.js', import.meta.url), 'utf8').split('(async () => {')[0];

function harness(engine, ask, extraArgs = []) {
  const saved = [];
  const context = vm.createContext({
    require: name => name === './i18n-lib.cjs' ? {
      TARGETS: ['en', 'es'], RUNTIME_DIR: '/memory', CONTENT_DIR: '/content',
      JA_RE: /[ぁ-ゖァ-ヺ一-龯]/, KANA_RE: /[ぁ-ゖァ-ヺ]/,
      readJson: () => ({ existing: 'Preserved translation' }),
      writeJson: (file, value) => saved.push({ file, value }),
    } : require(name),
    process: { argv: ['node', 'translate', '--engine', engine, ...extraArgs] },
    console: { log() {} },
    setTimeout: fn => { fn(); return 0; },
    ask,
  });
  vm.runInContext(source + `
    ENGINES[${JSON.stringify(engine)}].ask = ask;
    missingRuntime = () => Array.from({length: 71}, (_, i) => ({key: 'k' + i, ja: '保存', en: 'Save'}));
    missingStatic = () => [];
    knownPairs = () => new Map();
    promptFor = () => '';
    this.runFill = fill;
  `, context);
  return { run: () => context.runFill(), saved };
}

test('HTTP 429 stops all remaining batches and languages while retaining completed translations', async () => {
  let calls = 0;
  const h = harness('gemini-local', async () => {
    calls++;
    if (calls === 2) throw new Error('HTTP 429 quota exceeded');
    return Object.fromEntries(Array.from({ length: 70 }, (_, i) => [String(i + 1), 'Save']));
  });
  const result = await h.run();
  assert.equal(calls, 2);
  assert.equal(result.added, 70);
  assert.equal(h.saved.length, 1);
  assert.equal(h.saved[0].value.existing, 'Preserved translation');
});

test('Fugu failure does not retry or advance to another batch or language', async () => {
  for (const engine of ['fugu-local', 'fugu-api']) {
    let calls = 0;
    const h = harness(engine, async () => { calls++; throw new Error('HTTP 503 result unknown'); });
    await h.run();
    assert.equal(calls, 1);
    assert.equal(h.saved.length, 0);
  }
});

test('max-batches also caps failed requests and retries', async () => {
  let calls = 0;
  const h = harness('gemini-local', async () => { calls++; throw new Error('HTTP 503 unavailable'); }, ['--max-batches', '1']);
  await h.run();
  assert.equal(calls, 1);
  assert.equal(h.saved.length, 0);
});
