// CARD_INFO は js/cards-data.js（CARDSから自動導出）に移動
// カード名→略称(index.htmlのyomiを再利用・検索用)
// CARD_YOMI は js/cards-data.js（CARDSから自動導出）に移動
const DECKS=[{"name": "ホグ 2.6 サイクル", "sub": "王道サイクル。安定した攻めと低コスト", "slots": ["大砲", "マスケット銃士", "ホグライダー", "アイススピリット", "スケルトン", "コウモリの群れ", "ファイアボール", "ローリングウッド"], "evo": "大砲", "champ": "マスケット銃士"}, {"name": "ロイヤルジャイアント サイクル", "sub": "遠距離タンクで塔を削る定番", "slots": ["ロイヤルジャイアント", "ハンター", "漁師トリトン", "ライトニング", "フェニックス", "スケルトン", "アイススピリット", "ゴブリンの檻"], "evo": "ロイヤルジャイアント", "champ": null}, {"name": "墓地ポイズン", "sub": "受けてから墓地で削るコントロール", "slots": ["ベビードラゴン", "ナイト", "スケルトンラッシュ", "ポイズン", "アイスウィザード", "トルネード", "アーチャー", "ローリングウッド"], "evo": "ベビードラゴン", "champ": "ナイト"}, {"name": "ロイヤルホグ EQ", "sub": "両サイド同時攻めの速攻", "slots": ["ロイヤルホグ", "マスケット銃士", "アースクエイク", "ホバリング砲", "ザッピー", "バルキリー", "アイススピリット", "ローリングウッド"], "evo": "ロイヤルホグ", "champ": "マスケット銃士"}, {"name": "ラヴァルーン", "sub": "空中ビートダウンの王道", "slots": ["ザップ", "エアバルーン", "ラヴァハウンド", "メガガーゴイル", "ホバリング砲", "墓石", "フェニックス", "ファイアボール"], "evo": "ザップ", "champ": "エアバルーン"}, {"name": "Xボウ 2.9", "sub": "超遠距離建物で塔を狙う", "slots": ["テスラ", "ナイト", "巨大クロスボウ", "アーチャー", "アイススピリット", "スケルトン", "ファイアボール", "ローリングウッド"], "evo": "テスラ", "champ": "ナイト"}, {"name": "ディガーポイズン", "sub": "削り続けるチップコントロール", "slots": ["コウモリの群れ", "マスケット銃士", "ディガー", "ポイズン", "ボムタワー", "槍ゴブリン", "アイススピリット", "ローリングウッド"], "evo": "コウモリの群れ", "champ": "マスケット銃士"}, {"name": "ゴブリンバレル（ログベイト）", "sub": "小物連打で呪文を釣る", "slots": ["ゴブリンバレル", "ナイト", "ゴブリンギャング", "プリンセス", "インフェルノタワー", "ロケット", "アイススピリット", "ローリングウッド"], "evo": "ゴブリンバレル", "champ": "ナイト"}, {"name": "ゴーレム ビートダウン", "sub": "重量級の押し切り", "slots": ["ベビードラゴン", "メガガーゴイル", "ゴーレム", "ダークネクロ", "ライトニング", "トルネード", "ローリングバーバリアン", "エレクトロウィザード"], "evo": "ベビードラゴン", "champ": "メガガーゴイル"}, {"name": "ペッカ ブリッジスパム", "sub": "橋前で殴り合う攻撃的型", "slots": ["ペッカ", "マジックアーチャー", "アサシン ユーノ", "攻城バーバリアン", "エレクトロウィザード", "ロイヤルゴースト", "ザップ", "ポイズン"], "evo": "ペッカ", "champ": "マジックアーチャー"}];

// スロット表示判定。evoSet=実際にプレイヤーが進化させてたカード名Set（GASがevolutionLevelから集計）
// hasEvo=そのデッキに進化情報が付いてるか（付いてれば位置推測はせず実データのみで判定）
function slotModeOf(info, idx, name, evoSet, hasEvo) {
  if (!info) return 'normal';
  if (evoSet && evoSet.has(name) && info.e) return 'evolved';       // ← 実際の進化を最優先
  if (!hasEvo && (idx === 0 || idx === 2) && info.e) return 'evolved'; // 進化情報なしデータの保険（位置推測）
  if ((idx === 1 || idx === 2) && info.h) return 'hero';
  return 'normal';
}

// ===== 所持カード（クラロワID連携）→「組めるデッキだけ」フィルター =====
let ALL_DECKS = [];        // 人気（使用率）デッキ
let WIN_DECKS = [];        // 勝率ランキングデッキ
let TREND_DECKS = [];      // 急上昇（前回比で使用が伸びたデッキ）
let activeTab = 'pop';     // 'pop'=使用率 / 'win'=勝率 / 'trend'=急上昇
let ownedSet = null;       // 解決済み所持カード名Set（未取得null）
let onlyOwned = false;     // 絞り込みON/OFF
let cardFilter = null;     // 「このカードを含むデッキだけ」絞り込み（カード名 or null）
let PLAYERS_TOTAL = 0;     // 集計した母数（使用率%の計算用）
let WIN_MIN_SHOW = 30;     // 勝率ランキングの最低試合数（decks.jsonのwinMinに追従）
let UPDATE_HRS = 6;        // 更新間隔（時間）。decks.json の intervalHours から
function currentList() { return activeTab === 'win' ? WIN_DECKS : activeTab === 'trend' ? TREND_DECKS : ALL_DECKS; }

// APIがカタカナで返した場合の別名保険（index.html と同じ）
const OWNED_ALIAS = {
  'ヴァルキリー':'バルキリー','エグゼキューショナー':'執行人ファルチェ','処刑人':'執行人ファルチェ','ナイトウィッチ':'ダークネクロ',
  'ヴォイド':'ボイド','虚無':'ボイド','サスピシャスブッシュ':'ステルスブッシュ','怪しい茂み':'ステルスブッシュ','ボスバンディット':'ボスアサシン',
  'ボス盗賊':'ボスアサシン','ザ・ログ':'ローリングウッド','ロイヤルリクルート':'見習い親衛隊','ロイヤル新兵':'見習い親衛隊','ロイヤルホッグ':'ロイヤルホグ',
  'ダートゴブリン':'吹き矢ゴブリン','マザーウィッチ':'マザーネクロマンサー','バルーン':'エアバルーン','キャノン':'大砲','キャノンカート':'60式ムート',
  'モルタル':'迫撃砲','アローズ':'矢の雨','マイナー':'ディガー','コウモリ':'コウモリの群れ','ミニオンホード':'ガーゴイルの群れ','メガミニオン':'メガガーゴイル',
  'ミニオン':'ガーゴイル','スピアゴブリン':'槍ゴブリン','バーバリアンハット':'バーバリアンの小屋','炉':'オーブン','フライングマシン':'ホバリング砲',
  'ゴブリンデモリッシャー':'ダイナマイトゴブリン','ホッグライダー':'ホグライダー','バンディット':'アサシン ユーノ','エレクトロドラゴン':'ライトニングドラゴン',
  'マイティマイナー':'マイティディガー','ゴールデンナイト':'ゴールドナイト','ベイビードラゴン':'ベビードラゴン'
};
function _ownedMaps() {
  const slugMap = {}, nameMap = {};
  Object.entries(CARD_INFO).forEach(([name, info]) => {
    const m = (info.i || '').match(/cards\/([a-z0-9-]+)\.png/i);
    if (m) slugMap[m[1].toLowerCase()] = name;
    nameMap[name] = name;
  });
  Object.entries(OWNED_ALIAS).forEach(([k, v]) => { nameMap[k] = v; });
  return { slugMap, nameMap };
}
function resolveOwned(raw) {
  const { slugMap, nameMap } = _ownedMaps();
  const set = new Set();
  (raw || []).forEach(r => {
    const s = String(r);
    const slug = s.toLowerCase().replace(/[.　]/g, '').replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '');
    if (slug && slugMap[slug]) { set.add(slugMap[slug]); return; }
    const jp = s.replace(/\s|　/g, '');
    if (nameMap[jp]) set.add(nameMap[jp]);
  });
  return set;
}
function deckBuildable(d) {
  if (!ownedSet) return true;
  return d.slots.every(n => ownedSet.has(n));
}
function passFilters(d) {
  if (onlyOwned && ownedSet && !deckBuildable(d)) return false;
  if (cardFilter && !d.slots.includes(cardFilter)) return false;
  return true;
}
function applyDecks() {
  const note = document.getElementById('ownedNote');
  const list = currentList();
  const shown = list.filter(passFilters);
  renderDecks(shown);
  // 急上昇がまだ空（前回スナップショット未蓄積）のときは集計中を表示
  if (activeTab === 'trend' && list.length === 0) {
    document.getElementById('deckList').innerHTML =
      '<div class="coming-soon"><div class="big">🔥</div>' + _t('decks.trendSoon')
      + '<div class="note" style="margin-top:8px">' + _t('decks.trendSoonNote') + '</div></div>';
  }
  if (note) {
    if (onlyOwned && ownedSet) note.textContent = _t(cardFilter ? 'decks.ownedCountFiltered' : 'decks.ownedCount', { shown: shown.length, total: list.length });
    else note.textContent = ownedSet ? '' : (onlyOwned ? _t('decks.ownedHint') : '');
  }
}
// タブごとの説明文（押すたびに切り替え）
function updateDeckTabDesc() {
  const el = document.getElementById('deckTabDesc');
  if (!el) return;
  const n = PLAYERS_TOTAL || 0;
  let t;
  if (activeTab === 'win') {
    t = _t('decks.descWin', { n: WIN_MIN_SHOW });
  } else if (activeTab === 'trend') {
    t = _t('decks.descTrend');
  } else {
    t = n ? _t('decks.descUsageN', { n: n }) : _t('decks.descUsage');
  }
  el.innerHTML = t;
}

// タブ切り替え
document.querySelectorAll('.deck-tab').forEach((btn) => {
  btn.addEventListener('click', () => {
    activeTab = btn.getAttribute('data-tab');
    document.querySelectorAll('.deck-tab').forEach(b => b.classList.toggle('active', b === btn));
    updateDeckTabDesc();
    applyDecks();
  });
});
// 所持カード情報はログイン中のみ有効。detail=null（ログアウト）で解除
window.addEventListener('cr-owned-cards', (e) => { ownedSet = e.detail ? resolveOwned(e.detail) : null; applyDecks(); });
(function pollOwned(){
  if (!window.CRAuth) { setTimeout(pollOwned, 150); return; }
  const cached = CRAuth.getOwnedCards && CRAuth.getOwnedCards();
  if (cached) { ownedSet = resolveOwned(cached); applyDecks(); }
  // ログイン状態を監視：ログアウトしたら絞り込みを解除
  if (CRAuth.onChange) CRAuth.onChange((user) => {
    if (!user) {
      ownedSet = null; onlyOwned = false;
      const t = document.getElementById('ownedToggle');
      if (t) t.setAttribute('aria-pressed', 'false');
      const n = document.getElementById('ownedNote'); if (n) n.textContent = '';
      applyDecks();
    }
  });
})();
document.getElementById('ownedToggle').addEventListener('click', () => {
  // 未ログインならログインを促す（IDはログインに紐づくため）。読み込み中は誤判定しない
  const loggedIn = window.CRAuth && CRAuth.getUser && CRAuth.getUser();
  if (!loggedIn) {
    if (window.CRAuth && CRAuth.hasSession && CRAuth.hasSession()) {
      document.getElementById('ownedNote').textContent = _tr('ログイン確認中です。少し待ってからもう一度');
      return;
    }
    if (window.CRAuth && CRAuth.signIn) CRAuth.signIn();
    else document.getElementById('ownedNote').textContent = _tr('ログインすると使えます');
    return;
  }
  onlyOwned = !onlyOwned;
  document.getElementById('ownedToggle').setAttribute('aria-pressed', onlyOwned ? 'true' : 'false');
  if (onlyOwned && !ownedSet) { document.getElementById('ownedNote').textContent = _tr('右上のアカウントからクラロワIDを登録すると使えます'); }
  applyDecks();
});

// ===== カード名で検索 → そのカードを含むデッキだけ表示 =====
const _cardSearch = document.getElementById('cardSearch');
const _cardPop = document.getElementById('cardPop');
const _cardChip = document.getElementById('cardChip');
const _ALL_CARD_NAMES = Object.keys(CARD_INFO);
// カタカナ→ひらがな＋小文字化（ひらがな/カタカナ・大小のゆれを吸収）
function kana(s) {
  return (s || '').toLowerCase().replace(/[ァ-ヶ]/g, c => String.fromCharCode(c.charCodeAt(0) - 0x60));
}
// 名前 or 略称(yomi) にヒットするか
function cardMatches(name, q) {
  const qn = kana(q);
  if (kana(name).indexOf(qn) >= 0) return true;
  // index.htmlと同じく yomi 文字列全体への部分一致
  const y = (typeof CARD_YOMI !== 'undefined' && CARD_YOMI[name]) ? CARD_YOMI[name] : '';
  return !!y && kana(y).indexOf(qn) >= 0;
}
function renderCardPop(q) {
  q = (q || '').trim();
  if (!q) { _cardPop.classList.remove('open'); _cardPop.innerHTML = ''; return; }
  const matches = _ALL_CARD_NAMES.filter(n => cardMatches(n, q)).slice(0, 30);
  if (!matches.length) { _cardPop.innerHTML = '<div class="pop-empty">' + _tr('該当するカードがありません') + '</div>'; _cardPop.classList.add('open'); return; }
  _cardPop.innerHTML = matches.map(n => {
    const info = CARD_INFO[n] || {};
    return '<div class="pop-card" data-n="' + n.replace(/"/g, '&quot;') + '">'
      + (info.i ? '<img src="' + info.i + '" alt="' + n + '" loading="lazy">' : '')
      + '<div class="nm">' + n + '</div></div>';
  }).join('');
  _cardPop.classList.add('open');
}
const _cardClear = document.getElementById('cardClear');
function _syncClear() { _cardClear.style.display = _cardSearch.value ? 'flex' : 'none'; }
_cardSearch.addEventListener('input', () => { renderCardPop(_cardSearch.value); _syncClear(); });
_cardSearch.addEventListener('focus', () => { if (_cardSearch.value.trim()) renderCardPop(_cardSearch.value); });
// Enterで検索確定＝キーボードを閉じる（候補はそのまま表示）
_cardSearch.addEventListener('keydown', (e) => {
  if (e.key === 'Enter') { e.preventDefault(); _cardSearch.blur(); }
});
// ×：打った文字を消して、いかなる時もキーボードを閉じる
_cardClear.addEventListener('click', () => {
  _cardSearch.value = '';
  renderCardPop('');
  _syncClear();
  _cardSearch.blur();
});
_cardPop.addEventListener('click', (e) => {
  const card = e.target.closest('.pop-card');
  if (!card) return;
  cardFilter = card.getAttribute('data-n');
  _cardChip.style.display = 'inline-flex';
  _cardChip.innerHTML = _t('decks.withCard', { name: cardFilter }) + ' <span class="x">✕</span>';
  _cardSearch.value = ''; _syncClear(); _cardPop.classList.remove('open'); _cardPop.innerHTML = '';
  _cardSearch.blur();
  applyDecks();
});
_cardChip.addEventListener('click', () => { cardFilter = null; _cardChip.style.display = 'none'; applyDecks(); });
document.addEventListener('click', (e) => { if (!e.target.closest('.card-filter')) _cardPop.classList.remove('open'); });

function renderDecks(decks) {
  const wrap = document.getElementById('deckList');
  wrap.innerHTML = '';
  decks.forEach((d, idx) => {
    const avg = (d.slots.reduce((s,n)=> s + (CARD_INFO[n]?CARD_INFO[n].c:0), 0) / d.slots.length).toFixed(1);
    let headHtml;
    const avgLbl = _tr('平均コスト');
    if (d.delta != null) {
      // 急上昇タブ：3日窓の前半→直近で使用が伸びたデッキ（単発の差分ではなく合算比較）
      headHtml = '<span class="stat-trend"><span class="arrow">▲</span> ' + _tr('急上昇') + '</span>'
        + (d.count != null ? '<span class="stat-sep">' + _t('decks.nUsed', { n: d.count }) + '</span>' : '')
        + '<span class="stat-avg">' + avgLbl + ' <b>' + avg + '</b></span>';
    } else if (activeTab === 'win' && d.winRate != null) {
      // 勝率タブ：勝率 ＋ 対戦数（3日合計）＋ 使用人数
      headHtml = '<span class="stat-win">' + _t('decks.winPct', { p: d.winRate }) + '</span>'
        + '<span class="stat-sep">' + _t('decks.nGames', { n: (d.games || 0) }) + '</span>'
        + (d.c3 != null ? '<span class="stat-sep">' + _t('decks.c3', { p: d.c3 }) + '</span>' : '')
        + (d.cd != null ? '<span class="stat-sep">' + _t('decks.cd', { v: (d.cd > 0 ? '+' + d.cd : d.cd) }) + '</span>' : '')
        + (d.count != null ? '<span class="stat-sep">' + _t('decks.nUsed', { n: d.count }) + '</span>' : '')
        + '<span class="stat-avg">' + avgLbl + ' <b>' + avg + '</b></span>';
    } else {
      // 使用率タブ：使用人数（3日延べ）＋ ％ ＋ 対戦数（何回使われたか）
      const pct = (d.count != null && PLAYERS_TOTAL) ? (d.count / PLAYERS_TOTAL * 100).toFixed(1) : null;
      const gamesTxt = (d.games != null) ? '<span class="stat-sep">' + _t('decks.nGames', { n: d.games }) + '</span>' : '';
      const winTxt = (d.winRate != null) ? '<span class="stat-sep">' + _t('decks.winPct', { p: d.winRate }) + '</span>' : '';
      const useSep = _tr('が使用');
      headHtml = (pct != null)
        ? ('<span class="stat-use">' + _t('decks.nPlayersUse', { n: d.count }) + '</span>'
           + (useSep ? '<span class="stat-sep">' + useSep + '</span>' : '')
           + '<span class="stat-pct">' + pct + '%</span>'
           + gamesTxt + winTxt
           + '<span class="stat-avg">' + avgLbl + ' <b>' + avg + '</b></span>')
        : ('<span class="stat-avg">' + avgLbl + ' <b>' + avg + '</b></span>'
           + (d.sub ? '<span class="stat-sep">' + d.sub + '</span>' : ''));
    }
    // forms[]（GASが実データから出す各スロットの形）優先。なければ旧ロジック
    const forms = Array.isArray(d.forms) ? d.forms : null;
    const hasEvo = ('evo' in d);
    const evoSet = new Set(Array.isArray(d.evo) ? d.evo : (d.evo ? [d.evo] : []));
    const mini = d.slots.map((n, i) => {
      const info = CARD_INFO[n] || {};
      let mode;
      if (forms) {
        const f = forms[i];
        mode = f === 'evo' ? 'evolved' : f === 'hero' ? 'hero' : f === 'champ' ? 'champion' : 'normal';
      } else {
        mode = slotModeOf(info, i, n, evoSet, hasEvo);
      }
      const img = mode==='evolved' ? (info.iv||info.i) : mode==='hero' ? (info.ih||info.i) : info.i;
      const badge = mode==='evolved' ? '<span class="slot-badge">⚡</span>' : mode==='hero' ? '<span class="slot-badge">👑</span>' : mode==='champion' ? '<span class="slot-badge">🏆</span>' : '';
      const cls = 'mini-card' + (mode==='evolved'?' is-evo':'') + (mode==='hero'?' is-hero':'') + (mode==='champion'?' is-champ':'');
      return '<div class="'+cls+'" title="'+n+'"><span class="pip">'+(info.c!=null?info.c:'')+'</span>'+badge+(img?'<img src="'+img+'" alt="'+n+'" loading="lazy">':'')+'</div>';
    }).join('');
    const url = 'index.html?deck=' + encodeURIComponent(d.slots.join(','));
    const el = document.createElement('div');
    el.className = 'deck-card';
    el.innerHTML =
      '<div class="deck-card-head"><span class="deck-rank">#'+(idx+1)+'</span>'+
      '<div class="deck-stat-line">'+headHtml+'</div></div>'+
      '<div class="deck-cards-grid">'+mini+'</div>'+
      '<a class="load-btn" href="'+url+'">' + _tr('▶ このデッキを作成ツールで開く') + '</a>';
    wrap.appendChild(el);
  });
}

// ============ 急上昇デッキ ＆ カードメタ（使用率/勝率ランキング＋分布図） ============
let CARDS_DATA = [];            // 表示中のカード集計（環境 or あなたの対面）
let ENV_CARDS = [];             // 環境メタ（GASの j.cards / なければサンプル）
let ME_CARDS = [];              // あなたの対面メタ（自分のバトルログ集計）
let ME_COUNT = 0;               // 対面集計に使った対戦数
let _cardMode = 'env';          // 'env'=環境 / 'me'=あなたの対面
const _mmSel = new Set();       // 分布図に表示するカード名
let _mmZoom = null;             // ズーム中の象限（'tl'/'tr'/'bl'/'br' or null＝全体）
let _ctab = 'use';              // 'use'=使用率 / 'win'=勝率
function minGames() { return _cardMode === 'me' ? 2 : WIN_MIN_GAMES; } // 対面はサンプル少なので緩める
const WIN_MIN_GAMES = 50;       // 勝率ランキング・メタマップの最低対戦数（少数試合のブレ除去。減りすぎたら下げる）

// --- GASが trending / cards を出すまでのサンプル ---
const TREND_SAMPLE = (function () {
  const pick = DECKS.slice(0, 6);
  const counts = [14, 11, 9, 8, 6, 5], deltas = [9, 7, 5, 4, 3, 2];
  return pick.map((d, i) => ({ name: d.name, slots: d.slots, evo: d.evo, champ: d.champ, count: counts[i], delta: deltas[i] }));
})();
const CARDS_SAMPLE = [
  // name, use(%), win(%), games, rise(pp・急上昇用。省略=null)
  ['ローリングウッド',64,53,820],['アイススピリット',58,52,910],['スケルトン',55,51,880],
  ['ファイアボール',47,52,700],['大砲',31,54,520],['ホグライダー',28,51,470],
  ['マスケット銃士',26,52,430],['ナイト',25,50,610],['ザップ',22,49,540],
  ['コウモリの群れ',21,53,360],['ポイズン',19,52,300],['トルネード',17,55,280],
  ['ディガー',16,53,260,0.4],['迫撃砲',9,56,140,1.2],['巨大クロスボウ',6,57,110,0.8],
  ['エレクトロジャイアント',7,49,120,0.6],['メガナイト',20,47,420],['ペッカ',15,48,250,0.3],
  ['ゴーレム',5,46,90],['エリクサーゴーレム',6,45,95],['プリンセス',14,54,230],
  ['インフェルノタワー',13,53,210],['エアバルーン',12,55,200],['ラヴァハウンド',8,50,130]
].map(a => ({ name: a[0], use: a[1], win: a[2], games: a[3], rise: a[4] != null ? a[4] : null }));

// 分布図マップの固定位置（ヘッダーの実高さ）をCSS変数に反映
function setHeaderH() {
  const h = document.querySelector('header');
  if (h) document.documentElement.style.setProperty('--cr-header-h', h.offsetHeight + 'px');
}
setHeaderH();
window.addEventListener('resize', setHeaderH);
window.addEventListener('load', setHeaderH);
setTimeout(setHeaderH, 300); // フォント確定後に再計測

// --- トップ：デッキ / カード 切替（URLハッシュに状態を保持＝リロード・直リンクで同じタブが開く） ---
function setSeg(seg) {
  seg = (seg === 'cards') ? 'cards' : 'decks';
  document.documentElement.setAttribute('data-seg', seg); // CSSによる初期表示と一致させる
  document.querySelectorAll('#topSeg .seg-tab').forEach(b => b.classList.toggle('active', b.getAttribute('data-seg') === seg));
  document.getElementById('secDecks').style.display = seg === 'cards' ? 'none' : '';
  document.getElementById('secCards').style.display = seg === 'cards' ? '' : 'none';
  setHeaderH();
}
document.querySelectorAll('#topSeg .seg-tab').forEach(btn => {
  btn.addEventListener('click', () => {
    const seg = btn.getAttribute('data-seg');
    if ((location.hash.replace('#', '') || 'decks') !== seg) history.replaceState(null, '', '#' + seg);
    setSeg(seg);
  });
});
window.addEventListener('hashchange', () => setSeg(location.hash.replace('#', '')));
setSeg(location.hash.replace('#', '')); // 初期表示はハッシュに従う（#cards ならカード）

function _cardImg(name) { const i = CARD_INFO[name]; return i ? (i.i || '') : ''; }
function _cardCost(name) { const i = CARD_INFO[name]; return i ? i.c : ''; }
// ★形態別カード（GASの cards に f:'e'(限界突破)/'h'(ヒーロー) が付く。f無し=ノーマル）
function _ckey(c) { return c.name + (c.f ? '|' + c.f : ''); }           // 選択・識別キー
function _cardImgF(c) { const i = CARD_INFO[c.name]; if (!i) return ''; if (c.f === 'e' && i.iv) return i.iv; if (c.f === 'h' && i.ih) return i.ih; return i.i || ''; }
function _fmark(c) { return c.f === 'e' ? '⚡' : (c.f === 'h' ? '👑' : ''); }

// --- カード50位ランキング ---
function renderCrank() {
  const wrap = document.getElementById('crankList');
  const hint = document.getElementById('crankHint');
  const me = (_cardMode === 'me');
  let list = CARDS_DATA.slice();
  if (_ctab === 'win') {
    list = list.filter(c => (c.games || 0) >= minGames());
    list.sort((a, b) => (b.win || 0) - (a.win || 0) || (b.games || 0) - (a.games || 0));
    hint.textContent = me
      ? _t('crank.hintWinMe', { n: minGames() })
      : _t('crank.hintWin', { n: minGames() });
  } else if (_ctab === 'rise') {
    list = list.filter(c => c.rise != null && c.rise > 0);
    list.sort((a, b) => (b.rise || 0) - (a.rise || 0));
    hint.textContent = _t('crank.hintRise');
  } else {
    list.sort((a, b) => (b.use || 0) - (a.use || 0));
    hint.textContent = me
      ? _t('crank.hintUseMe')
      : _t('crank.hintUse');
  }
  // 急上昇のデータがまだ無いときは準備中
  if (_ctab === 'rise' && !list.length) {
    wrap.innerHTML = '<div class="coming-soon"><div class="big">🔥</div>' + _tr('カードの急上昇は準備中です')
      + '<div class="note" style="margin-top:8px">' + _tr('数回の更新でデータがたまり次第、自動で表示されます') + '</div></div>';
    return;
  }
  // 使用率/勝率は全カードを表示（上限なし）。急上昇は rise>0 で既に絞り済み。
  const maxUse = Math.max(1, ...CARDS_DATA.map(c => c.use || 0));
  const maxRise = Math.max(0.1, ...CARDS_DATA.map(c => c.rise || 0));
  wrap.innerHTML = list.map((c, i) => {
    const sel = _mmSel.has(_ckey(c));
    const winTxt = (c.win != null ? c.win + '%' : '—');
    const useTxt = (c.use != null ? c.use + '%' : '—');
    let big, sub, barPct, barCol, statCls;
    if (_ctab === 'win') {
      big = winTxt; sub = _t('crank.subWin', { g: (c.games || 0), u: useTxt });
      barPct = Math.max(0, Math.min(100, c.win || 0)); barCol = '#e8a020'; statCls = 'win';
    } else if (_ctab === 'rise') {
      big = '▲' + (c.rise || 0); sub = _t('crank.subRise', { u: useTxt, w: winTxt });
      barPct = Math.round((c.rise || 0) / maxRise * 100); barCol = '#ff8a3c'; statCls = 'win';
    } else {
      big = useTxt; sub = _t('crank.subUse', { w: winTxt, g: (c.games || 0) });
      barPct = Math.round((c.use || 0) / maxUse * 100); barCol = '#3a8ef0'; statCls = 'use';
    }
    return '<div class="crank-row' + (sel ? ' sel' : '') + '" data-n="' + String(_ckey(c)).replace(/"/g, '&quot;') + '">'
      + '<span class="crank-rank">' + (i + 1) + '</span>'
      + '<span class="crank-ico"><span class="pip">' + _cardCost(c.name) + '</span>'
        + (_cardImgF(c) ? '<img src="' + _cardImgF(c) + '" alt="' + c.name + '" loading="lazy">' : '')
        + (_fmark(c) ? '<span class="fbadge">' + _fmark(c) + '</span>' : '') + '</span>'
      + '<span class="crank-name">' + c.name + (_fmark(c) ? ' <span class="fmark">' + _fmark(c) + '</span>' : '') + '</span>'
      + '<span class="crank-bar"><i style="width:' + barPct + '%;background:' + barCol + '"></i></span>'
      + '<span class="crank-stat ' + statCls + '"><span class="big">' + big + '</span><span class="sub">' + sub + '</span></span>'
      + '<button class="crank-go" type="button" data-go="' + String(c.name).replace(/"/g, '&quot;') + '" title="' + _tr('このカードでデッキ検索') + '" aria-label="' + _tr('このカードでデッキ検索') + '">🔍</button>'
      + '<span class="crank-check">' + (sel ? '✓' : '＋') + '</span>'
      + '</div>';
  }).join('');
}
document.querySelectorAll('#crankTabs .crank-tab').forEach(btn => {
  btn.addEventListener('click', () => {
    _ctab = btn.getAttribute('data-ctab');
    document.querySelectorAll('#crankTabs .crank-tab').forEach(b => b.classList.toggle('active', b === btn));
    renderCrank();
  });
});
document.getElementById('crankList').addEventListener('click', (e) => {
  const go = e.target.closest('.crank-go');
  if (go) { e.stopPropagation(); gotoDeckSearch(go.getAttribute('data-go')); return; }
  const row = e.target.closest('.crank-row'); if (!row) return;
  const n = row.getAttribute('data-n');
  if (_mmSel.has(n)) _mmSel.delete(n); else _mmSel.add(n);
  renderCrank(); renderMetaMap();
});
// カードランキングの🔍：そのカードを含むデッキに絞り込んで「デッキ」タブへ
function gotoDeckSearch(cardName) {
  if (!cardName) return;
  cardFilter = cardName;
  const chip = document.getElementById('cardChip');
  if (chip) { chip.style.display = 'inline-flex'; chip.innerHTML = _t('decks.withCard', { name: cardName }) + ' <span class="x">✕</span>'; }
  activeTab = 'pop';
  document.querySelectorAll('.deck-tab').forEach(b => b.classList.toggle('active', b.getAttribute('data-tab') === 'pop'));
  setSeg('decks');
  history.replaceState(null, '', '#decks');
  updateDeckTabDesc();
  applyDecks();
  window.scrollTo(0, 0);
}
document.getElementById('mmClear').addEventListener('click', () => { _mmSel.clear(); renderCrank(); renderMetaMap(); });
document.getElementById('mmAll').addEventListener('click', () => {
  // 全て表示も「信頼できるカード」だけプロット（マップの母集団と一致）。
  // ★形態ルール：ノーマルvs限界突破／ノーマルvsヒーローで「最も使われてる形」をランクイン。
  //   限界突破とヒーロー両方を持つカードは両ライン＝最大2点（同じノーマルに収束したら1点）。
  const ok = c => c.use != null && c.win != null && (c.games || 0) >= minGames();
  const byName = {};
  CARDS_DATA.forEach(c => { if (!ok(c)) return; (byName[c.name] = byName[c.name] || {})[c.f || 'n'] = c; });
  Object.keys(byName).forEach(name => {
    const g = byName[name];
    const pick = (a, b) => (a && b) ? (((b.use || 0) > (a.use || 0)) ? b : a) : (a || b);
    const chosen = new Set();
    if (g.e) chosen.add(pick(g.n, g.e));
    if (g.h) chosen.add(pick(g.n, g.h));
    if (!chosen.size && g.n) chosen.add(g.n);
    chosen.forEach(c => { if (c) _mmSel.add(_ckey(c)); });
  });
  renderCrank(); renderMetaMap();
});
// 光るトグル：OFF=環境メタ / ON=〇〇さんの環境
function updateMeLabel() {
  const el = document.getElementById('meLabel'); if (!el) return;
  const nm = (window.CRAuth && CRAuth.getDisplayName && CRAuth.getDisplayName()) || '';
  el.textContent = nm ? _t('decks.envOfName', { name: nm }) : _tr('あなたの環境');
}
const _meToggleBtn = document.getElementById('meToggle');
if (_meToggleBtn) _meToggleBtn.addEventListener('click', () => setCardMode(_cardMode === 'me' ? 'env' : 'me'));
const _meRefreshBtn = document.getElementById('meRefresh');
if (_meRefreshBtn) _meRefreshBtn.addEventListener('click', () => setCardMode('me', true)); // 最新の対戦を取り直し

// マップをタップでその象限を拡大（カードの上でもOK＝タップ位置で象限判定）
document.getElementById('metaMap').addEventListener('click', (e) => {
  if (_mmZoom) { _mmZoom = null; renderMetaMap(); return; }  // ズーム中はもう一度タップで全体に戻る
  if (!_mmSel.size) return;             // 何も選択してないときは拡大しない
  if (e.target.closest('.mm-empty')) return;
  const map = document.getElementById('metaMap');
  const plot = map.querySelector('.mm-plot') || map; // プロット領域（余白を除いた本体）で象限判定
  const r = plot.getBoundingClientRect();
  if (!r.width || !r.height) return;
  const px = (e.clientX - r.left) / r.width;   // 0=左, 1=右
  const py = (e.clientY - r.top) / r.height;   // 0=上, 1=下
  const right = px >= 0.5, top = py < 0.5;      // 画面上＝勝率高
  _mmZoom = top ? (right ? 'tr' : 'tl') : (right ? 'br' : 'bl');
  renderMetaMap();
});

// --- メタマップの開閉（ログイン中はアカウントに保存／ログアウト時は開くがデフォルト） ---
let mapOpen = true;
function applyMapOpen(open) {
  mapOpen = open;
  const s = document.querySelector('#secCards .mm-sticky');
  if (s) s.classList.toggle('mm-collapsed', !open);
  const t = document.getElementById('mmToggle');
  if (t) t.textContent = open ? '▾' : '▸';
  setHeaderH();
}
document.getElementById('mmToggle').addEventListener('click', () => {
  const next = !mapOpen;
  applyMapOpen(next);
  if (window.CRAuth && CRAuth.getUser && CRAuth.getUser() && CRAuth.setMapOpen) CRAuth.setMapOpen(next);
});
function syncMapOpenFromAuth() {
  let open = true; // 未ログインは常に開く
  if (window.CRAuth && CRAuth.getUser && CRAuth.getUser() && CRAuth.getMapOpen) open = CRAuth.getMapOpen();
  applyMapOpen(open);
}
(function pollMapPref() {
  if (!window.CRAuth) { setTimeout(pollMapPref, 200); return; }
  syncMapOpenFromAuth(); updateMeLabel();
  if (CRAuth.onChange) CRAuth.onChange(() => { syncMapOpenFromAuth(); updateMeLabel(); });
})();

// --- 分布図マップ（選んだカードだけプロット） ---
function renderMetaMap() {
  const map = document.getElementById('metaMap');
  // 母集団は「勝率が信頼できるカード（WIN_MIN_GAMES戦以上）」に限定（少試合の極端な勝率＝外れ値を除外）。
  // 両軸とも「順位(パーセンタイル)」で配置＝中央値が真ん中、上下左右に均等に散る（全方位に広がる）。
  //   使用率も勝率も実数だと中央に密集するため。位置＝環境内での相対順位、実際の%はツールチップで表示。
  const pop = CARDS_DATA.filter(c => c.use != null && c.win != null && (c.games || 0) >= minGames());
  const useVals = pop.map(c => c.use);
  const winVals = pop.map(c => c.win);
  const pad = 9;
  function rankFrac(vals, v) {
    if (!vals.length) return 0.5;
    let lt = 0, eq = 0;
    for (const x of vals) { if (x < v) lt++; else if (x === v) eq++; }
    return (lt + eq / 2) / vals.length;
  }
  const clamp = v => Math.max(pad, Math.min(100 - pad, v));
  const rfx = u => rankFrac(useVals, u); // 使用率の順位 0..1
  const rfy = w => rankFrac(winVals, w); // 勝率の順位 0..1
  // 軸メモリ用の実数値（母集団の最小・中央値・最大）。順位配置なので 端=min/max、真ん中=中央値。
  const stats = arr => {
    if (!arr.length) return { min: 0, med: 0, max: 0 };
    const s = arr.slice().sort((a, b) => a - b);
    const m = s.length % 2 ? s[(s.length - 1) / 2] : (s[s.length / 2 - 1] + s[s.length / 2]) / 2;
    return { min: s[0], med: Math.round(m * 10) / 10, max: s[s.length - 1] };
  };
  const uS = stats(useVals), wS = stats(winVals);
  const QLABEL = { tl: '目立たないが勝ってる', tr: '安定', bl: 'チャレンジング', br: '人気だが勝ってない' };
  const byKey = {}; CARDS_DATA.forEach(c => byKey[_ckey(c)] = c);
  const sel = [..._mmSel].map(n => byKey[n]).filter(c => c && c.use != null && c.win != null);

  map.classList.toggle('mm-zoomed', !!_mmZoom);

  // 点を描くヘルパー（rx,ry は 0..1 の正規化座標、上ほど勝率高）
  const ptHtml = (c, rx, ry, lab) => {
    const x = clamp(pad + rx * (100 - 2 * pad));
    const y = clamp((100 - pad) - ry * (100 - 2 * pad));
    return '<div class="mm-pt" style="left:' + x.toFixed(1) + '%;top:' + y.toFixed(1) + '%" title="' + c.name + _fmark(c) + ' 使用' + (c.use || 0) + '% / 勝率' + (c.win || 0) + '%">'
      + (_cardImgF(c) ? '<img src="' + _cardImgF(c) + '" alt="' + c.name + '">' : '')
      + (_fmark(c) ? '<span class="fbadge">' + _fmark(c) + '</span>' : '')
      + (lab ? '<span class="lab">' + c.name + (_fmark(c) ? '<i class="fm">' + _fmark(c) + '</i>' : '') + '</span>' : '') + '</div>';
  };

  // ===== ズーム表示（1象限を拡大。中央線が端に来て、線からの近さが見える） =====
  if (_mmZoom) {
    const Q = _mmZoom, right = (Q === 'tr' || Q === 'br'), top = (Q === 'tl' || Q === 'tr');
    const inQ = c => (right ? rfx(c.use) >= 0.5 : rfx(c.use) < 0.5) && (top ? rfy(c.win) >= 0.5 : rfy(c.win) < 0.5);
    const cards = sel.filter(inQ);
    // 象限内の順位を 0..1 に引き伸ばす
    const sx = c => { let r = rfx(c.use); return right ? (r - 0.5) * 2 : r * 2; };
    const sy = c => { let r = rfy(c.win); return top ? (r - 0.5) * 2 : r * 2; };
    // 中央線（＝この象限の内側の辺）を強調表示
    const vEdge = right ? pad : (100 - pad);   // 縦の中央線が来る辺
    const hEdge = top ? (100 - pad) : pad;     // 横の中央線が来る辺
    let base =
        '<div class="mm-axis v zoom" style="left:' + vEdge + '%"></div>'
      + '<div class="mm-axis h zoom" style="top:' + hEdge + '%"></div>'
      + '<div class="mm-zline" style="left:' + (right ? '2px' : 'auto') + ';right:' + (right ? 'auto' : '2px') + ';top:50%;transform:translateY(-50%)">' + _t('mm.medUse', { v: uS.med }) + '</div>'
      + '<div class="mm-zline" style="' + (top ? 'bottom:2px' : 'top:2px') + ';left:50%;transform:translateX(-50%)">' + _t('mm.medWin', { v: wS.med }) + '</div>'
      + '<div class="mm-zhint">' + _tr('タップで全体に戻る') + '</div>'
      + '<div class="mm-ztitle">' + _tr(QLABEL[Q]) + '</div>';
    if (!cards.length) { map.innerHTML = base + '<div class="mm-empty">' + _tr('この領域に表示中のカードはありません') + '</div>'; return; }
    map.innerHTML = base + cards.map(c => ptHtml(c, sx(c), sy(c), false)).join('');
    return;
  }

  // ===== 全体表示 =====
  const base =
      '<div class="mm-q tl" data-q="tl"></div><div class="mm-q tr" data-q="tr"></div><div class="mm-q bl" data-q="bl"></div><div class="mm-q br" data-q="br"></div>'
    + '<div class="mm-axis v"></div><div class="mm-axis h"></div>'
    + '<div class="mm-qlabel tl">' + _tr('目立たないが勝ってる') + '</div><div class="mm-qlabel tr">' + _tr('安定') + '</div>'
    + '<div class="mm-qlabel bl">' + _tr('チャレンジング') + '</div><div class="mm-qlabel br">' + _tr('人気だが勝ってない') + '</div>'
    + '<div class="mm-axlabel x">' + (_cardMode === 'me' ? _tr('対面率 →') : _tr('使用率 →')) + '</div><div class="mm-axlabel y">' + (_cardMode === 'me' ? _tr('あなたの勝率 ↑') : _tr('勝率 ↑')) + '</div>';
  // 軸メモリ（実数値）：左の余白に勝率(上=max/中=中央値/下=min)、下の余白に使用率(左=min/中=中央値/右=max)
  const ticks =
      '<div class="mm-tick y y-top">' + wS.max + '%</div>'
    + '<div class="mm-tick y y-mid">' + wS.med + '%</div>'
    + '<div class="mm-tick y y-bot">' + wS.min + '%</div>'
    + '<div class="mm-tick x x-left">' + uS.min + '%</div>'
    + '<div class="mm-tick x x-mid">' + uS.med + '%</div>'
    + '<div class="mm-tick x x-right">' + uS.max + '%</div>';
  if (!sel.length) {
    map.innerHTML = '<div class="mm-plot">' + base + '<div class="mm-empty">' + _tr('ランキングからカードをタップすると') + '<br>' + _tr('ここに分布で表示されます') + '<br><span style="font-size:10px;color:var(--text-dim)">' + _tr('（4つの領域をタップすると拡大）') + '</span></div></div>' + ticks;
    return;
  }
  const showLab = sel.length <= 12; // 多いとラベルが被るので、選択が少ないときだけ名前を出す
  const pts = sel.map(c => ptHtml(c, rfx(c.use), rfy(c.win), showLab)).join('');
  map.innerHTML = '<div class="mm-plot">' + base + pts + '</div>' + ticks;
}
function bindBack() {
  const b = document.getElementById('mmBack');
  if (b) b.addEventListener('click', (e) => { e.stopPropagation(); _mmZoom = null; renderMetaMap(); });
}
function initCardMeta(isSample) {
  ENV_CARDS = CARDS_DATA.slice();        // 環境メタを保持
  if (_cardMode !== 'me') CARDS_DATA = ENV_CARDS;
  const note = document.getElementById('cardsNote');
  if (note && _cardMode !== 'me') note.textContent = isSample ? _tr('※ サンプル表示です（集計データ連携の準備中）') : '';
  renderCrank(); renderMetaMap();
}

// --- あなたの対面メタ：自分のバトルログ（相手デッキ）を集計。Worker /battlelog から取得し localStorage に7日ぶん蓄積 ---
function _parseT(s) { const m = String(s).match(/^(\d{4})(\d{2})(\d{2})T(\d{2})(\d{2})(\d{2})/); return m ? Date.UTC(+m[1], +m[2] - 1, +m[3], +m[4], +m[5], +m[6]) : 0; }
function _loadMeBattles(tag) { try { return JSON.parse(localStorage.getItem('cr_me_' + tag) || '[]'); } catch (e) { return []; } }
function _saveMeBattles(tag, arr) { try { localStorage.setItem('cr_me_' + tag, JSON.stringify(arr)); } catch (e) {} }
function _mergeBattles(oldArr, fresh) {
  const seen = {}; oldArr.forEach(b => seen[b.t] = 1);
  let merged = oldArr.concat((fresh || []).filter(b => !seen[b.t]));
  const cut = Date.now() - 7 * 864e5; // 直近7日ぶん保持
  return merged.filter(b => _parseT(b.t) >= cut).sort((a, b) => _parseT(b.t) - _parseT(a.t)).slice(0, 600);
}
function aggregateMe(battles) {
  const total = battles.length, m = {};
  battles.forEach(b => { (b.opp || []).forEach(n => { if (!m[n]) m[n] = { a: 0, w: 0 }; m[n].a++; if (b.win) m[n].w++; }); });
  return Object.keys(m).map(n => { const o = m[n]; return { name: n, use: total ? Math.round(o.a / total * 1000) / 10 : 0, win: o.a ? Math.round(o.w / o.a * 1000) / 10 : null, games: o.a, rise: null }; });
}

// ===== あなたの帯メタ：相手デッキを勝ち筋で分類して「自分のランク帯の環境シェア」を出す =====
// 相手のデッキはあなたのデッキ構成と無関係（マッチメイクが帯から相手を引く）＝デッキを替えても汚れない正確なサンプル。
// GASのARCH_WINCONSと同じ優先度順リスト（オーナー監修・36枚）。変更したらGAS側と必ず同期すること。
const ME_ARCH_WINCONS = ['ラヴァハウンド', 'ゴーレム', 'エレクトロジャイアント', 'エリクサーゴーレム', '三銃士',
  'ゴブジャイアント', 'ジャイアント', '巨大スケルトン', 'スパーキー', '見習い親衛隊', 'ペッカ', 'メガナイト',
  'ボスアサシン', 'ロイヤルジャイアント', '巨大クロスボウ', '迫撃砲', 'エアバルーン', 'スケルトンバレル',
  'ホグライダー', 'ロイヤルホグ', 'ラムライダー', '攻城バーバリアン', 'エリートバーバリアン', 'プリンス',
  'ゴブリンマシン', 'ゴブリンシュタイン', 'モンク', 'アーチャークイーン', 'ゴールドナイト', 'スケルトンラッシュ',
  'ゴブリンバレル', 'ゴブリンドリル', 'ウォールブレイカー', 'マイティディガー', 'ディガー', 'ロケット'];
let ME_ARCH = [];
// ★複数勝ち筋カウント：デッキに含まれる勝ち筋を全部返す（1戦が各勝ち筋にカウントされる＝重複あり・仕様）
function archsOfOpp(opp) {
  const base = (opp || []).map(n => String(n).replace(/[⚡👑]+$/, ''));
  const out = [];
  for (const w of ME_ARCH_WINCONS) if (base.includes(w)) out.push(w);
  return out.length ? out : ['その他'];
}
function aggregateMeArch(battles) {
  const total = battles.length, m = {};
  battles.forEach(b => { archsOfOpp(b.opp).forEach(k => { if (!m[k]) m[k] = { g: 0, w: 0 }; m[k].g++; if (b.win) m[k].w++; }); });
  return Object.keys(m).map(k => ({ k: k, games: m[k].g, share: total ? Math.round(m[k].g / total * 1000) / 10 : 0, win: m[k].g ? Math.round(m[k].w / m[k].g * 100) : null }))
    .sort((a, b) => b.games - a.games);
}
function renderMeMeta() {
  const el = document.getElementById('meMeta');
  if (!el) return;
  if (_cardMode !== 'me' || !ME_ARCH.length) { el.style.display = 'none'; return; }
  const top = ME_ARCH.slice(0, 12);
  const maxS = Math.max(1, ...top.map(m => m.share || 0));
  el.style.display = '';
  el.innerHTML = '<div class="ms-title">' + _t('me.metaTitle', { n: ME_COUNT }) + '</div>'
    + '<div class="ms-note">' + _tr('相手デッキの勝ち筋分布＝あなたのランク帯のメタ。使ったデッキに関係なく貯まる正確なサンプルです。勝率は対面3戦未満なら表示しません') + '</div>'
    + top.map(m => {
      const base = m.k;
      const info = (typeof CARD_INFO !== 'undefined') ? CARD_INFO[base] : null;
      const img = (info && info.i) ? '<img src="' + info.i + '" alt="' + base + '" loading="lazy">' : '';
      const winTxt = (m.win != null && m.games >= 3) ? _t('decks.winPct', { p: m.win }) : '';
      return '<div class="ms-row">'
        + '<span class="ms-ico">' + img + '</span>'
        + '<span class="ms-name"><span>' + (base === 'その他' ? _tr('その他') : base) + '</span></span>'
        + '<span class="ms-bar"><i style="width:' + Math.round((m.share || 0) / maxS * 100) + '%"></i></span>'
        + '<span class="ms-share">' + (m.share || 0) + '%</span>'
        + '<span class="ms-sep">' + _t('decks.nGames', { n: m.games }) + '</span>'
        + '<span class="ms-win">' + winTxt + '</span>'
        + '</div>';
    }).join('');
}
async function loadMeCards(force) {
  const tag = (window.CRAuth && CRAuth.getCrTag && CRAuth.getCrTag()) || '';
  if (!tag) return { ok: false };
  let battles = _loadMeBattles(tag);
  // クラウド（プロフィールに同梱済み＝追加読込なし）とマージ＝別端末・キャッシュ削除後も復元
  const cloud = (window.CRAuth && CRAuth.getMeBattles && CRAuth.getMeBattles()) || [];
  if (cloud.length) battles = _mergeBattles(battles, cloud);
  // 開くたびに最新を取りに行く（同じタグはWorker側で10分キャッシュ＝CR APIは叩き直さない）
  try {
    const res = await fetch('/battlelog?tag=' + encodeURIComponent(tag) + (force ? '&fresh=' + Date.now() : ''), { cache: 'no-store' });
    const j = await res.json();
    battles = _mergeBattles(battles, (j && j.battles) || []);
  } catch (e) { /* 取得失敗時は手元の蓄積を使う */ }
  _saveMeBattles(tag, battles);
  ME_CARDS = aggregateMe(battles); ME_COUNT = battles.length;
  ME_ARCH = aggregateMeArch(battles); // 帯メタ（勝ち筋分布）
  _syncMeToCloud(battles); // 間引き書込（await しない＝UIを止めない）
  _updateMeMonthly(battles); // ★月次集計（await しない）
  return { ok: true, count: battles.length };
}
// クラウドへ間引き書込：クラウドの最新時刻を“しおり”に、それより新しい対戦が何件たまったかで判断。
//   新規が SOON_N 件たまったら即保存／たまらなくても FALLBACK_H 時間に1回は保存（データ消失防止）。
const ME_SYNC_SOON_N = 15;     // 新規がこれだけたまったら即クラウド保存
const ME_SYNC_FALLBACK_H = 6;  // たまらなくても、この時間に1回は保存
function _syncMeToCloud(merged) {
  if (!(window.CRAuth && CRAuth.getUser && CRAuth.getUser() && CRAuth.saveMeBattles)) return;
  const cloud = (CRAuth.getMeBattles && CRAuth.getMeBattles()) || [];
  const mark = cloud.length ? cloud[0].t : '';           // 保存済みのしおり（最新の対戦時刻）
  const newCount = merged.filter(b => b.t > mark).length; // しおりより新しい＝未保存の新規件数（時刻文字列は辞書順=時系列順）
  if (newCount <= 0) return;                              // 新規なし＝書かない
  let lastAt = 0; try { lastAt = +localStorage.getItem('cr_me_syncAt') || 0; } catch (e) {}
  const soon = newCount >= ME_SYNC_SOON_N;
  const fallback = Date.now() - lastAt >= ME_SYNC_FALLBACK_H * 3600e3;
  if (!soon && !fallback) return;                         // まだ少ない＆時間も経ってない→次回へ
  try { localStorage.setItem('cr_me_syncAt', String(Date.now())); } catch (e) {}
  CRAuth.saveMeBattles(merged);
}
// ★対面ログの月次集計：生ログは7日で消えるので、勝ち筋別の集計を月別に永続保存。
//   しおり（mark=集計済み最新battleTime）方式で新規対戦だけ加算＝何度呼んでも二重計上しない。
//   形式: users/{uid}/meMonthly/{YYYY-MM} = { mark, total:[対面数,勝数], arch:{勝ち筋:[対面数,勝数]}, upd }
async function _updateMeMonthly(battles) {
  if (!(window.CRAuth && CRAuth.getUser && CRAuth.getUser() && CRAuth.getMeMonthly)) return;
  try {
    const byMonth = {};
    (battles || []).forEach(b => {
      const m = String(b.t || '').slice(0, 6); // battleTime "YYYYMMDDT..." → YYYYMM
      if (!/^\d{6}$/.test(m)) return;
      (byMonth[m] = byMonth[m] || []).push(b);
    });
    for (const m of Object.keys(byMonth)) {
      const key = m.slice(0, 4) + '-' + m.slice(4);
      const doc = (await CRAuth.getMeMonthly(key)) || { mark: '', total: [0, 0], arch: {} };
      const fresh = byMonth[m].filter(b => b.t && b.t > (doc.mark || '')).sort((a, b) => (a.t < b.t ? -1 : 1));
      if (!fresh.length) continue;
      fresh.forEach(b => {
        archsOfOpp(b.opp || []).forEach(a => {
          const e = doc.arch[a] || (doc.arch[a] = [0, 0]);
          e[0]++; if (b.win) e[1]++;
        });
        doc.total[0]++; if (b.win) doc.total[1]++; // totalは1戦1回（archは重複カウント）
        if (b.t > doc.mark) doc.mark = b.t;
      });
      doc.upd = Date.now();
      await CRAuth.saveMeMonthly(key, doc);
    }
  } catch (e) {}
}

// モード切替（環境 ⇄ あなたの対面）
async function setCardMode(mode, force) {
  if (mode === 'me') {
    const tag = (window.CRAuth && CRAuth.getCrTag && CRAuth.getCrTag()) || '';
    if (!tag) {
      const cn = document.getElementById('cardsNote');
      if (cn) cn.textContent = _tr('「あなたの対面」はログイン＆クラロワID登録で使えます（右上のアカウントから）。');
      return;
    }
    const cn = document.getElementById('cardsNote');
    if (cn) cn.textContent = _tr('対戦データを取得中…');
    await loadMeCards(force);
  }
  _cardMode = mode;
  _mmSel.clear(); _mmZoom = null;
  if (mode === 'me' && _ctab === 'rise') _ctab = 'use';
  CARDS_DATA = (mode === 'me') ? ME_CARDS : ENV_CARDS;
  const tg = document.getElementById('meToggle');
  if (tg) { tg.classList.toggle('active', mode === 'me'); tg.setAttribute('aria-pressed', mode === 'me' ? 'true' : 'false'); }
  const suf = document.getElementById('meSuffix');
  if (suf) suf.textContent = (mode === 'me') ? _tr('を表示中') : _tr('で見る');
  const riseTab = document.querySelector('#crankTabs .crank-tab[data-ctab="rise"]');
  if (riseTab) riseTab.style.display = (mode === 'me') ? 'none' : '';
  document.querySelectorAll('#crankTabs .crank-tab').forEach(b => b.classList.toggle('active', b.getAttribute('data-ctab') === _ctab));
  const refreshBtn = document.getElementById('meRefresh');
  if (refreshBtn) refreshBtn.style.display = (mode === 'me') ? '' : 'none';
  const cn = document.getElementById('cardsNote');
  const _nm = (window.CRAuth && CRAuth.getDisplayName && CRAuth.getDisplayName()) || '';
  const who = _nm ? _t('decks.whoName', { name: _nm }) : _tr('あなた');
  if (cn) cn.textContent = (mode === 'me')
    ? _t('decks.meNote', { who: who, n: ME_COUNT })
    : (window.__cardsNoteEnv || '');
  // 帯メタ：meモードでは「ランク帯の環境シェア」を出し、順位ベースで意味の薄いメタマップは隠す
  const mmBlock = document.querySelector('.mm-sticky');
  if (mmBlock) mmBlock.style.display = (mode === 'me') ? 'none' : '';
  renderMeMeta();
  renderCrank(); renderMetaMap();
}

// データ(decks.json)はGASが「同じリポジトリの data ブランチ」に更新する → raw から取得。
// サイト本体(main)をManus等で丸ごと差し替えても、data ブランチは触らないので消えない。
// 取得できなければ同一オリジンの decks.json、それも無ければ内蔵DECKSにフォールバック（移行中も壊れない）。
// 集計テキスト（更新間隔・母数・最終更新など）。動的＝i18nのt()で言語対応。言語切替時に再描画する。
let _agg = { top: null, sample: null, hrs: 6, cardsReal: false, updated: null };
function _t(k, v) { return window.CRI18N ? CRI18N.t(k, v) : k; }
// 固定の日本語文をそのまま辞書で訳す（ja=原文のまま／未訳は英語→原文フォールバック）
function _tr(s) { return window.CRI18N ? CRI18N.tr(s) : s; }
function srcTextI18n() {
  if (_agg.top) return _agg.sample ? _t('decks.srcTop', { n: _agg.top, p: _agg.sample }) : _t('decks.srcTopNoSample', { n: _agg.top });
  return _agg.sample ? _t('decks.srcGenericSample', { p: _agg.sample }) : _t('decks.srcGeneric');
}
function renderAggText() {
  const src = srcTextI18n();
  const sub = document.getElementById('pageSub');
  if (sub) sub.innerHTML = _t('decks.subMain', { hrs: _agg.hrs, src: src });
  window.__cardsNoteEnv = _agg.cardsReal ? _t('decks.noteMain', { hrs: _agg.hrs, src: src }) : _t('decks.noteSample');
  const cn = document.getElementById('cardsNote');
  if (cn && _cardMode !== 'me') cn.textContent = window.__cardsNoteEnv;
  const note = document.getElementById('aggNote');
  if (note) {
    if (_agg.updated) {
      const isJa = !window.CRI18N || CRI18N.lang === 'ja';
      const d = new Date(_agg.updated);
      const ts = d.toLocaleString(isJa ? 'ja-JP' : undefined, { year:'numeric', month:'numeric', day:'numeric', hour:'2-digit', minute:'2-digit' });
      note.textContent = _t('decks.lastUpdated', { t: ts });
    } else {
      note.textContent = _t('decks.fetchFail');
    }
  }
}
// 言語切替時：集計テキスト・タブ説明＋動的描画（デッキ一覧/カードランキング/分布図/チップ等）を現在言語で作り直す
window.addEventListener('crlangchange', () => {
  try { renderAggText(); updateDeckTabDesc(); renderMetaShare(); } catch (e) {}
  try { applyDecks(); } catch (e) {}
  try { renderCrank(); renderMetaMap(); renderMeMeta(); } catch (e) {}
  try { updateMeLabel(); } catch (e) {}
  try {
    if (cardFilter && _cardChip && _cardChip.style.display !== 'none') {
      _cardChip.innerHTML = _t('decks.withCard', { name: cardFilter }) + ' <span class="x">✕</span>';
    }
  } catch (e) {}
});

// ★メタシェア（勝ち筋別の環境占有率。GASの j.meta）
let META = [];
function renderMetaShare() {
  const el = document.getElementById('metaShare');
  if (!el) return;
  if (!META || META.length < 2) { el.style.display = 'none'; return; }
  const top = META; // 全勝ち筋をスクロール表示
  const maxS = Math.max(1, ...top.map(m => m.share || 0));
  el.style.display = '';
  el.innerHTML = '<div class="ms-title">' + _tr('🧭 環境シェア（勝ち筋別・過去3日）') + '</div>'
    + '<div class="ms-note">' + _tr('％＝この勝ち筋カードを含むデッキを使った人の割合（複数の勝ち筋を持つデッキは各勝ち筋にカウント）／ 勝率＝そのデッキ全体の勝率') + '</div>'
    + '<div class="ms-list">' + top.map(m => {
      const base = String(m.k).replace(/[⚡👑]+$/, '');
      const suf = String(m.k).slice(base.length);
      const info = CARD_INFO[base];
      const src = info ? ((suf === '⚡' && info.iv) ? info.iv : (suf === '👑' && info.ih) ? info.ih : info.i) : '';
      const img = src ? '<img src="' + src + '" alt="' + base + '" loading="lazy">' : '';
      return '<div class="ms-row">'
        + '<span class="ms-ico">' + img + '</span>'
        + '<span class="ms-name"><span>' + base + '</span>' + (suf ? '<span class="ms-suf">' + suf + '</span>' : '') + '</span>'
        + '<span class="ms-bar"><i style="width:' + Math.round((m.share || 0) / maxS * 100) + '%"></i></span>'
        + '<span class="ms-share">' + (m.share || 0) + '%</span>'
        + '<span class="ms-win">' + (m.win != null ? _t('decks.winPct', { p: m.win }) : '') + '</span>'
        + '</div>';
    }).join('') + '</div>';
}

const DECKS_DATA_URL = 'https://raw.githubusercontent.com/rea-fi-lia/clash-royale-deck/data/decks.json';
fetch(DECKS_DATA_URL, { cache: 'no-store' })
  .then(r => { if (!r.ok) throw 0; return r.json(); })
  .catch(() => fetch('decks.json', { cache: 'no-store' }).then(r => r.ok ? r.json() : null))
  .then(j => {
    const hasData = j && Array.isArray(j.decks) && j.decks.length;
    ALL_DECKS = hasData ? j.decks : DECKS;
    WIN_DECKS = (j && Array.isArray(j.winDecks)) ? j.winDecks : [];
    const trendReal = j && Array.isArray(j.trending) && j.trending.length;
    TREND_DECKS = trendReal ? j.trending : []; // 内蔵サンプルは形(forms)を持たず崩れるので使わない。空なら「集計中」表示
    const cardsReal = j && Array.isArray(j.cards) && j.cards.length;
    CARDS_DATA = cardsReal ? j.cards : CARDS_SAMPLE;
    initCardMeta(!cardsReal);
    META = (j && Array.isArray(j.meta)) ? j.meta : [];
    renderMetaShare();
    PLAYERS_TOTAL = (j && j.players) ? j.players : 0;
    if (j && j.winMin) WIN_MIN_SHOW = j.winMin;
    _agg.sample = (j && j.players) ? j.players : null;
    _agg.top = (j && j.topPlayers) ? j.topPlayers : null;
    _agg.hrs = (j && j.intervalHours) ? j.intervalHours : 6;
    _agg.cardsReal = cardsReal;
    _agg.updated = (j && j.updated) ? j.updated : null;
    UPDATE_HRS = _agg.hrs;
    // 勝率タブが無ければ非表示
    const winTabBtn = document.querySelector('.deck-tab[data-tab="win"]');
    if (winTabBtn) winTabBtn.style.display = WIN_DECKS.length ? '' : 'none';
    renderAggText();
    updateDeckTabDesc();
    applyDecks();
  })
  .catch(() => { ALL_DECKS = DECKS; TREND_DECKS = []; CARDS_DATA = CARDS_SAMPLE; initCardMeta(true); updateDeckTabDesc(); applyDecks(); });
