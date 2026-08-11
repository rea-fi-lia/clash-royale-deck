#!/usr/bin/env node
/*
 * カード個別ページ（/cards/{slug}.html）を静的生成する。
 *
 * 背景（2026-08-11）:
 *   AdSenseに「有用性の低いコンテンツ」でサイト全体が止められた。実測すると
 *   インデックス対象は10ページ・静的テキストの総量は10,451文字しかなく、
 *   サイトの価値の本体（カード180行・人気デッキ100件・47帯の統計）は
 *   すべてJSで描画していて静的HTMLには一切現れていなかった。
 *   カード1枚ごとに「実数値・役割・呪文圏内・実戦での使われ方」を書けば、
 *   1枚あたり1,500〜2,500文字の独自コンテンツが122枚ぶん生まれる。
 *
 * 設計の要点:
 *   - ★ページの外枠（head・ヘッダ・フッタ）は glossary.html から実行時に借りる。
 *     テンプレを二重に持つと「1か所直しても全体に効かない」が再発するため。
 *   - 本文はデータから機械的に組む。文章の水増しはしない（それ自体がポリシー違反になる）。
 *   - 相互リンクを張ってクロールを回す（同コスト帯・同じ役割・関連カード）。
 *
 * 使い方:
 *   node tools/build-card-pages.js --stats /tmp/card-stats.json [--tags /tmp/card-tags.json] [--meta /tmp/meta.json]
 *   node tools/build-card-pages.js --from-r2 --from-api      … 本番データで生成
 */
const fs = require('fs');
const path = require('path');
const vm = require('vm');
const crypto = require('crypto');

const ROOT = path.join(__dirname, '..');
const OUT_DIR = path.join(ROOT, 'cards');
const SITE = 'https://crdeckbuilders.com';
const SHELL_PAGE = path.join(ROOT, 'glossary.html');   // 外枠を借りる元
const API_META = SITE + '/api/meta';

const R2_ACCOUNT_ID = process.env.R2_ACCOUNT_ID || '';
const R2_ACCESS_KEY_ID = process.env.R2_ACCESS_KEY_ID || '';
const R2_SECRET_ACCESS_KEY = process.env.R2_SECRET_ACCESS_KEY || '';
const R2_BUCKET = process.env.R2_BUCKET || 'crdb-data-private';
const R2_PRIVATE_PREFIX = process.env.R2_PRIVATE_PREFIX || 'private/';

const argOne = (n, fb) => { const i = process.argv.indexOf(n); return i >= 0 && process.argv[i + 1] ? process.argv[i + 1] : fb; };
const hasArg = n => process.argv.includes(n);
const esc = s => String(s == null ? '' : s).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');

/* ---- R2 読み取り（build-card-stats.js と同方式） ---- */
function r2Key(t) { let p = String(R2_PRIVATE_PREFIX || '').replace(/^\/+/, ''); if (p && !p.endsWith('/')) p += '/'; return p + String(t || '').replace(/^\/+/, ''); }
const sha = v => crypto.createHash('sha256').update(v || '').digest('hex');
const hmac = (k, m, e) => crypto.createHmac('sha256', k).update(m).digest(e);
async function r2ReadJson(target) {
  if (!(R2_ACCOUNT_ID && R2_ACCESS_KEY_ID && R2_SECRET_ACCESS_KEY)) throw new Error('R2の認証情報がありません');
  const host = R2_ACCOUNT_ID + '.r2.cloudflarestorage.com';
  const pathname = '/' + encodeURIComponent(R2_BUCKET) + '/' + r2Key(target).split('/').map(encodeURIComponent).join('/');
  const amzDate = new Date().toISOString().replace(/[:-]|\.\d{3}/g, ''), date = amzDate.slice(0, 8);
  const h = { host, 'x-amz-content-sha256': sha(''), 'x-amz-date': amzDate };
  const sh = Object.keys(h).sort().join(';');
  const cr = ['GET', pathname, '', Object.keys(h).sort().map(k => k + ':' + h[k] + '\n').join(''), sh, sha('')].join('\n');
  const scope = date + '/auto/s3/aws4_request';
  const sk = hmac(hmac(hmac(hmac(Buffer.from('AWS4' + R2_SECRET_ACCESS_KEY, 'utf8'), date), 'auto'), 's3'), 'aws4_request');
  h.authorization = 'AWS4-HMAC-SHA256 Credential=' + R2_ACCESS_KEY_ID + '/' + scope + ', SignedHeaders=' + sh + ', Signature=' + hmac(sk, ['AWS4-HMAC-SHA256', amzDate, scope, sha(cr)].join('\n'), 'hex');
  const res = await fetch('https://' + host + pathname, { headers: h });
  if (res.status !== 200) throw new Error('R2 read ' + target + ' ' + res.status);
  return JSON.parse(await res.text());
}

/* ---- カード定義（js/cards-data.js が正本） ---- */
function loadCards() {
  const src = fs.readFileSync(path.join(ROOT, 'js', 'cards-data.js'), 'utf8');
  const ctx = vm.createContext({ document: { addEventListener() {} }, window: {}, console });
  vm.runInContext(src.replace(/^const /gm, 'var '), ctx);
  return ctx;
}
const slugOf = u => (String(u || '').match(/\/([a-z0-9-]+)\.png/i) || [])[1] || '';

/* ---- 外枠を glossary.html から借りる ---- */
function loadShell() {
  const html = fs.readFileSync(SHELL_PAGE, 'utf8');
  const mainStart = html.indexOf('<main');
  const mainEnd = html.indexOf('</main>') + '</main>'.length;
  if (mainStart < 0 || mainEnd < 7) throw new Error('glossary.html から <main> を取り出せません');
  return { head: html.slice(0, mainStart), tail: html.slice(mainEnd) };
}
// ページ固有のメタへ差し替え。相対パス(css/... i18n.js ...)は /cards/ から見て ../ にする
function shellFor(head, o) {
  let h = head;
  h = h.replace(/<title>[\s\S]*?<\/title>/, '<title>' + esc(o.title) + '</title>');
  h = h.replace(/<meta name="description" content="[^"]*">/, '<meta name="description" content="' + esc(o.desc) + '">');
  h = h.replace(/<link rel="canonical" href="[^"]*">/, '<link rel="canonical" href="' + o.canonical + '">');
  h = h.replace(/<!--HREFLANG-->[\s\S]*?<!--\/HREFLANG-->/,
    '<link rel="alternate" hreflang="ja" href="' + o.canonical + '">\n<link rel="alternate" hreflang="x-default" href="' + o.canonical + '">');
  // /cards/ 配下から見た相対パスへ
  h = h.replace(/(href|src)="(?!https?:|\/|#|data:)([^"]+)"/g, (m, a, p) => a + '="../' + p + '"');
  if (o.jsonld) h = h.replace('</head>', '<script type="application/ld+json">' + JSON.stringify(o.jsonld) + '</script>\n</head>');
  return h;
}
function shellTail(tail) {
  return tail.replace(/(href|src)="(?!https?:|\/|#|data:)([^"]+)"/g, (m, a, p) => a + '="../' + p + '"');
}

/* ---- 実数値の読み下し ---- */
const num = v => (v && typeof v === 'object') ? (v.total != null ? v.total : null) : (typeof v === 'number' ? v : null);
function pickStat(s16, re) {
  const keys = Object.keys(s16 || {}).filter(k => re.test(k) && !/crown tower/i.test(k) && !/lost per second/i.test(k));
  if (!keys.length) return null;
  const staged = keys.filter(k => /stage/i.test(k));
  if (staged.length > 1) {
    const nOf = k => { const m = k.match(/(?:^|\D)([1-9])(?:\D|$)/); return m ? +m[1] : 0; };
    return num(s16[staged.slice().sort((a, b) => nOf(b) - nOf(a))[0]]);
  }
  return num(s16[keys[0]]);
}
const SPEED_JP = { 'Slow': 'おそい', 'Medium': 'ふつう', 'Fast': 'はやい', 'Very Fast': 'とてもはやい' };
function speedJp(s) { const m = String(s || '').match(/^([A-Za-z ]+?)\s*\((\d+)\)/); return m ? (SPEED_JP[m[1].trim()] || m[1].trim()) + '（' + m[2] + '）' : (s || '—'); }
function targetJp(t) {
  const s = String(t || '');
  if (/friendly/i.test(s)) return '味方';
  if (/building/i.test(s)) return '建物のみ';
  if (/air/i.test(s) && /ground/i.test(s)) return '空中・地上';
  if (/ground/i.test(s)) return '地上のみ';
  return s || '—';
}
function rangeJp(r) {
  const s = String(r || '');
  if (/melee/i.test(s)) { const m = s.match(/([\d.]+)/); return '近接' + (m ? '（' + m[1] + '）' : ''); }
  return s || '—';
}
const RARITY_JP = { Common: 'ノーマル', Rare: 'レア', Epic: 'スーパーレア', Legendary: 'ウルトラレア', Champion: 'チャンピオン' };
const TYPE_JP = { troop: 'ユニット', spell: '呪文', building: '建物' };

/* ---- 手動タグの日本語ラベル（シートの列名に対応） ---- */
const TAG_JP = {
  tgHp: 'タゲ取り（高HP）', tgKite: 'タゲ取り（振り向き）', tgBuilding: 'タゲ取り（施設）',
  tank: 'タンク', minitank: '中型タンク', bridgeSpam: '橋前特攻', swarm: '群れ',
  tankKiller: 'タンクキラー', defBuilding: '防衛施設', spellBait: '呪文枯渇',
  spawner: 'ユニット生成', collector: 'エリクサー生成', stun: 'スタン', stop: '凍結・停止',
  slow: '減速', knockback: 'ノックバック', pull: '引き寄せ', charge: '突進', shield: '盾持ち',
  heal: '回復', buff: 'バフ', deathSpawn: 'デス時生成', dash: 'ダッシュ', invisible: '透明',
  splash: '範囲攻撃', air: '対空', flying: '飛行', ramp: 'ランプ（生存強化）'
};
const SPELL_ZONES = ['ログ圏内', 'ザップ圏内', '矢の雨圏内', 'ファイボ圏内', 'ポイズン圏内', 'ライトニング圏内', 'ロケット圏内'];
const ZONE_SPELL = { 'ログ圏内': 'ローリングウッド', 'ザップ圏内': 'ザップ', '矢の雨圏内': '矢の雨', 'ファイボ圏内': 'ファイアボール', 'ポイズン圏内': 'ポイズン', 'ライトニング圏内': 'ライトニング', 'ロケット圏内': 'ロケット' };

function tierOf(use) {
  if (use == null) return null;
  if (use >= 8) return { label: '最上位', note: '環境の中心にいるカード' };
  if (use >= 4) return { label: '上位', note: 'よく見かけるカード' };
  if (use >= 1.5) return { label: '中位', note: '構築次第で採用されるカード' };
  return { label: '下位', note: '採用は限られた構築のみ' };
}

/* ---- 1枚ぶんの本文 ---- */
function cardBody(c, ctx, D) {
  const st = D.stats[c.name] || null;
  const attrs = (st && st.attrs) || {};
  const s16 = (st && st.s16) || {};
  const n = (st && st.n) || {};
  const zones = ((st && st.tags) || []).filter(t => SPELL_ZONES.includes(t));
  const autoTags = ((st && st.tags) || []).filter(t => !SPELL_ZONES.includes(t));
  const manual = ((D.tags[c.name] || {}).tags || []).map(k => TAG_JP[k]).filter(Boolean);
  const use = D.use[c.name] || null;                 // {use,win,games}
  const opp = D.opp[c.name] || null;                 // 対面したときの相手側勝率
  const band = D.band[c.name] || null;
  const out = [];

  const jpType = c.champion ? 'チャンピオン' : TYPE_JP[c.type] || c.type;
  const rarity = RARITY_JP[attrs.Rarity] || attrs.Rarity || '';

  /* 見出し */
  out.push('<section class="hero">');
  out.push('<div class="eyebrow">Card</div>');
  out.push('<h1>' + esc(c.name) + '｜クラロワ カードデータ</h1>');
  out.push('<p class="lead">' + esc(c.name) + 'は' + (attrs.Cost ? 'コスト' + attrs.Cost + 'の' : '') + (rarity ? rarity + '' : '') + jpType + 'です。' +
    (c.role ? '役割は' + esc(c.role) + '。' : '') +
    (c.evolved && c.hero ? '進化と英雄の両方に対応しています。' : c.evolved ? '進化（限界突破）に対応しています。' : c.hero ? '英雄に対応しています。' : '') +
    'このページの数値はレベル' + (st && st.lv ? st.lv : 16) + '基準で、公式Wikiから毎日取り直しています。</p>');
  out.push('<div class="hero-actions"><a class="btn primary" href="../index.html?add=' + encodeURIComponent(c.name) + '">このカードでデッキを組む</a><a class="btn" href="../decks.html#cards">カード人気ランキング</a></div>');
  out.push('</section>');

  /* 形態と画像 */
  out.push('<section class="section"><h2>カードの姿</h2><div class="cardpage-forms">');
  const form = (label, src, note) => '<figure class="cpf"><img src="' + src + '" alt="' + esc(c.name + ' ' + label) + '" width="150" height="180" loading="lazy"><figcaption><b>' + label + '</b><span>' + note + '</span></figcaption></figure>';
  out.push(form('通常', c.img, '基本の姿'));
  if (c.evolved) out.push(form('⚡進化', c.imgEvolved, 'デッキの進化枠に入れたときの姿'));
  if (c.hero) out.push(form('👑英雄', c.imgHero, '英雄枠に入れたときの姿'));
  out.push('</div></section>');

  /* 実数値 */
  const hp = st && st.hp16, dmg = pickStat(s16, /\bdamage$/i), dps = st && st.dps16;
  const area = pickStat(s16, /area damage/i);
  const tower = (() => { const k = Object.keys(s16).find(x => /crown tower/i.test(x)); return k ? num(s16[k]) : null; })();
  const rows = [];
  const row = (k, v) => { if (v != null && v !== '' && v !== '—') rows.push('<tr><th>' + k + '</th><td>' + esc(v) + '</td></tr>'); };
  row('コスト', attrs.Cost);
  row('体力', hp != null ? hp.toLocaleString() : null);
  row(c.type === 'spell' ? '範囲ダメージ' : '攻撃力', (c.type === 'spell' ? area : dmg) != null ? (c.type === 'spell' ? area : dmg).toLocaleString() : null);
  row('毎秒ダメージ', c.type === 'spell' ? null : (dps != null ? dps.toLocaleString() : null));
  row('タワーへのダメージ', tower != null ? tower.toLocaleString() : null);
  row('攻撃速度', attrs['Hit Speed']);
  row('攻撃対象', targetJp(attrs.Target));
  row('射程', rangeJp(attrs.Range));
  row('移動速度', speedJp(attrs.Speed));
  row('体数', attrs.Count ? String(attrs.Count).replace('x', '') + '体' : null);
  row('レアリティ', rarity);
  if (rows.length) {
    out.push('<section class="section"><h2>実数値（レベル' + (st && st.lv ? st.lv : 16) + '）</h2>');
    out.push('<table class="cardpage-stats"><tbody>' + rows.join('') + '</tbody></table>');
    out.push('<p class="note">公式Wikiの数値を毎日取り直しているので、バランス調整の翌日には反映されます。</p></section>');
  }

  /* 役割タグ */
  const allTags = [...new Set(manual.concat(autoTags))];
  if (allTags.length) {
    out.push('<section class="section"><h2>このカードの役割</h2>');
    out.push('<ul class="cardpage-tags">' + allTags.map(t => '<li>' + esc(t) + '</li>').join('') + '</ul>');
    out.push('<p>役割タグは、実数値から自動で導く分（対空・範囲攻撃・体力帯など）と、手で監修している分（タンクキラー・呪文枯渇・橋前特攻など）を合わせています。</p></section>');
  }

  /* 呪文圏内 ＝ 独自性の高い情報 */
  if (c.type !== 'spell' && hp != null) {
    out.push('<section class="section"><h2>どの呪文で落ちるか</h2>');
    if (zones.length) {
      out.push('<p>同じレベルで比べたとき、' + esc(c.name) + '（体力' + hp.toLocaleString() + '）は次の呪文1発で倒れます。</p>');
      out.push('<ul class="cardpage-zones">' + zones.map(z => '<li><b>' + esc(ZONE_SPELL[z] || z) + '</b></li>').join('') + '</ul>');
      const heavy = ['ロケット圏内', 'ライトニング圏内'].filter(z => zones.includes(z)).length === zones.length;
      out.push('<p>' + (heavy ? '小型・中型の呪文では落ちないので、処理には大きな呪文かユニットが要ります。' :
        '軽い呪文で処理されるため、まとめて出すと一掃されやすい点に注意します。') + '</p>');
    } else {
      out.push('<p>体力' + hp.toLocaleString() + 'は主要な攻撃呪文（ログ・ザップ・矢の雨・ファイアボール・ポイズン・ライトニング・ロケット）のいずれの1発でも落ちません。呪文だけで処理するのは難しいカードです。</p>');
    }
    out.push('</section>');
  }

  /* 実戦データ */
  if (use || opp || band) {
    out.push('<section class="section"><h2>実戦での使われ方</h2>');
    if (use) {
      const t = tierOf(use.use);
      out.push('<p>直近' + (D.windowDays || 3) + '日のランク戦の集計では、' + esc(c.name) + (use.f === 'e' ? '（⚡進化）' : use.f === 'h' ? '（👑英雄）' : '') +
        'の使用率は<b>' + use.use + '%</b>、このカードを入れたデッキの勝率は<b>' + use.win + '%</b>です（' + use.games.toLocaleString() + '戦）。' +
        (t ? '使用率では' + t.label + '帯にあたり、' + t.note + 'です。' : '') + '</p>');
      out.push('<p class="note">勝率はデッキ全体の勝率であって、カード単体の強さではありません。勝てる構築に採用されているという意味で読んでください。</p>');
    }
    if (opp && opp.games >= 100) {
      out.push('<p>相手のデッキに' + esc(c.name) + 'がいた試合は' + opp.games.toLocaleString() + '戦あり、その相手側の勝率は' + opp.wr + '%でした。対面したときの重さの目安になります。</p>');
    }
    if (band && band.games >= 100) {
      out.push('<p>全トロフィー帯（0〜14,000）を通した集計では' + band.games.toLocaleString() + '戦・勝率' + band.wr + '%です。サイト上ではあなたのトロフィー帯に絞った数字も見られます。</p>');
    }
    out.push('</section>');
  }

  /* よく一緒に使うカード（実戦デッキから算出） */
  const partners = Object.entries(D.partner[c.name] || {}).sort((a, b) => b[1] - a[1]).slice(0, 6);
  const myDecks = (D.decksOf[c.name] || []).slice().sort((a, b) => (b.uniq || b.count || 0) - (a.uniq || a.count || 0)).slice(0, 3);
  if (partners.length) {
    const tot = (D.decksOf[c.name] || []).reduce((a, d) => a + (d.uniq || d.count || 1), 0) || 1;
    out.push('<section class="section"><h2>よく一緒に使われるカード</h2>');
    out.push('<p>直近のランク戦で' + esc(c.name) + 'が入っていたデッキ' + (D.decksOf[c.name] || []).length + '型を数えると、次のカードとの同居が多くなっています。</p>');
    out.push('<div class="cardpage-rel">');
    partners.forEach(([nm, w]) => {
      const x = D.byName[nm]; if (!x) return;
      out.push('<a class="cpr" href="' + slugOf(x.img) + '.html"><img src="' + x.img + '" alt="' + esc(nm) + '" width="80" height="96" loading="lazy"><span>' + esc(nm) + '</span><small>同居 ' + Math.round(w / tot * 100) + '%</small></a>');
    });
    out.push('</div></section>');
  }
  if (myDecks.length) {
    out.push('<section class="section"><h2>' + esc(c.name) + 'を使う代表的なデッキ</h2>');
    myDecks.forEach(d => {
      out.push('<div class="cardpage-deck"><h3>' + esc(d.name || 'デッキ') + '</h3>');
      out.push('<p class="note">' + (d.winRate != null ? '勝率' + d.winRate + '%' : '') + (d.games ? '（' + d.games.toLocaleString() + '戦）' : '') +
        (d.uniq ? '／使用' + d.uniq + '人' : '') + (d.c3 != null ? '／3冠率' + d.c3 + '%' : '') + '</p>');
      out.push('<div class="cardpage-deckcards">');
      d.slots.forEach((nm, i) => {
        const x = D.byName[nm]; if (!x) return;
        const f = (d.forms || [])[i];
        const src = f === 'evo' ? (x.imgEvolved || x.img) : f === 'hero' ? (x.imgHero || x.img) : x.img;
        out.push('<a href="' + slugOf(x.img) + '.html" title="' + esc(nm) + '"><img src="' + src + '" alt="' + esc(nm) + '" width="56" height="68" loading="lazy"></a>');
      });
      out.push('</div></div>');
    });
    out.push('<p><a href="../decks.html">人気デッキ一覧で他の型も見る →</a></p></section>');
  }

  /* 関連カード（相互リンク＝クロールを回す） */
  const rel = D.related(c);
  if (rel.length) {
    out.push('<section class="section"><h2>関連するカード</h2><div class="cardpage-rel">');
    rel.forEach(r => {
      out.push('<a class="cpr" href="' + r.slug + '.html"><img src="' + r.img + '" alt="' + esc(r.name) + '" width="80" height="96" loading="lazy"><span>' + esc(r.name) + '</span><small>' + esc(r.why) + '</small></a>');
    });
    out.push('</div></section>');
  }

  out.push('<section class="section"><h2>次に読むページ</h2><div class="page-links">' +
    '<a href="index.html">カード一覧</a><a href="../decks.html">人気デッキ</a><a href="../guide.html">デッキ作成ガイド</a><a href="../glossary.html">用語集</a></div></section>');
  return out.join('\n');
}

/* ---- 一覧ページ ---- */
function indexBody(cards, D) {
  const byCost = {};
  cards.forEach(c => { (byCost[c.cost] || (byCost[c.cost] = [])).push(c); });
  const out = [];
  out.push('<section class="hero"><div class="eyebrow">Cards</div><h1>クラロワ 全カードデータ一覧</h1>');
  out.push('<p class="lead">' + cards.length + '枚すべてのカードについて、体力・攻撃力・毎秒ダメージ・射程・攻撃対象といった実数値と、役割、どの呪文で落ちるか、ランク戦での使用率と勝率をまとめています。数値は公式Wikiから毎日取り直しています。</p>');
  out.push('<div class="hero-actions"><a class="btn primary" href="../index.html">デッキを組む</a><a class="btn" href="../decks.html#cards">人気ランキングを見る</a></div></section>');
  Object.keys(byCost).sort((a, b) => a - b).forEach(cost => {
    out.push('<section class="section"><h2>コスト' + cost + '</h2><div class="cardpage-grid">');
    byCost[cost].forEach(c => {
      const u = D.use[c.name];
      out.push('<a class="cpg" href="' + slugOf(c.img) + '.html"><img src="' + c.img + '" alt="' + esc(c.name) + '" width="80" height="96" loading="lazy">' +
        '<span>' + esc(c.name) + '</span>' + (u ? '<small>使用' + u.use + '% / 勝率' + u.win + '%</small>' : '<small>' + esc(c.role || '') + '</small>') + '</a>');
    });
    out.push('</div></section>');
  });
  return out.join('\n');
}

/* ---- main ---- */
async function main() {
  const ctx = loadCards();
  const CARDS = ctx.CARDS;

  const stats = hasArg('--from-r2') ? await r2ReadJson('card-stats.json')
    : JSON.parse(fs.readFileSync(argOne('--stats', '/tmp/card-stats.json'), 'utf8'));
  let tagsJson = { cards: {} };
  try { tagsJson = hasArg('--from-r2') ? await r2ReadJson('card-tags.json') : JSON.parse(fs.readFileSync(argOne('--tags', '/tmp/card-tags.json'), 'utf8')); } catch (e) { console.log('（タグ未取得: ' + e.message + '）'); }
  let meta = null;
  try {
    meta = hasArg('--from-api') ? await (await fetch(API_META + '?cb=' + Math.random())).json()
      : JSON.parse(fs.readFileSync(argOne('--meta', '/tmp/meta.json'), 'utf8'));
  } catch (e) { console.log('（メタ未取得: ' + e.message + '）'); }

  const D = { stats: {}, tags: tagsJson.cards || {}, use: {}, opp: {}, band: {}, windowDays: 3 };
  (stats.cards || []).forEach(c => D.stats[c.jp] = c);
  if (meta && meta.decks) {
    D.windowDays = meta.decks.cardsWindowDays || meta.decks.windowDays || 3;
    // 同名で形態違いが並ぶので、games が最大のものを代表にする
    (meta.decks.cards || []).forEach(x => { const p = D.use[x.name]; if (!p || (x.games || 0) > (p.games || 0)) D.use[x.name] = x; });
  }
  if (meta && meta.polCardIntel && meta.polCardIntel.byOpponentCard) D.opp = meta.polCardIntel.byOpponentCard;
  if (meta && meta.trophyBandIntel && meta.trophyBandIntel.byCard) D.band = meta.trophyBandIntel.byCard;

  /* ★実戦デッキから「相棒カード」と「代表デッキ」を出す。
     カード単体の数値より、どう組まれているかの方が読み手には価値がある。 */
  const allDecks = (meta && meta.decks) ? (meta.decks.decks || []).concat(meta.decks.winDecks || []) : [];
  const seenSig = new Set(), decks = [];
  allDecks.forEach(d => { if (!d.slots) return; const k = d.slots.slice().sort().join('|'); if (seenSig.has(k)) return; seenSig.add(k); decks.push(d); });
  D.partner = {}; D.decksOf = {};
  decks.forEach(d => {
    d.slots.forEach(a => {
      (D.decksOf[a] || (D.decksOf[a] = [])).push(d);
      const m = D.partner[a] || (D.partner[a] = {});
      d.slots.forEach(b => { if (b !== a) m[b] = (m[b] || 0) + (d.uniq || d.count || 1); });
    });
  });
  D.deckCount = decks.length;

  // 関連カード：同コスト帯・同じ役割タグ・同じ呪文圏内 から数枚
  const tagsOf = c => new Set(((D.tags[c.name] || {}).tags || []));
  D.related = (c) => {
    const mine = tagsOf(c), out = [], seen = new Set([c.name]);
    const push = (x, why) => { if (seen.has(x.name) || out.length >= 6) return; seen.add(x.name); out.push({ name: x.name, slug: slugOf(x.img), img: x.img, why }); };
    CARDS.filter(x => x.name !== c.name && x.cost === c.cost).slice(0, 3).forEach(x => push(x, '同じコスト' + c.cost));
    if (mine.size) CARDS.filter(x => { const t = tagsOf(x); return x.name !== c.name && [...mine].some(k => t.has(k)); }).slice(0, 4).forEach(x => {
      const shared = [...tagsOf(x)].filter(k => mine.has(k)).map(k => TAG_JP[k]).filter(Boolean)[0];
      push(x, shared ? '同じ' + shared : '役割が近い');
    });
    return out.slice(0, 6);
  };

  D.byName = {}; CARDS.forEach(c => D.byName[c.name] = c);

  const shell = loadShell();
  fs.mkdirSync(OUT_DIR, { recursive: true });
  const written = [];

  CARDS.forEach(c => {
    const slug = slugOf(c.img);
    if (!slug) { console.log('  ✗ slugが取れない: ' + c.name); return; }
    const st = D.stats[c.name];
    const u = D.use[c.name];
    const canonical = SITE + '/cards/' + slug + '.html';
    const desc = c.name + 'の体力・攻撃力・毎秒ダメージ・射程・攻撃対象などの実数値と役割、どの呪文で落ちるか' +
      (u ? '、ランク戦での使用率' + u.use + '%・勝率' + u.win + '%' : '') + 'をまとめたページです。';
    const jsonld = {
      '@context': 'https://schema.org', '@type': 'Article',
      headline: c.name + '｜クラロワ カードデータ',
      description: desc, inLanguage: 'ja', url: canonical,
      image: c.img, isPartOf: { '@type': 'WebSite', name: 'CR Deck Builders', url: SITE },
      dateModified: (stats.updated || new Date().toISOString()).slice(0, 10)
    };
    const html = shellFor(shell.head, { title: c.name + '｜クラロワ カードデータ・実数値と役割', desc, canonical, jsonld })
      + '<main class="content-shell">\n' + cardBody(c, ctx, D) + '\n</main>'
      + shellTail(shell.tail);
    fs.writeFileSync(path.join(OUT_DIR, slug + '.html'), html, 'utf8');
    written.push({ slug, name: c.name, chars: html.replace(/<script[\s\S]*?<\/script>/g, '').replace(/<style[\s\S]*?<\/style>/g, '').replace(/<[^>]+>/g, ' ').replace(/\s+/g, ' ').trim().length });
  });

  // 一覧
  const idxCanonical = SITE + '/cards/index.html';
  const idxHtml = shellFor(shell.head, {
    title: 'クラロワ 全カードデータ一覧｜実数値・役割・使用率',
    desc: 'クラロワ全' + CARDS.length + '枚のカードの実数値（体力・攻撃力・毎秒ダメージ・射程）と役割、ランク戦での使用率・勝率をまとめた一覧です。',
    canonical: idxCanonical
  }) + '<main class="content-shell">\n' + indexBody(CARDS, D) + '\n</main>' + shellTail(shell.tail);
  fs.writeFileSync(path.join(OUT_DIR, 'index.html'), idxHtml, 'utf8');

  const total = written.reduce((a, b) => a + b.chars, 0);
  console.log('生成: ' + written.length + 'ページ ＋ 一覧1ページ');
  console.log('本文の総量: ' + total.toLocaleString() + '文字（平均 ' + Math.round(total / written.length) + '文字/ページ）');
  const thin = written.filter(w => w.chars < 700);
  if (thin.length) console.log('★700文字未満: ' + thin.length + '枚 → ' + thin.slice(0, 8).map(w => w.name + '(' + w.chars + ')').join(', '));
  return written;
}
main().catch(e => { console.error(e.stack || e.message); process.exit(1); });
