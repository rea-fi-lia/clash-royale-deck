const CARD_INFO = Object.fromEntries(CARDS.map(c => [c.name, {
  c: c.cost, i: c.img || '', iv: c.imgEvolved || '', ih: c.imgHero || '',
  e: !!c.evolved, h: !!c.hero, ch: !!c.champion
}]));
const CARD_YOMI = Object.fromEntries(CARDS.map(c => [c.name, c.yomi || '']));

/* ══════ カード検索の照合も「ここだけ」に書く（全ページ共通の正本） ══════
 * ★2026-08-11に確立。それまで builder.js と decks.js が別々に照合を書いていて、
 *   検索ボックスごとに拾える語が違っていた。検索ボックスを足すたびに実装を写す形は
 *   画像のときと同じ「1か所直しても全体に効かない」を生むのでやめる。
 *
 * 【鉄則】検索の絞り込みは必ず cardSearchMatch() / cardSearchFilter() を通す。
 *         c.yomi や CARD_YOMI を照合のために直接読んではいけない。
 *         違反は `node tools/check-card-images.js` が検出して落とす。
 *
 * 拾えるもの（すべて大小・ひらがな/カタカナ・全角半角・記号差を吸収）:
 *   - 正規名（"ホグライダー"）／表示名（"浪人スサノオ"）
 *   - 読み・略称（yomi。YouTube121本の実況字幕から採った130形を収録・2026-08-11）
 *   - 英語名＝画像スラッグ（"hog"／"Hog Rider"／"hogrider"）
 * 略称を足したいときは CARDS の yomi にスペース区切りで書き足すだけでよい。 */
// 半角カナ→全角カナ（濁点・半濁点を合成する）。"ﾎｸﾞ" で検索されても拾えるようにする。
var CR_HANKAKU = 'ｱｲｳｴｵｶｷｸｹｺｻｼｽｾｿﾀﾁﾂﾃﾄﾅﾆﾇﾈﾉﾊﾋﾌﾍﾎﾏﾐﾑﾒﾓﾔﾕﾖﾗﾘﾙﾚﾛﾜｦﾝｧｨｩｪｫｯｬｭｮｰ';
var CR_ZENKAKU = 'アイウエオカキクケコサシスセソタチツテトナニヌネノハヒフヘホマミムメモヤユヨラリルレロワヲンァィゥェォッャュョー';
function crHankakuToZen(s) {
  var out = '';
  for (var i = 0; i < s.length; i++) {
    var ch = s[i], j = CR_HANKAKU.indexOf(ch);
    var base = j >= 0 ? CR_ZENKAKU[j] : ch;
    var nx = s[i + 1];
    if (j >= 0 && (nx === 'ﾞ' || nx === 'ﾟ')) {
      var comp = base.normalize('NFC');
      var dak = (nx === 'ﾞ' ? '\u3099' : '\u309A');
      var merged = (comp + dak).normalize('NFC');
      if (merged.length === 1) { out += merged; i++; continue; }
    }
    out += base;
  }
  return out;
}
function crNormJa(s) {
  return crHankakuToZen(String(s == null ? '' : s))
    .toLowerCase()
    .replace(/[Ａ-Ｚａ-ｚ０-９]/g, c => String.fromCharCode(c.charCodeAt(0) - 0xFEE0)) // 全角英数→半角
    .replace(/[ァ-ヶ]/g, c => String.fromCharCode(c.charCodeAt(0) - 0x60))            // カタカナ→ひらがな
    .replace(/[・･\-\s.]/g, '');                       // 中黒・ハイフン・空白・ピリオドを無視
}
function crNormEn(s) {
  return String(s == null ? '' : s)
    .replace(/[Ａ-Ｚａ-ｚ０-９]/g, c => String.fromCharCode(c.charCodeAt(0) - 0xFEE0))
    .toLowerCase().replace(/[^a-z0-9]/g, '');
}
function cardSearchTerms(card) {
  const c = (typeof card === 'string') ? (CARDS.find(x => x.name === card) || null) : card;
  if (!c) return { ja: [], en: [] };
  const slug = ((c.img || '').match(/\/([a-z0-9-]+)\.png/i) || [])[1] || '';
  return {
    ja: [c.name, c.displayName, c.yomi].filter(Boolean).join(' ').split(/\s+/).filter(Boolean).map(crNormJa),
    en: [slug, c.name].filter(Boolean).map(crNormEn).filter(Boolean)
  };
}
function cardSearchMatch(card, query) {
  const q = String(query == null ? '' : query).trim();
  if (!q) return true;
  const t = cardSearchTerms(card);
  const qja = crNormJa(q);
  if (qja && t.ja.some(x => x.indexOf(qja) >= 0)) return true;
  const qen = crNormEn(q);
  return !!qen && t.en.some(x => x.indexOf(qen) >= 0);
}
// 完全一致で1枚に決めたいとき用（ゲームからのペースト取り込みなど）。
// 部分一致の cardSearchMatch と違い、正規化した語がぴったり一致したものだけを返す。
function cardResolveExact(word) {
  const q = crNormJa(word), qe = crNormEn(word);
  if (!q && !qe) return null;
  for (const c of CARDS) {
    const t = cardSearchTerms(c);
    if (q && t.ja.some(x => x === q)) return c.name;
    if (qe && t.en.some(x => x === qe)) return c.name;
  }
  return null;
}
// カード配列（省略時は全カード）を絞り込む。名前の配列を渡しても動く。
function cardSearchFilter(query, list) {
  const src = list || CARDS;
  return src.filter(x => cardSearchMatch(x, query));
}

/* ══════ カード画像の解決は「ここだけ」に書く（全ページ共通の正本） ══════
 * ★2026-08-11に確立したルール。
 *   それまで <img> を出す箇所が js/ 全体に22か所あり、4通りの独自ルールで
 *   画像を決めていた。そのため「1か所直しても全体に効かない」状態で、
 *   ランキングやカード検索が形態（進化/英雄）を無視して通常画像を出していた。
 *
 * 【鉄則】新しく <img> を書くときは必ず cardImageSrc() を通す。
 *         CARD_INFO の .i / .iv / .ih や CARDS の .img / .imgEvolved / .imgHero を
 *         描画側から直接読んではいけない。
 *         違反は `node tools/check-card-images.js` が検出して落とす（CIで毎回走る）。
 *
 * name : "ナイト" でも "ナイト⚡" / "ナイト👑" でも可（末尾の記号から形態を読む）
 * form : 'e'|'evolved'|'⚡' ／ 'h'|'hero'|'👑' ／ 'n'|'normal'／未指定
 *        指定が name の記号と食い違う場合は form を優先する。
 * ★存在しない形態を要求されたら通常画像へ落とす。バッジ（⚡/👑）も cardFormMark() が
 *   同じ判定を使うので、「⚡が付いているのに絵は通常」という食い違いが起きない。 */
function cardBaseName(name) { return String(name == null ? '' : name).replace(/[⚡👑]+$/, ''); }
function cardFormOf(name, form) {
  var f = form == null ? '' : String(form);
  if (!f) { var s = String(name || '').slice(cardBaseName(name).length); f = s; }
  if (f === 'e' || f === 'evo' || f === 'evolved' || f === '⚡') return 'e';
  if (f === 'h' || f === 'hero' || f === '👑') return 'h';
  return ['', 'n', 'norm', 'normal', 'champ', 'champion'].includes(f) ? 'n' : 'unknown';
}
function cardHasForm(name, form) {
  var info = CARD_INFO[cardBaseName(name)];
  if (!info) return false;
  var f = cardFormOf(name, form);
  return f === 'e' ? !!info.iv : f === 'h' ? !!info.ih : f === 'n';
}
function cardPlaceholderSrc(name) {
  var label = String(name || 'カード').replace(/[<>&"']/g, '');
  var svg = '<svg xmlns="http://www.w3.org/2000/svg" width="302" height="363"><rect x="8" y="8" width="286" height="347" rx="26" fill="#17283c" stroke="#80afd2" stroke-width="5"/><path d="M100 135h102v80H100zM100 193l30-30 26 25 18-14 28 27" fill="none" stroke="#80afd2" stroke-width="6"/><text x="151" y="255" text-anchor="middle" fill="#fff" font-size="16">' + label + '</text><text x="151" y="283" text-anchor="middle" fill="#c4d7e6" font-size="14">画像を確認中</text></svg>';
  return 'data:image/svg+xml;charset=utf-8,' + encodeURIComponent(svg);
}
function cardImageSrc(name, form) {
  var base = cardBaseName(name);
  var info = CARD_INFO[base];
  if (!info) return cardPlaceholderSrc(base);
  var f = cardFormOf(name, form);
  if (f === 'e') return info.iv || cardPlaceholderSrc(base + '・限界突破');
  if (f === 'h') return info.ih || cardPlaceholderSrc(base + '・ヒーロー');
  if (f !== 'n') return cardPlaceholderSrc(base);
  return info.i || '';
}
// 実際に表示される形態（存在しない形態を要求されたら 'n' に落ちる）
function cardShownForm(name, form) { return cardHasForm(name, form) ? cardFormOf(name, form) : 'n'; }
function cardFormMark(name, form) { var f = cardShownForm(name, form); return f === 'e' ? '⚡' : f === 'h' ? '👑' : ''; }
// <img> タグごと作る。alt と loading を書き忘れないための入口。
function cardImgTag(name, form, opt) {
  var src = cardImageSrc(name, form);
  if (!src) return '';
  var o = opt || {};
  return '<img' + (o.cls ? ' class="' + o.cls + '"' : '') + ' src="' + src + '" alt="' +
    String(o.alt != null ? o.alt : cardBaseName(name)).replace(/"/g, '&quot;') + '"' +
    (o.eager ? '' : ' loading="lazy"') + '>';
}

// Same-card, same-form fallback only. Never hide a failed image or substitute a normal form.
(function () {
  if (typeof document === 'undefined' || window.__crImgFallback) return;
  window.__crImgFallback = true;
  document.addEventListener('error', function (e) {
    var img = e && e.target;
    if (!img || img.tagName !== 'IMG') return;
    var src = img.currentSrc || img.src || '';
    if (!/cdn\.royaleapi\.com|raw\.githubusercontent\.com\/RoyaleAPI\/cr-api-assets/.test(src)) return;
    var match = src.match(/\/([a-z0-9-]+)\.png(\?.*)?$/i);
    if (!match) return;
    var step = +(img.getAttribute('data-imgfb') || 0);
    img.setAttribute('data-imgfb', String(step + 1));
    if (step === 0) {
      var host = /raw\.githubusercontent/.test(src) ? 'https://cdn.royaleapi.com/static/img/cards/' : 'https://raw.githubusercontent.com/RoyaleAPI/cr-api-assets/master/cards/';
      img.src = host + match[1] + '.png' + (match[2] || '');
      return;
    }
    var label = String(img.alt || match[1]).replace(/[<>&"']/g, '');
    img.title = label + '：画像を取得できませんでした';
    img.setAttribute('data-image-unavailable', 'true');
    img.src = cardPlaceholderSrc(label);
  }, true);
})();
