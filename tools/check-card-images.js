#!/usr/bin/env node
/*
 * カード画像の網羅チェック。CIで毎回走らせて、崩れたら落とす。
 *
 * ★2026-08-11に確立したルール（なぜ必要か）:
 *   <img> を出す箇所が js/ 全体に22か所あり、それぞれが独自ルールで画像を決めていた。
 *   そのため「1か所直しても全体に効かない」状態になり、
 *   カードランキングやカード検索が形態（進化/英雄）を無視して通常画像を出していた。
 *   さらに、公式に存在しない形態（エリートバーバリアンの進化）を集計が作り出し、
 *   ⚡バッジは付くのに画像は通常、という食い違いが本番に出ていた。
 *
 * チェックする項目:
 *   [1]  描画規約 … js/*.js の <img> が cards-data.js の cardImageSrc/cardImgTag を通っているか
 *   [1b] 検索規約 … 絞り込みが cardSearchMatch/cardSearchFilter を通っているか
 *   [1c] 画像箇所の棚卸し … cardImgTag/cardImageSrc の全呼び出しを一覧化し、
 *        形態（第2引数）の指定漏れを検出する。★2026-08-11追加。
 *        「使用率/勝率/急上昇・環境シェア・デッキ分析…どこで画像を出しているか」の
 *        一括管理はこの一覧が正。ヒーロー/進化なのに通常画像が出る事故は
 *        ほぼ全て「呼び出し側が形態を渡し忘れた」ことが原因なので、
 *        全呼び出しに形態の明示を強制する（'n'=意図して通常 / null=名前の⚡👑記号から決める）。
 *        新しく画像を出す場所を作っても、この検査が自動で対象に含める。
 *   [2]  形態の正 … CARDS の evolved/hero が公式API(/cards)と一致するか
 *   [3]  画像の実在 … 全URLが実際に200を返すか（フォールバック頼みにしない）
 *   [4]  整合 … evolved なのに imgEvolved が無い等の取りこぼしが無いか
 *
 * 使い方:
 *   node tools/check-card-images.js            … [1][3][4]（ネットワークのみ）
 *   CR_TOKEN=xxx node tools/check-card-images.js  … [2]も含めた全部
 *   node tools/check-card-images.js --lint-only … [1][4]だけ（オフライン・高速）
 */
const fs = require('fs');
const path = require('path');
const vm = require('vm');

const ROOT = path.join(__dirname, '..');
const JS_DIR = path.join(ROOT, 'js');
// cards-data.js は正本そのもの、neo3d.* は本番未接続の実験ファイルなので対象外
const SKIP_FILES = new Set(['cards-data.js', 'neo3d.js']);
const LINT_ONLY = process.argv.includes('--lint-only');

let failed = 0;
const fail = m => { console.error('  ✗ ' + m); failed++; };
const ok = m => console.log('  ✓ ' + m);

function loadCards() {
  const src = fs.readFileSync(path.join(JS_DIR, 'cards-data.js'), 'utf8');
  const ctx = vm.createContext({ document: { addEventListener() {} }, window: {}, console });
  vm.runInContext(src.replace(/^const /gm, 'var '), ctx);
  return ctx;
}

/* ── [1] 描画規約 ── */
function lintRenderSites() {
  console.log('\n[1] 描画規約：<img> は cardImageSrc / cardImgTag を通す');
  const files = fs.readdirSync(JS_DIR).filter(f => f.endsWith('.js') && !SKIP_FILES.has(f));
  let hits = 0;
  // 静的生成側はHTML文字列を組むので <img> 直書きは許すが、形態フィールドの直接参照は禁止
  ['tools/build-card-pages.js'].forEach(rel => {
    const fp = path.join(ROOT, rel);
    if (!fs.existsSync(fp)) return;
    fs.readFileSync(fp, 'utf8').split('\n').forEach((line, i) => {
      if (/^\s*(\/\/|\*)/.test(line)) return;
      if (/\.(imgEvolved|imgHero)\b/.test(line)) {
        fail(rel + ':' + (i + 1) + ' で imgEvolved/imgHero を直接参照している → cardImageSrc() を使う\n      ' + line.trim().slice(0, 120));
      }
    });
  });
  files.forEach(f => {
    const lines = fs.readFileSync(path.join(JS_DIR, f), 'utf8').split('\n');
    lines.forEach((line, i) => {
      if (!/<img[^>]*\ssrc\s*=/.test(line)) return;
      hits++;
      fail(f + ':' + (i + 1) + ' で <img src=...> を直接組み立てている → cardImgTag() を使う\n      ' + line.trim().slice(0, 120));
    });
    // CARD_INFO / CARDS の画像フィールドを描画側から直接読んでいないか
    lines.forEach((line, i) => {
      if (/^\s*(\/\/|\*)/.test(line)) return;
      const m = line.match(/\.(imgEvolved|imgHero)\b/) || line.match(/\binfo\.(iv|ih)\b/);
      if (m) fail(f + ':' + (i + 1) + ' で ' + m[0] + ' を直接参照している → cardImageSrc() を使う\n      ' + line.trim().slice(0, 120));
    });
  });
  if (!hits) ok('直接の <img src=...> は無し（' + files.length + 'ファイル走査）');
}

/* ── [1b] 検索規約 ── */
function lintSearchSites() {
  console.log('\n[1b] 検索規約：カードの絞り込みは cardSearchMatch / cardSearchFilter を通す');
  const files = fs.readdirSync(JS_DIR).filter(f => f.endsWith('.js') && !SKIP_FILES.has(f));
  let bad = 0;
  files.forEach(f => {
    fs.readFileSync(path.join(JS_DIR, f), 'utf8').split('\n').forEach((line, i) => {
      if (/^\s*(\/\/|\*)/.test(line)) return;
      // 照合のために yomi / CARD_YOMI を直接読んでいないか
      if (/\.yomi\b/.test(line) || /CARD_YOMI\s*\[/.test(line)) {
        fail(f + ':' + (i + 1) + ' で yomi を直接参照している → cardSearchMatch() を使う\n      ' + line.trim().slice(0, 120));
        bad++;
      }
    });
  });
  if (!bad) ok('yomi の直接参照は無し（' + files.length + 'ファイル走査）');
  // 検索ボックスの数と、照合が正本を通っているか
  const html = fs.readdirSync(ROOT).filter(f => f.endsWith('.html'));
  let boxes = 0;
  html.forEach(f => {
    const h = fs.readFileSync(path.join(ROOT, f), 'utf8');
    boxes += (h.match(/placeholder="[^"]*(検索|絞り込み|search)[^"]*"/gi) || []).length;
  });
  const uses = files.reduce((a, f) => a + (fs.readFileSync(path.join(JS_DIR, f), 'utf8').match(/cardSearch(Match|Filter)\s*\(/g) || []).length, 0);
  console.log('  – 検索ボックス ' + boxes + '個 / 正本の呼び出し ' + uses + '箇所');
  if (boxes && !uses) fail('検索ボックスがあるのに cardSearchMatch を誰も呼んでいない');
}

/* ── [1c] 画像箇所の棚卸し＋形態指定の強制 ── */
function inventoryImageSites() {
  console.log('\n[1c] 画像を出している場所の棚卸し（形態の指定漏れを検出）');
  // 静的生成側（カード個別ページ）も対象に含める
  const targets = fs.readdirSync(JS_DIR).filter(f => f.endsWith('.js') && !SKIP_FILES.has(f))
    .map(f => ({ label: 'js/' + f, path: path.join(JS_DIR, f) }))
    .concat([{ label: 'tools/build-card-pages.js', path: path.join(ROOT, 'tools', 'build-card-pages.js') }]);
  let total = 0, missing = 0;
  targets.forEach(t => {
    if (!fs.existsSync(t.path)) return;
    const lines = fs.readFileSync(t.path, 'utf8').split('\n');
    const sites = [];
    lines.forEach((line, i) => {
      if (/^\s*(\/\/|\*)/.test(line)) return;
      let idx = 0;
      const re = /card(?:ImgTag|ImageSrc)\s*\(|(?:^|[^.\w])imgOf\s*\(/g;
      let m;
      while ((m = re.exec(line))) {
        // 定義そのもの（function cardImgTag(...)）は除外
        if (/function\s*$/.test(line.slice(0, m.index))) continue;
        // 引数部分を括弧の釣り合いで取り出し、トップレベルのカンマを数える
        const start = line.indexOf('(', m.index);
        if (start < 0) continue;
        let depth = 0, args = 1, end = -1, str = null;
        for (let k = start; k < line.length; k++) {
          const ch = line[k];
          if (str) { if (ch === str && line[k - 1] !== '\\') str = null; continue; }
          if (ch === "'" || ch === '"' || ch === '`') { str = ch; continue; }
          if (ch === '(' || ch === '{' || ch === '[') depth++;
          else if (ch === ')' || ch === '}' || ch === ']') { depth--; if (depth === 0) { end = k; break; } }
          else if (ch === ',' && depth === 1) args++;
        }
        const snippet = line.slice(m.index, end > 0 ? end + 1 : Math.min(line.length, m.index + 80)).trim();
        const oneArg = (end > 0 && args < 2);
        sites.push({ line: i + 1, snippet, oneArg });
        total++;
        if (oneArg) missing++;
      }
    });
    if (!sites.length) return;
    console.log('  ' + t.label + '（' + sites.length + '箇所）');
    sites.forEach(x => {
      if (x.oneArg) fail(t.label + ':' + x.line + ' 形態（第2引数）が未指定 → 意図して通常なら \'n\'、名前の⚡👑記号から決めるなら null を明示する\n      ' + x.snippet.slice(0, 110));
      else console.log('    L' + String(x.line).padEnd(5) + x.snippet.slice(0, 96));
    });
  });
  console.log('  – 呼び出し合計 ' + total + '箇所 / 形態未指定 ' + missing + '箇所');
}

/* ── [4] 定義の整合 ── */
function lintDefs(ctx) {
  console.log('\n[4] 定義の整合：形態フラグと画像フィールドの対応');
  const CARDS = ctx.CARDS;
  let bad = 0;
  CARDS.forEach(c => {
    if (c.evolved && !c.imgEvolved) { fail(c.name + ': evolved:true なのに imgEvolved が無い'); bad++; }
    if (!c.evolved && c.imgEvolved) { fail(c.name + ': imgEvolved はあるのに evolved:true が無い'); bad++; }
    if (c.hero && !c.imgHero) { fail(c.name + ': hero:true なのに imgHero が無い'); bad++; }
    if (!c.hero && c.imgHero) { fail(c.name + ': imgHero はあるのに hero:true が無い'); bad++; }
    if (!c.img) { fail(c.name + ': img が無い'); bad++; }
  });
  if (!bad) ok('通常' + CARDS.length + ' / 進化' + CARDS.filter(c => c.evolved).length + ' / 英雄' + CARDS.filter(c => c.hero).length + ' すべて整合');
  // 解決関数そのものの振る舞い（存在しない形態は通常へ落ちる）
  const noEvo = CARDS.find(c => !c.evolved);
  if (noEvo && ctx.cardImageSrc(noEvo.name, 'e') !== noEvo.img) fail('cardImageSrc: 存在しない進化が通常画像へ落ちていない（' + noEvo.name + '）');
  else ok('存在しない形態は通常画像へ落ちる');
  if (noEvo && ctx.cardFormMark(noEvo.name, 'e') !== '') fail('cardFormMark: 存在しない形態に⚡が付いている（' + noEvo.name + '）');
  else ok('存在しない形態にバッジが付かない');
  // 検索：略称・かな/カナ・半角/全角・英語名が全部拾えるか（実況で使われる形が入口）
  const probes = [['ホグ', 'ホグライダー'], ['ほぐ', 'ホグライダー'], ['ﾎｸﾞ', 'ホグライダー'], ['ＨＯＧ', 'ホグライダー'],
    ['hog', 'ホグライダー'], ['エリバ', 'エリートバーバリアン'], ['マジアチ', 'マジックアーチャー'],
    ['丸太', 'ローリングウッド'], ['バサ子', 'バーサーカー'], ['スノ', 'ローニン'], ['ゴルナ', 'ゴールドナイト']];
  const miss = probes.filter(([q, want]) => !ctx.cardSearchFilter(q).some(c => c.name === want));
  if (miss.length) miss.forEach(([q, w]) => fail('検索 "' + q + '" で ' + w + ' が出ない'));
  else ok('検索の代表' + probes.length + '例すべてヒット（略称/かな/カナ/半角/全角/英語名）');
  let terms = 0; CARDS.forEach(c => { terms += ctx.cardSearchTerms(c).ja.length; });
  ok('収録している読み・略称: ' + terms + '形');
}

/* ── [2] 公式APIとの突合 ── */
async function checkAgainstApi(ctx) {
  console.log('\n[2] 形態の正：公式API /cards との突合');
  const TOKEN = (process.env.CR_TOKEN || '').replace(/[^A-Za-z0-9._-]/g, '');
  if (!TOKEN) { console.log('  – CR_TOKEN が無いので省略'); return; }
  const res = await fetch('https://proxy.royaleapi.dev/v1/cards', { headers: { Authorization: 'Bearer ' + TOKEN, Accept: 'application/json', 'User-Agent': 'crdb-image-check' } });
  if (!res.ok) { fail('公式API ' + res.status); return; }
  const items = (await res.json()).items || [];
  const apiSlug = c => String(c.name).toLowerCase().replace(/[.']/g, '').replace(/\s+/g, '-');
  const apiEvo = new Set(), apiHero = new Set();
  items.forEach(c => {
    if (c.iconUrls && c.iconUrls.evolutionMedium) apiEvo.add(apiSlug(c));
    if (c.iconUrls && c.iconUrls.heroMedium) apiHero.add(apiSlug(c));
  });
  const slugOf = u => (String(u || '').match(/\/([a-z0-9-]+)\.png/i) || [])[1] || '';
  let bad = 0, warn = 0;
  // ★公式 /cards は新実装に追いつかないことがある（2026-08-11実測：エリートバーバリアンの進化は
  //   バトルログでは evolutionLevel=1 が211/231で観測され、進化画像もCDNに実在するのに
  //   /cards には evolutionMedium が無かった）。
  //   よって「公式に無い」だけでは落とさず、画像の実在で裏を取れれば警告に留める。
  const imgLives = async url => { try { return (await fetch(url, { method: 'HEAD', redirect: 'follow' })).status === 200; } catch (e) { return false; } };
  for (const c of ctx.CARDS) {
    const s = slugOf(c.img);
    if (!s || !items.some(x => apiSlug(x) === s)) continue; // slug照合できないカードは対象外
    for (const [label, apiSet, has, url] of [
      ['進化', apiEvo, !!c.evolved, c.imgEvolved],
      ['英雄', apiHero, !!c.hero, c.imgHero]]) {
      if (apiSet.has(s) === has) continue;
      if (!apiSet.has(s) && has) {
        if (url && await imgLives(url)) { console.log('  △ ' + c.name + ': ' + label + ' は公式APIにまだ無いが画像は実在（公式の反映待ちとみなす）'); warn++; }
        else { fail(c.name + ': ' + label + ' が公式にも画像にも無い → 定義から外す'); bad++; }
      } else { fail(c.name + ': ' + label + ' が公式にあるのに手元の定義に無い → 追加する'); bad++; }
    }
  }
  if (!bad) ok('公式 進化' + apiEvo.size + '枚 / 英雄' + apiHero.size + '枚 と整合' + (warn ? '（公式反映待ち ' + warn + '件）' : ''));
}

/* ── [3] 画像の実在 ── */
async function checkUrls(ctx) {
  console.log('\n[3] 画像の実在：全URLがHTTP 200を返すか');
  const urls = [];
  ctx.CARDS.forEach(c => ['img', 'imgEvolved', 'imgHero'].forEach(k => { if (c[k]) urls.push({ card: c.name, kind: k, url: c[k] }); }));
  const bad = [];
  for (let i = 0; i < urls.length; i += 12) {
    await Promise.all(urls.slice(i, i + 12).map(async t => {
      try { const r = await fetch(t.url, { method: 'HEAD', redirect: 'follow' }); if (r.status !== 200) bad.push(t.card + '/' + t.kind + ' → ' + r.status); }
      catch (e) { bad.push(t.card + '/' + t.kind + ' → 接続失敗'); }
    }));
    process.stdout.write('.');
  }
  console.log('');
  bad.forEach(b => fail(b));
  if (!bad.length) ok(urls.length + '枚すべて200');
}

(async () => {
  const ctx = loadCards();
  lintRenderSites();
  lintSearchSites();
  inventoryImageSites();
  lintDefs(ctx);
  if (!LINT_ONLY) { await checkAgainstApi(ctx); await checkUrls(ctx); }
  console.log('\n' + (failed ? '★ ' + failed + '件の問題あり' : '問題なし'));
  process.exit(failed ? 1 : 0);
})();
