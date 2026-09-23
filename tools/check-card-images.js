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
  const files = fs.readdirSync(JS_DIR).filter(f => /\.m?js$/.test(f) && !SKIP_FILES.has(f));
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
  const files = fs.readdirSync(JS_DIR).filter(f => /\.m?js$/.test(f) && !SKIP_FILES.has(f));
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
  const targets = fs.readdirSync(JS_DIR).filter(f => /\.m?js$/.test(f) && !SKIP_FILES.has(f))
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

/* ── [1d] UXガードの読み込み ── */
function lintUxGuard() {
  console.log('\n[1d] UXガード：全ページが guard.css と ux-guard.js を読んでいるか');
  // 「横スクロールさせない」「ダブルタップで拡大させない」の正本。
  // 新しいページを作って読み込み忘れると、そのページだけ挙動が崩れるのでここで落とす。
  const pages = fs.readdirSync(ROOT).filter(f => f.endsWith('.html') && f !== '3d.html' && !/^google/.test(f));
  let bad = 0;
  pages.forEach(f => {
    const h = fs.readFileSync(path.join(ROOT, f), 'utf8');
    if (!/css\/guard\.css/.test(h)) { fail(f + ' が css/guard.css を読んでいない'); bad++; }
    if (!/js\/ux-guard\.js/.test(h)) { fail(f + ' が js/ux-guard.js を読んでいない'); bad++; }
  });
  if (!bad) ok(pages.length + 'ページすべてが読み込み済み');
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
  if (noEvo && !ctx.cardImageSrc(noEvo.name, 'e').startsWith('data:image/svg+xml')) fail('cardImageSrc: 未登録の進化が別形態の画像に置き換わっている（' + noEvo.name + '）');
  else ok('存在しない形態は確認中の画像として明示');
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
  // ★これまでは「手元にあるカードの形態」しか見ていなかったので、
  //   アップデートで**カードそのものが増えた**時に番人が黙っていた。
  //   2026-09-18 にアイスウィザードの英雄が入った時も、形態だからたまたま捕まえられただけ。
  //   公式にあって手元に無いカードを必ず名指しする（2026-09-19 追加）。
  const ourSlugs = new Set(ctx.CARDS.map(c => slugOf(c.img)).filter(Boolean));
  const missing = items
    .filter(x => !ourSlugs.has(apiSlug(x)))
    .map(x => x.name + '（' + apiSlug(x) + '）');
  if (missing.length) {
    fail('公式にあって手元に無いカード ' + missing.length + '枚 → 追加する: ' + missing.join(' / '));
    bad += missing.length;
  } else {
    ok('公式のカード ' + items.length + '枚すべてが手元にある');
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


/* ── [1e] 内部リンクの実在 ──
   ★2026-08-13、17言語すべてのナビ「全カードデータ」が404を指していた。
   gen-i18n.js が css/ と js/ だけを名指しで絶対パス化しており cards/ が漏れていたため、
   /en/cards/index.html のような存在しないURLをクローラーが踏み続けていた。
   その時の検査は使い捨てスクリプトだったので残らず、同じ壊れ方が静かに再発しうる。
   常設の番人に格上げする。 */
function lintInternalLinks() {
  console.log('\n[1e] 内部リンクの実在：href の飛び先がファイルとして在るか');
  const exts = new Set(['.html', '.css', '.js', '.json', '.xml', '.txt', '.png', '.jpg', '.svg', '.ico', '.webmanifest']);
  const skipDirs = new Set(['node_modules', '.git', 'tools', 'docs', 'gas']);
  const pages = [];
  (function walk(dir, depth) {
    if (depth > 2) return;
    for (const e of fs.readdirSync(dir, { withFileTypes: true })) {
      if (e.name.startsWith('.') || skipDirs.has(e.name)) continue;
      const full = path.join(dir, e.name);
      if (e.isDirectory()) walk(full, depth + 1);
      else if (e.name.endsWith('.html')) pages.push(full);
    }
  })(ROOT, 0);

  const broken = new Map();
  let links = 0;
  for (const file of pages) {
    const html = fs.readFileSync(file, 'utf8');
    for (const m of html.matchAll(/(?:href|src)="([^"]+)"/g)) {
      const raw = m[1].split('#')[0].split('?')[0];
      if (!raw || /^(https?:|\/\/|mailto:|tel:|javascript:|data:)/i.test(raw)) continue;
      links++;
      let target = raw.startsWith('/') ? path.join(ROOT, raw.slice(1)) : path.join(path.dirname(file), raw);
      if (raw.endsWith('/')) target = path.join(target, 'index.html');
      // 拡張子が無いものはディレクトリ扱い（/cards → /cards/index.html）
      if (!path.extname(target)) target = path.join(target, 'index.html');
      if (!exts.has(path.extname(target))) continue;
      if (!fs.existsSync(target)) {
        const rel = path.relative(ROOT, file);
        if (!broken.has(raw)) broken.set(raw, new Set());
        broken.get(raw).add(rel.split(path.sep)[0] || rel);
      }
    }
  }
  if (broken.size) {
    for (const [href, where] of [...broken].sort((a, b) => b[1].size - a[1].size)) {
      fail('壊れたリンク "' + href + '" → ' + where.size + '箇所（' + [...where].slice(0, 6).join(', ') + '）');
    }
  } else {
    ok(pages.length + 'ページ / ' + links.toLocaleString() + '本の内部リンクすべて実在');
  }
}


/* ── [1f] カード名の表が4箇所で一致しているか ──
   ★2026-09-19、新カードを js/cards-data.js（表示層）にだけ足して満足していたら、
   collect.js の slug→日本語名 が欠けたままで
   `if (!jp) return null; // 未対応カードが混じる試合は捨てる` に引っかかり、
   **そのカードを含む試合が丸ごと捨てられていた**（Fuguが検出）。
   同じ一覧が4ファイルに散っている以上、ズレは必ず起きる。機械に毎日照合させる。 */
function lintCardNameTables() {
  console.log('\n[1f] カード名の表の一致：cards-data.js と収集側がズレていないか');
  const read = f => { try { return fs.readFileSync(path.join(ROOT, f), 'utf8'); } catch (e) { return null; } };
  const names = loadCards().CARDS.map(c => c.name);
  const {collectorMaps,readCatalogue}=require('./card-catalogue.cjs');
  const maps=collectorMaps(), source=readCatalogue();
  for(const c of loadCards().CARDS) if(maps.SLUG2JP[c.slug]!==c.name || maps.COST[c.name]!==c.cost || !source.cards.find(x=>x.slug===c.slug)?.english) fail('共通台帳の不一致: '+c.name);
  if(!read('tools/collect.js').includes("require('./card-catalogue.cjs').collectorMaps()")) fail('collector must use catalogue');
  // gas/Code.gs は collect.js の移植元（2026-06-24に GAS→Actions 移行完了）。
  // 今は動いていない歴史的な写しなので、ズレても実害が無い＝警告に留める。
  // 落とすのは本番で動いているものだけ。狼少年にしないため。
  const targets = [
    ['gas/Code.gs', '旧GAS側の写し（移行済み・参考）', false],
  ];
  let bad = 0;
  for (const [file, what, isLive] of targets) {
    const src = read(file);
    if (src === null) { console.log('  – ' + file + ' が無いので省略'); continue; }
    const missing = names.filter(n => !src.includes('"' + n + '"') && !src.includes("'" + n + "'"));
    if (!missing.length) continue;
    const msg = file + '（' + what + '）に ' + missing.length + '枚が無い → ' + missing.slice(0, 5).join(' / ');
    if (isLive) { fail(msg); bad++; } else { console.log('  △ ' + msg); }
  }
  if (!bad) ok('カード' + names.length + '枚が共通台帳・収集・表示と一致');
}

(async () => {
  const ctx = loadCards();
  lintRenderSites();
  lintSearchSites();
  inventoryImageSites();
  lintUxGuard();
  lintInternalLinks();
  lintCardNameTables();
  lintDefs(ctx);
  if (!LINT_ONLY) { await checkAgainstApi(ctx); await checkUrls(ctx); }
  console.log('\n' + (failed ? '★ ' + failed + '件の問題あり' : '問題なし'));
  process.exit(failed ? 1 : 0);
})();
