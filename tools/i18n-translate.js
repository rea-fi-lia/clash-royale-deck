#!/usr/bin/env node
/*
 * i18n-translate — 訳が無い文を見つけて、AI で訳を足す（2026-10-12）
 *
 * 何をするか：
 *   1. 訳す対象を自動で集める（tools/i18n-lib.cjs）。ページ・文が増えても一覧を手で直さない
 *   2. 言語ごとに訳が無い文を数える（人の訳 i18n.js → 本文の訳 i18n-content → 機械訳 i18n-runtime の順に探す）
 *   3. --fill のとき、無い分だけ AI に訳させ、形を確かめてから記録に足す（今ある訳は上書きしない）
 *   4. 画面の文の機械訳を js/i18n/<lang>.js に書き出す（言語ページと i18n.js が読む）
 *
 * 使い方：
 *   node tools/i18n-translate.js                         … 数えるだけ（何も書き換えない）
 *   node tools/i18n-translate.js --strict                … 英語の訳が欠けていたら終了コード1（検査用）
 *   node tools/i18n-translate.js --write-js              … 記録から js/i18n/<lang>.js を作り直すだけ
 *   node tools/i18n-translate.js --fill --engine gemini-local [--model gemini-3.8-flash] [--fallback-model gemini-3.5-flash-lite] [--langs tr,es] [--max-batches 20] [--only runtime|static]
 *   node tools/i18n-translate.js --fill --engine fugu-local [--model fugu]
 *   node tools/i18n-translate.js --fill --engine gemini-api   … GitHub の自動処理用（GEMINI_API_KEY）
 *   node tools/i18n-translate.js --fill --engine fugu-api     … GitHub の自動処理用（SAKANA_API_KEY）
 *
 * 決まり：
 *   - 送るのは公開しているサイトの文だけ（利用者の入力・個人の戦績・鍵は送らない）
 *   - 英語を先に作り、ほかの言語は日本語と英語の両方を見せて訳させる
 *   - {n} などの差し込み・HTMLのタグ・前後の空白・数字を変えた訳は捨てる。絵文字・日本語のかなが混ざった訳も捨てる
 *   - 捨てた文は訳が無いまま残る（画面では英語で出る）。次の実行でまた試す
 *   - 訳を直すときは tools/i18n-runtime/<lang>.json（画面の文）か tools/i18n-content/<lang>.json（本文）を直す。
 *     人の訳として固定したいものは i18n.js の DICT に書く（機械訳より優先される）
 */
const fs = require('fs');
const os = require('os');
const path = require('path');
const { execFileSync } = require('child_process');
const L = require('./i18n-lib.cjs');

const arg = k => { const i = process.argv.indexOf(k); return i >= 0 ? (process.argv[i + 1] && !process.argv[i + 1].startsWith('--') ? process.argv[i + 1] : true) : null; };
const has = k => process.argv.includes(k);

// ── 用語集：取り違えやすい語だけ固定する（ほかは既存の訳から例を拾う） ───────────────
const GLOSSARY = {
  '進化・限界突破 (Evolution)': { es: 'Evolución', 'pt-br': 'Evolução', fr: 'Évolution', de: 'Evolution', ru: 'Эволюция', ko: '진화', 'zh-cn': '进化', 'zh-tw': '進化', ar: 'تطوّر', tr: 'Evrim', it: 'Evoluzione', id: 'Evolusi', th: 'วิวัฒนาการ', vi: 'Tiến hóa', fa: 'تکامل', nl: 'Evolutie' },
  'ヒーロー (Hero)': { es: 'Héroe', 'pt-br': 'Herói', fr: 'Héros', de: 'Held', ru: 'Герой', ko: '영웅', 'zh-cn': '英雄', 'zh-tw': '英雄', ar: 'بطل', tr: 'Kahraman', it: 'Eroe', id: 'Hero', th: 'ฮีโร่', vi: 'Anh hùng', fa: 'قهرمان', nl: 'Held' },
  'チャンピオン (Champion)': { es: 'Campeón', 'pt-br': 'Campeão', fr: 'Champion', de: 'Champion', ru: 'Чемпион', ko: '챔피언', 'zh-cn': '冠军', 'zh-tw': '冠軍', ar: 'بطل خارق', tr: 'Şampiyon', it: 'Campione', id: 'Champion', th: 'แชมเปี้ยน', vi: 'Nhà vô địch', fa: 'چمپیون', nl: 'Kampioen' },
  'デッキ (deck)': { es: 'mazo', 'pt-br': 'deck', fr: 'deck', de: 'Deck', ru: 'колода', ko: '덱', 'zh-cn': '卡组', 'zh-tw': '牌組', ar: 'مجموعة', tr: 'deste', it: 'mazzo', id: 'dek', th: 'เด็ค', vi: 'bộ bài', fa: 'دک', nl: 'deck' },
};
// 既存の訳から例を拾う語（このサイトでの言い方にそろえるため）
const EXAMPLE_TERMS = ['エリクサー', 'コスト', 'トロフィー', 'タワー', '勝率', '呪文', '帯', '対面', '試合', '環境', '診断', '分析', '人気デッキ', 'アシスト', '勝ち筋', 'クラウン', '三冠', '建物', '対空', '小物処理', '使用率', 'ランク戦', '伝説の道', 'マイページ', 'タグ', '戦績', '苦しい相手', '受け', '主軸', 'サイクル'];

// ── 形の確かめ ────────────────────────────────────────────────────
const PLACEHOLDER_RE = /\{(\w+)\}/g;
const TAG_RE = /<\/?[a-zA-Z][^>]*>/g;
const SCRIPT_RE = { ru: /[Ѐ-ӿ]/, ko: /[가-힯]/, 'zh-cn': /[一-鿿]/, 'zh-tw': /[一-鿿]/, ar: /[؀-ۿ]/, fa: /[؀-ۿ]/, th: /[฀-๿]/ };
const setOf = (s, re) => [...String(s).matchAll(re)].map(m => m[0]).sort().join('|');
// 数字の照合。「1枚です」「2倍」のように訳で消えるのが自然な 1・2 は数えない（2026-10-12 実測で英語の正しい訳を12件捨てていた）
const digitsOf = s => (String(s).match(/\d+(?:[.,]\d+)?/g) || []).map(x => x.replace(',', '.')).filter(x => x !== '1' && x !== '2').sort().join('|');
function lead(s) { return (String(s).match(/^\s*/) || [''])[0]; }
function trail(s) { return (String(s).match(/\s*$/) || [''])[0]; }
// 前後の空白は、つなぎ合わせて使う文があるので元（英語があれば英語）に合わせる
function fitSpaces(t, ref, lang) {
  let x = asciiDigits(t).trim();
  if (lang && lang !== 'zh-cn' && lang !== 'zh-tw') x = x.replace(/\s*・\s*/g, ' · ').trim();   // 日本語の中黒は使わない
  // 元の文が中黒で始まる断片（「・たった今更新」など）は、前につなぐ文との区切りを残す
  if (/^\s*・/.test(ref) && lang !== 'zh-cn' && lang !== 'zh-tw') return ' · ' + x.replace(/^·\s*/, '') + trail(ref);
  return lead(ref) + x + trail(ref);
}
// ペルシャ数字・アラビア数字は半角にそろえる（画面のほかの数字は半角・2026-10-12 ペルシャ語で数字の違いとして捨てていた）
const asciiDigits = x => String(x).replace(/[۰-۹]/g, c => String(c.charCodeAt(0) - 0x06F0)).replace(/[٠-٩]/g, c => String(c.charCodeAt(0) - 0x0660));
function validate(lang, item, t) {
  if (typeof t !== 'string') return '文字列でない';
  const s = asciiDigits(t).trim();
  const src = item.ja, ref = item.en || item.ja;
  if (!s && src.trim()) return '空';
  if (setOf(src, PLACEHOLDER_RE) !== setOf(s, PLACEHOLDER_RE)) return '差し込み {…} が違う';
  if (setOf(src, TAG_RE) !== setOf(s, TAG_RE)) return 'HTMLのタグが違う';
  if (digitsOf(src) !== digitsOf(s) && digitsOf(ref) !== digitsOf(s)) return '数字が違う';
  // 元の文にある記号（↗ など）はそのまま。元に無い絵文字を足した訳は捨てる
  const picto = x => new Set(String(x).match(/\p{Extended_Pictographic}/gu) || []);
  const srcPicto = picto(src);
  if ([...picto(s)].some(c => !srcPicto.has(c))) return '絵文字が入っている';
  const body = s.replace(/<[^>]+>/g, '').replace(/・/g, '');   // 中黒は後で直す（fitSpaces）
  if (lang === 'zh-cn' || lang === 'zh-tw') { if (L.KANA_RE.test(body)) return 'かなが残っている'; }
  else if (L.JA_RE.test(body)) return '日本語が残っている';
  const letters = (ref.replace(/<[^>]+>|\{\w+\}/g, '').match(/\p{L}/gu) || []).length;
  if (SCRIPT_RE[lang] && letters >= 4 && !SCRIPT_RE[lang].test(s)) return 'その言語の文字が無い';
  // 日本語の文と比べるときは長さが伸びやすい（英語は日本語のおよそ2〜4倍の文字数）
  if (s.length > Math.max(40, ref.length * (item.en ? 3.5 : 5))) return '長すぎる';
  return null;
}

// ── AI に頼む ─────────────────────────────────────────────────────
const sleep = ms => new Promise(r => setTimeout(r, ms));
function extractJson(text) {
  const i = text.indexOf('{'), j = text.lastIndexOf('}');
  if (i < 0 || j < i) throw new Error('JSONが無い');
  return JSON.parse(text.slice(i, j + 1));
}
function tmpFile(content) {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'crdb-i18n-'));
  const f = path.join(dir, 'prompt.txt');
  fs.writeFileSync(f, content);
  return { f, done: () => fs.rmSync(dir, { recursive: true, force: true }) };
}
const ENGINES = {
  'gemini-local': {
    gap: 4500,   // 無料枠は1分15回まで
    model: 'gemini-3.5-flash-lite',
    async ask(prompt, model) {
      const t = tmpFile(prompt);
      try {
        const out = execFileSync(path.join(os.homedir(), '.local/bin/gemini-local'), ['ask', '--model', model, '--response-json', '--max-output-tokens', '16384', '--prompt-file', t.f],
          { encoding: 'utf8', timeout: 240000, stdio: ['ignore', 'pipe', 'pipe'], maxBuffer: 32 * 1024 * 1024 });
        return extractJson(out);
      } catch (e) { throw new Error(String((e.stderr || '') + (e.message || '')).trim().split('\n').slice(0, 2).join(' ')); }
      finally { t.done(); }
    },
  },
  'fugu-local': {
    gap: 1000,
    model: 'fugu',
    async ask(prompt, model) {
      const t = tmpFile(prompt);
      try {
        const out = execFileSync(path.join(os.homedir(), '.local/bin/fugu-local'), ['ask', '--model', model, '--max-output-tokens', '16384', '--prompt-file', t.f],
          { encoding: 'utf8', timeout: 600000, stdio: ['ignore', 'pipe', 'pipe'], maxBuffer: 32 * 1024 * 1024 });
        return extractJson(out);
      } catch (e) { throw new Error(String((e.stderr || '') + (e.message || '')).trim().split('\n').slice(0, 2).join(' ')); }
      finally { t.done(); }
    },
  },
  // GitHub の自動処理で使う形。鍵は環境変数から読み、記録や出力に出さない
  'gemini-api': {
    gap: 4500,
    model: 'gemini-3.5-flash-lite',
    async ask(prompt, model) {
      const key = process.env.GEMINI_API_KEY;
      if (!key) throw new Error('GEMINI_API_KEY が無い');
      const res = await fetch('https://generativelanguage.googleapis.com/v1beta/models/' + encodeURIComponent(model) + ':generateContent', {
        method: 'POST', headers: { 'content-type': 'application/json', 'x-goog-api-key': key },
        body: JSON.stringify({ contents: [{ role: 'user', parts: [{ text: prompt }] }], generationConfig: { responseMimeType: 'application/json', maxOutputTokens: 16384 } }),
      });
      if (!res.ok) throw new Error('Gemini API HTTP ' + res.status);
      const data = await res.json();
      const text = ((((data.candidates || [])[0] || {}).content || {}).parts || []).map(p => p.text || '').join('');
      return extractJson(text);
    },
  },
  'fugu-api': {
    gap: 1000,
    model: 'fugu',
    async ask(prompt, model) {
      const key = process.env.SAKANA_API_KEY;
      if (!key) throw new Error('SAKANA_API_KEY が無い');
      const res = await fetch('https://api.sakana.ai/v1/responses', {
        method: 'POST', headers: { 'content-type': 'application/json', authorization: 'Bearer ' + key },
        body: JSON.stringify({ model, input: prompt, max_output_tokens: 16384, reasoning: { effort: 'high' } }),
      });
      if (!res.ok) throw new Error('Fugu API HTTP ' + res.status);
      const data = await res.json();
      if (data.status && data.status !== 'completed') throw new Error('Fugu の応答が未完了: ' + data.status);
      const text = (data.output || []).flatMap(o => o.content || []).filter(c => c.type === 'output_text').map(c => c.text || '').join('');
      return extractJson(text);
    },
  },
};

function examplesFor(lang, items, known) {
  const out = [];
  const seen = new Set();
  for (const term of EXAMPLE_TERMS) {
    if (!items.some(it => it.ja.includes(term))) continue;
    let best = null;
    for (const [ja, tr] of known) {
      if (!ja.includes(term) || ja.length > 24 || seen.has(ja) || typeof tr !== 'string' || /\{|</.test(ja)) continue;
      if (!best || ja.length < best[0].length) best = [ja, tr];
    }
    if (best) { seen.add(best[0]); out.push(best); }
    if (out.length >= 14) break;
  }
  return out;
}
function promptFor(lang, kind, items, known) {
  const name = L.LANG_EN_NAME[lang];
  const glossary = Object.entries(GLOSSARY).map(([k, v]) => '- ' + k + ' → ' + (lang === 'en' ? k.replace(/^.*\((.+)\)$/, '$1') : v[lang])).join('\n');
  const ex = lang === 'en' ? [] : examplesFor(lang, items, known);
  const lines = [
    'You translate the user interface and page text of "CR Deck Builders" (crdeckbuilders.com), a free fan-made Clash Royale deck builder and deck analyzer.',
    'Translate each item from Japanese into ' + name + '.' + (lang === 'en' ? '' : ' The English reference shows the meaning; translate the meaning naturally for ' + name + '-speaking Clash Royale players, not word by word from English.'),
    kind === 'static' ? 'These are sentences and headings of web pages. Keep the tone plain and friendly.' : 'These are short UI strings (buttons, labels, messages). Keep them short like the original. Some strings are fragments that the page joins with other text: keep leading and trailing spaces and punctuation the same as the reference.',
    'Rules:',
    '- Return only one JSON object that maps every id to its translation: {"1": "...", "2": "..."}. No explanations.',
    '- Keep placeholders such as {n}, {name}, {x} exactly, the same set in every item.',
    '- Keep HTML tags exactly (same tags, same attributes, same order). Translate only the text between tags.',
    '- Keep numbers as ASCII digits (0-9), and keep %, ×, ±, # and similar symbols. Do not add emoji.',
    '- Clash Royale card names: use the official English card names exactly as they appear in the English reference (for example Hog Rider, The Log, P.E.K.K.A). Do not translate card names.',
    '- Game terms (use these exactly):',
    glossary,
  ];
  if (ex.length) {
    lines.push('- How this site already says common words in ' + name + ' (follow the same wording):');
    ex.forEach(([ja, tr]) => lines.push('  ' + ja + ' → ' + tr));
  }
  lines.push('Items (JSON array):');
  lines.push(JSON.stringify(items.map((it, i) => (lang === 'en' || !it.en ? { id: String(i + 1), ja: it.ja } : { id: String(i + 1), ja: it.ja, en: it.en })), null, 0));
  return lines.join('\n');
}
function batches(items, maxItems, maxChars) {
  const out = []; let cur = [], chars = 0;
  for (const it of items) {
    if (cur.length && (cur.length >= maxItems || chars + it.ja.length > maxChars)) { out.push(cur); cur = []; chars = 0; }
    cur.push(it); chars += it.ja.length;
  }
  if (cur.length) out.push(cur);
  return out;
}

// ── 数える ────────────────────────────────────────────────────────
function knownPairs(lang) {
  const { DICT } = L.loadI18n();
  const m = new Map();
  for (const [k, v] of Object.entries(L.contentMemory(lang))) m.set(k, v);
  for (const [k, v] of Object.entries(L.runtimeMemory(lang))) m.set(k, v);
  for (const [k, v] of Object.entries(DICT[lang] || {})) if (L.JA_RE.test(k)) m.set(k, v);
  return m;
}
function englishRef(key) {
  const { DICT } = L.loadI18n();
  if (DICT.en[key] != null) return String(DICT.en[key]);
  const r = L.runtimeMemory('en')[key];
  return r != null ? String(r) : null;
}
function missingRuntime(lang) {
  const mem = L.runtimeMemory(lang);
  return L.runtimeItems().filter(it => !L.runtimeHas(lang, it.key, mem)).map(it => ({ key: it.key, ja: it.ja, en: lang === 'en' ? null : englishRef(it.key) }));
}
function missingStatic(lang) {
  const mem = L.contentMemory(lang), en = L.contentMemory('en');
  const out = [];
  for (const k of L.staticItems().keys()) if (mem[k] == null || mem[k] === '') out.push({ key: k, ja: k, en: lang === 'en' ? null : (en[k] || null) });
  return out;
}

// ── 機械訳を js/i18n/<lang>.js に書き出す ─────────────────────────────
function jsLiteral(obj) {
  // 絵文字は \u{…} で書く（UIアイコンの点検がファイルの絵文字を数えるため）
  return JSON.stringify(obj, null, 0).replace(/\p{Extended_Pictographic}/gu, c => '\\u{' + c.codePointAt(0).toString(16).toUpperCase() + '}');
}
function writeJs() {
  const { DICT } = L.loadI18n();
  const items = L.runtimeItems();
  const memEn = L.runtimeMemory('en');
  fs.mkdirSync(L.OUT_JS_DIR, { recursive: true });
  const sizes = {};
  for (const lang of L.TARGETS) {
    const mem = L.runtimeMemory(lang);
    const out = {};
    for (const it of items) {
      if (DICT[lang] && DICT[lang][it.key] != null) continue;          // 人の訳が i18n.js にある
      let v = mem[it.key];
      if (v == null && lang !== 'en' && DICT.en[it.key] == null) v = memEn[it.key];   // その言語の訳が無い時は英語（i18n.js の英語の表に無い分だけ）
      if (v != null) out[it.key] = v;
    }
    const body = '/* 自動生成：tools/i18n-translate.js が tools/i18n-runtime/' + lang + '.json から作る。ここは直さない（訳を直すときは json か i18n.js の DICT）。 */\n'
      + '(window.CRDB_I18N_EXTRA = window.CRDB_I18N_EXTRA || {})[' + JSON.stringify(lang) + '] = ' + jsLiteral(out) + ';\n';
    fs.writeFileSync(path.join(L.OUT_JS_DIR, lang + '.js'), body);
    sizes[lang] = Object.keys(out).length;
  }
  return sizes;
}

function report(title) {
  const rows = L.TARGETS.map(lang => ({ lang, rt: missingRuntime(lang).length, st: missingStatic(lang).length }));
  console.log(title);
  console.log('  言語    画面の文の未訳  本文の未訳');
  rows.forEach(r => console.log('  ' + r.lang.padEnd(6) + String(r.rt).padStart(12) + String(r.st).padStart(10)));
  return rows;
}

async function fill() {
  const engineName = arg('--engine') || 'gemini-local';
  const engine = ENGINES[engineName];
  if (!engine) throw new Error('知らない --engine: ' + engineName + '（' + Object.keys(ENGINES).join(' / ') + '）');
  const model = typeof arg('--model') === 'string' ? arg('--model') : engine.model;
  const fallbackModel = typeof arg('--fallback-model') === 'string' ? arg('--fallback-model') : (model !== engine.model ? engine.model : null);
  const langsArg = typeof arg('--langs') === 'string' ? arg('--langs').split(',') : null;
  const langs = langsArg ? langsArg.filter(l => L.TARGETS.includes(l)) : ['en'].concat(L.TARGETS.filter(l => l !== 'en'));
  const maxBatches = Number(arg('--max-batches')) || Infinity;
  const kinds = typeof arg('--only') === 'string' ? [arg('--only')] : ['runtime', 'static'];
  let calls = 0, added = 0, rejected = 0, failedCalls = 0, limitHits = 0;
  const gap = Number(arg('--gap')) || engine.gap;   // 処理を2つ同時に回すときは広げる（例 --gap 9000）
  const rejects = [];
  outer:
  for (const lang of langs) {
    for (const kind of kinds) {
      const items = kind === 'runtime' ? missingRuntime(lang) : missingStatic(lang);
      if (!items.length) continue;
      const known = knownPairs(lang);
      const groups = kind === 'runtime' ? batches(items, 70, 2600) : batches(items, 30, 3200);
      for (const group of groups) {
        if (calls >= maxBatches) break outer;
        const prompt = promptFor(lang, kind, group, known);
        let res = null;
        for (let attempt = 1; attempt <= 3 && !res; attempt++) {
          calls++;
          // 上位のモデルが混んでいる（503）ときは、最後の1回だけ軽いモデルで頼む
          const useModel = (attempt === 3 && fallbackModel) ? fallbackModel : model;
          try { res = await engine.ask(prompt, useModel); }
          catch (e) {
            failedCalls++;
            const msg = String(e.message || e);
            console.log('  ' + lang + ' ' + kind + '：AIの呼び出しに失敗（' + attempt + '回目）' + msg.slice(0, 160));
            // gemini-local の失敗の文には「429は利用上限…」という案内が毎回付くので、状態の番号だけで見分ける。
            // 429 は1分あたりの上限のことが多いので60秒待って続け、3回続いたら1日の上限とみて止める
            if (/HTTP 429\b/.test(msg)) {
              limitHits++;
              if (limitHits >= 3) { console.log('  利用の上限に3回続けて当たったので、ここで止める（記録は保存済み）'); break outer; }
              console.log('  利用の上限（1分あたりの可能性）に当たったので60秒待つ');
              await sleep(60000);
              continue;
            }
            await sleep(attempt * 15000);
          }
          await sleep(gap);
        }
        if (!res) continue;
        limitHits = 0;
        const file = kind === 'runtime' ? path.join(L.RUNTIME_DIR, lang + '.json') : path.join(L.CONTENT_DIR, lang + '.json');
        const mem = L.readJson(file);
        group.forEach((it, i) => {
          const t = res[String(i + 1)];
          const why = validate(lang, it, t);
          if (why) { rejected++; if (rejects.length < 60) rejects.push(lang + ' ' + kind + '「' + it.ja.slice(0, 30) + '」→ ' + why + (typeof t === 'string' ? '：' + t.slice(0, 40) : '')); return; }
          mem[it.key] = fitSpaces(t, it.en || it.ja, lang);
          if (kind === 'runtime') known.set(it.key, mem[it.key]);
          added++;
        });
        L.writeJson(file, mem);
        console.log('  ' + lang + ' ' + kind + '：' + group.length + '件中 ' + group.filter((it, i) => !validate(lang, it, res[String(i + 1)])).length + '件を記録');
      }
    }
  }
  console.log('AIの呼び出し ' + calls + '回（失敗 ' + failedCalls + '）・足した訳 ' + added + '件・形が合わず捨てた訳 ' + rejected + '件（エンジン ' + engineName + ' / ' + model + '）');
  if (rejects.length) { console.log('捨てた訳の例：'); rejects.slice(0, 25).forEach(r => console.log('  ' + r)); }
  return { calls, added, rejected, failedCalls };
}

(async () => {
  if (has('--fill')) {
    report('訳を足す前');
    await fill();
    const sizes = writeJs();
    report('訳を足した後');
    console.log('js/i18n/<lang>.js を書き出した（機械訳の件数）：' + Object.entries(sizes).map(([l, n]) => l + ' ' + n).join('・'));
    return;
  }
  if (has('--write-js')) {
    const sizes = writeJs();
    console.log('js/i18n/<lang>.js を書き出した（機械訳の件数）：' + Object.entries(sizes).map(([l, n]) => l + ' ' + n).join('・'));
    return;
  }
  const rows = report('訳の取りこぼし（数えるだけ）');
  const en = rows.find(r => r.lang === 'en');
  if (en.rt || en.st) {
    const rt = missingRuntime('en').slice(0, 10).map(x => '画面の文「' + x.ja.slice(0, 40) + '」');
    const st = missingStatic('en').slice(0, 10).map(x => '本文「' + x.ja.slice(0, 40) + '」');
    console.log('英語の訳が無い文：\n  ' + rt.concat(st).join('\n  '));
    console.log('直し方：node tools/i18n-translate.js --fill --engine gemini-local（Mac Studio）→ node tools/gen-i18n.js');
    if (has('--strict')) process.exitCode = 1;
  }
})().catch(e => { console.error('止まった: ' + (e && e.message || e)); process.exit(1); });
