// =============================================
// CARD DATA — ここを編集してカードを追加・変更
// 名称はsmashlog正式名称に準拠
// =============================================
// CARDS（カードデータ本体）は js/cards-data.js に移動（単一ソース）
// =============================================

let deck = [null,null,null,null,null,null,null,null];
// お気に入りはログイン状態で切り分け：ログアウト中＝匿名ローカル / ログイン中＝アカウント(クラウド)
let favorites = JSON.parse(localStorage.getItem('cr_favorites_anon') || localStorage.getItem('cr_favorites') || '[]');
let activeTypes = new Set(); // 複数選択。空＝全て表示
// カードが指定タイプに該当するか（type or 進化/英雄/チャンピオンのフラグ）
function cardMatchesType(c, t) {
  if (t === 'evolved')   return !!c.evolved;
  if (t === 'hero')      return !!c.hero;
  if (t === 'champion')  return !!c.champion;
  return c.type === t;
}
// タブの選択ハイライトをactiveTypesに同期（全ては選択ゼロのとき点灯）
function syncTabUI() {
  document.querySelectorAll('.ttab:not([data-type="fav"])').forEach(x => {
    const ty = x.dataset.type;
    if (ty === 'all') x.classList.toggle('active', activeTypes.size === 0);
    else x.classList.toggle('active', activeTypes.has(ty));
  });
}
let activeCosts = new Set();
let costDesc = false; // コスト高い順に並べ替えるトグル
let favSort = (() => { try { return JSON.parse(localStorage.getItem('cr_favsort') || 'false'); } catch(e) { return false; } })(); // ❤トグル：ONでお気に入りを先頭に。リロードでも維持
let assistMode = (() => { try { return localStorage.getItem('cr_assist_mode') === 'on'; } catch(e) { return false; } })();
let assistSuggestions = [];
let assistVariant = 0;
const ASSIST_DATA_BASE = 'https://raw.githubusercontent.com/rea-fi-lia/clash-royale-deck/data/';
function dataFreshUrl(url) {
  return url + (url.indexOf('?') >= 0 ? '&' : '?') + 'cb=' + Date.now();
}
const assistData = { wincon: null, potential: null, tags: null, pairs: null, ready: false, tried: false };

function saveFavorites() {
  if (window.CRAuth && CRAuth.getUser && CRAuth.getUser()) {
    CRAuth.saveFavorites(favorites);   // ログイン中＝アカウント(クラウド)だけに保存
  } else {
    try { localStorage.setItem('cr_favorites_anon', JSON.stringify(favorites)); } catch(e) {} // ログアウト中＝匿名ローカル
  }
}

function isFav(name) { return favorites.includes(name); }

let justFaved = null; // アニメーション対象のカード名
function toggleFav(name, e) {
  e.stopPropagation();
  if (isFav(name)) { openFavRemoveDialog(name); return; } // ミスタップ対策：外す時は確認
  favorites.push(name);
  saveFavorites();
  justFaved = name;
  render();
  justFaved = null;
}

// i18nヘルパー：T=プレースホルダ補間翻訳（名前/数字入りの動的文字列用）、TR=単純翻訳（カード名など）。
// 固定文はi18nのbody監視が挿入時に自動翻訳するので、ここでは動的文字列だけT/TRで包む。
function T(key, vars, fb) { return window.CRI18N ? CRI18N.t(key, vars) : (fb != null ? fb : key); }
function TR(s) { return window.CRI18N ? CRI18N.tr(s) : s; }
// 言語切替時：数値入りの動的表示（平均コストの枚数など）を現在言語で作り直す
window.addEventListener('crlangchange', () => { try { showDeckStats(deck); updateActionButtons(); updateAssistPanel(); } catch (e) {} });

// お気に入り解除の確認ダイアログ
function openFavRemoveDialog(name) {
  const ov = document.createElement('div');
  ov.className = 'swap-overlay';
  ov.innerHTML = `<div class="swap-box">
    <div class="swap-title">${T('fav.removeQ', { name: TR(name) })}</div>
    <div class="swap-options">
      <button class="btn swap-remove-btn">外す</button>
      <button class="btn btn-ghost swap-keep-btn">キャンセル</button>
    </div>
  </div>`;
  ov.onclick = e => { if (e.target === ov) ov.remove(); };
  ov.querySelector('.swap-keep-btn').onclick = () => ov.remove();
  ov.querySelector('.swap-remove-btn').onclick = () => {
    favorites = favorites.filter(f => f !== name);
    saveFavorites();
    ov.remove();
    render();
  };
  document.body.appendChild(ov);
}


let lastDeckCount = 0;

function triggerSlotAnim(idx) {
  setTimeout(() => {
    const slots = document.querySelectorAll('.slot');
    if (slots[idx]) {
      slots[idx].classList.remove('just-added');
      void slots[idx].offsetWidth;
      slots[idx].classList.add('just-added');
      slots[idx].addEventListener('animationend', () => slots[idx].classList.remove('just-added'), {once:true});
    }
  }, 30);
}

function triggerCompleteAnim() {
  // フラッシュ
  const flash = document.createElement('div');
  flash.className = 'complete-flash';
  document.body.appendChild(flash);
  flash.addEventListener('animationend', () => flash.remove());

  // テキスト
  const txt = document.createElement('div');
  txt.className = 'complete-text';
  txt.textContent = 'COMPLETE!';
  document.body.appendChild(txt);
  txt.addEventListener('animationend', () => txt.remove());

  // パーティクル
  const colors = ['#e8a020','#8b5cf6','#3a8ef0','#e8304a','#26c6a0','#fff'];
  const cx = window.innerWidth / 2;
  const cy = window.innerHeight / 2;
  for (let i = 0; i < 24; i++) {
    const p = document.createElement('div');
    p.className = 'particle';
    const angle = (i / 24) * Math.PI * 2;
    const dist = 120 + Math.random() * 160;
    const dx = Math.cos(angle) * dist;
    const dy = Math.sin(angle) * dist;
    p.style.cssText = `left:${cx}px;top:${cy}px;background:${colors[i%colors.length]};--fly:translate(${dx}px,${dy}px);animation-delay:${Math.random()*0.2}s;animation-duration:${0.8+Math.random()*0.6}s;`;
    document.body.appendChild(p);
    p.addEventListener('animationend', () => p.remove());
  }
}

function updateEnergyBar() {
  const count = deck.filter(d=>d).length;
  const wrap = document.getElementById('energyBarWrap');
  const bar = document.getElementById('energyBar');
  if (!wrap || !bar) return;
  if (count === 0) {
    wrap.style.display = 'none';
    return;
  }
  wrap.style.display = 'block';
  bar.style.width = (count / 8 * 100) + '%';

  // 追加時のみアニメ
  if (count > lastDeckCount) {
    // 追加されたスロットのidxを探す
    let newIdx = -1;
    for (let i = 0; i < 8; i++) {
      if (deck[i] && !window._prevDeck?.[i]) { newIdx = i; break; }
    }
    if (newIdx >= 0) triggerSlotAnim(newIdx);
    if (count === 8) setTimeout(triggerCompleteAnim, 100);
  }
  window._prevDeck = deck.map(d => d ? d.name : null);
  lastDeckCount = count;
}

function init() {
  loadAssistData();
  const cf = document.getElementById('costFilters');
  [1,2,3,4,5,6,7,8,9].forEach(c => {
    const b = document.createElement('button');
    b.className = 'cfbtn'; b.dataset.c = c; b.textContent = c; b.title = c + 'コスト';
    b.onclick = () => {
      // コストは単一選択：別のコストを押すと切り替わる。同じものを再度押すと解除
      const wasActive = activeCosts.has(c);
      activeCosts.clear();
      cf.querySelectorAll('button').forEach(x => x.classList.remove('active'));
      if (!wasActive) { activeCosts.add(c); b.classList.add('active'); }
      render();
    };
    cf.appendChild(b);
  });

  document.querySelectorAll('.ttab').forEach(t => {
    t.onclick = () => {
      if (t.dataset.type === 'fav') {
        favSort = !favSort;
        try { localStorage.setItem('cr_favsort', JSON.stringify(favSort)); } catch(e) {}
        t.classList.toggle('active', favSort);
        render();
        return;
      }
      if (t.dataset.type === 'all') {
        // 全て：選択を全部クリア
        activeTypes.clear();
        syncTabUI();
        render();
        return;
      }
      // 非all・非favタブ
      const type = t.dataset.type;
      const isMobile = window.matchMedia('(max-width: 720px)').matches;
      if (isMobile) {
        // 携帯：単一選択（同じタブ再タップで解除＝全て、別タブで入れ替え）
        if (activeTypes.has(type) && activeTypes.size === 1) activeTypes.clear();
        else { activeTypes.clear(); activeTypes.add(type); }
      } else {
        // PC：複数選択トグル
        if (activeTypes.has(type)) activeTypes.delete(type);
        else activeTypes.add(type);
      }
      syncTabUI();
      render();
    };
  });
  // 永続化された❤トグル状態をUIに反映
  const favTabEl = document.querySelector('.ttab[data-type="fav"]');
  if (favTabEl) favTabEl.classList.toggle('active', favSort);
  const assistToggle = document.getElementById('assistToggle');
  if (assistToggle) assistToggle.onclick = () => setAssistMode(!assistMode);

  const cardListEl = document.getElementById('cardList');
  cardListEl.addEventListener('dragover', e => {
    e.preventDefault();
    // デッキから1枚抜く場合の平均コストを仮表示
    if (dragSrcIdx !== null) { const hyp = deck.slice(); hyp[dragSrcIdx] = null; previewStats(hyp); }
  });
  cardListEl.addEventListener('dragleave', () => clearPreviewStats());
  cardListEl.addEventListener('drop', e => {
    e.preventDefault();
    clearPreviewStats();
    if (dragSrcIdx !== null) {
      deck[dragSrcIdx] = null;
      dragSrcIdx = null;
      renderDeck(); refreshInDeck();
    }
  });
  const searchEl = document.getElementById('search');
  const clearBtn2 = document.getElementById('searchClear');
  // 検索を始める前の一覧スクロール位置を覚えておく（解除時にそこへ戻す）
  let listScrollMemo = 0;
  cardListEl.addEventListener('scroll', () => {
    if (!searchEl.value) listScrollMemo = cardListEl.scrollTop;
  }, { passive: true });
  const restoreListScroll = () => {
    // render()で一覧が作り直されるので、次フレームで元の位置へ
    requestAnimationFrame(() => { cardListEl.scrollTop = listScrollMemo; });
  };
  // iOSのフォーカス時チラつき対策：
  // 祖先が全てoverflow:hiddenなので、iOSは入力欄を見せようとビジュアルビューポート自体を
  // 一瞬ずらして戻す（＝チラつき）。これは window.scrollTo では止められない。
  // pointerdownを横取りし、スクロールを伴わない focus({preventScroll:true}) で自前フォーカスして根絶する。
  // （未フォーカス時のみ横取り。2回目以降はネイティブのカーソル移動をそのまま通す）
  searchEl.addEventListener('pointerdown', (e) => {
    if (document.activeElement !== searchEl) {
      e.preventDefault();
      try { searchEl.focus({ preventScroll: true }); }
      catch (_) { searchEl.focus(); }
    }
  });
  // Enter/改行（確定後）でキーボードを閉じる
  searchEl.addEventListener('keydown', e => {
    if (e.key === 'Enter') { e.preventDefault(); searchEl.blur(); }
  });
  // フォーム化していないが、念のため送信相当の確定でもblur
  searchEl.addEventListener('search', () => searchEl.blur());
  searchEl.oninput = () => {
    const has = searchEl.value.length > 0;
    clearBtn2.classList.toggle('visible', has);
    searchEl.classList.toggle('has-value', has);
    render();
    if (!has) restoreListScroll(); // 手動で全部消したときも元の位置へ
  };
  // ✕：テキストを消して、必ずキーボードを閉じる
  const doClear = (e) => {
    e.preventDefault();
    searchEl.value = '';
    clearBtn2.classList.remove('visible');
    searchEl.classList.remove('has-value');
    render();
    restoreListScroll(); // 検索を始める前のスクロール位置へ戻す
    searchEl.blur();     // 必ずキーボードを閉じる
  };
  clearBtn2.addEventListener('pointerdown', doClear);
  // コスト高い順 ⇄ 低い順トグル。方向の矢印だけを光らせる
  const costSortBtn = document.getElementById('costSortBtn');
  function updateCostSortBtn() {
    costSortBtn.innerHTML = 'コスト'
      + '<span class="cs-ar' + (!costDesc ? ' on' : '') + '">▲</span>'
      + '<span class="cs-ar' + (costDesc ? ' on' : '') + '">▼</span>';
  }
  if (costSortBtn) {
    updateCostSortBtn();
    costSortBtn.onclick = () => { costDesc = !costDesc; updateCostSortBtn(); render(); };
  }
  { const cb = document.getElementById('clearBtn'); if (cb) cb.onclick = () => { deck = [null,null,null,null,null,null,null,null]; renderDeck(); refreshInDeck(); }; }
  document.getElementById('copyDeckBtn').onclick = onCopyOrPaste;
  document.getElementById('saveBtn').onclick = openSlotSaveDialog;
  initSlotScrub();
  document.getElementById('analyzeBtn').addEventListener('click', (e) => {
    // 8枚そろってない時は分析ページへ行かせない
    if (deck.filter(Boolean).length < 8) { e.preventDefault(); showToast('8枚そろうと分析できます'); }
  });

  render();
  renderDeck();
  updateAssistPanel();
  initTouchDnD();
}

// ひらがな→カタカナ変換（検索用）
function toKatakana(str) {
  return str.replace(/[ぁ-ゖ]/g, ch => String.fromCharCode(ch.charCodeAt(0) + 0x60));
}

function getFiltered() {
  const raw = document.getElementById('search').value;
  const q = toKatakana(raw.toLowerCase());
  let res = CARDS.filter(c => {
    // 進化/英雄/チャンピオンはtype(troop/spell/building)ではなくフラグで判定
    // 複数選択：いずれかに該当すれば表示（OR）。空なら全て表示
    if (activeTypes.size > 0 && ![...activeTypes].some(t => cardMatchesType(c, t))) return false;
    if (activeCosts.size > 0 && !activeCosts.has(c.cost)) return false;
    if (q) {
      const nameMatch = toKatakana(c.name.toLowerCase()).includes(q);
      const yomiMatch = c.yomi && toKatakana(c.yomi.toLowerCase()).includes(q);
      // 英語名（画像スラッグ）でも検索：大小・スペース/ハイフンを無視（"hog"/"Hog Rider"→ホグライダー）
      const qa = raw.toLowerCase().replace(/[^a-z0-9]/g, '');
      const slug = ((c.img || '').match(/\/([a-z0-9-]+)\.png/i) || [])[1] || '';
      const enMatch = qa && slug.toLowerCase().replace(/[^a-z0-9]/g, '').includes(qa);
      if (!nameMatch && !yomiMatch && !enMatch) return false;
    }
    return true;
  });
  if (costDesc) {
    // コスト高い順（同コストは元の並び順を維持＝安定ソート）
    res = res.slice().sort((a, b) => b.cost - a.cost);
  }
  if (favSort) {
    // お気に入りを先頭に（各グループ内の並び＝コスト順を維持）。コスト高い順でもお気に入りは常に最上段
    res = res.filter(c => isFav(c.name)).concat(res.filter(c => !isFav(c.name)));
  }
  return res;
}

// ===== 参謀モード：次の1枚（v1.5・監修JSONがあれば使い、無ければローカル定義で動く） =====
function normalizeAssistCards(j) {
  if (!j) return null;
  if (j.cards && !Array.isArray(j.cards)) return j.cards;
  if (Array.isArray(j.cards)) return Object.fromEntries(j.cards.map(x => [x.name, x]));
  if (Array.isArray(j)) return Object.fromEntries(j.map(x => [x.name, x]));
  return j.byCard || null;
}
function loadAssistJson(name) {
  return fetch(dataFreshUrl(ASSIST_DATA_BASE + name), { cache: 'no-store' }).then(r => r.ok ? r.json() : null).catch(() => null);
}
function loadAssistData() {
  if (assistData.tried) return;
  assistData.tried = true;
  Promise.all([
    loadAssistJson('wincon-policy.json'),
    loadAssistJson('card-potential.json'),
    loadAssistJson('card-tags.json'),
    loadAssistJson('card-pair-synergy-v1.json')
  ]).then(([wincon, potential, tags, pairs]) => {
    assistData.wincon = normalizeAssistCards(wincon);
    assistData.potential = normalizeAssistCards(potential);
    assistData.tags = normalizeAssistCards(tags);
    assistData.pairs = pairs && pairs.byCard ? pairs.byCard : null;
    assistData.ready = !!(assistData.wincon || assistData.potential || assistData.tags || assistData.pairs);
    updateAssistPanel();
  }).catch(() => {});
}
function assistWincon(c) {
  return assistData.wincon && assistData.wincon[c.name];
}
function assistPotential(c) {
  return (assistData.potential && (assistData.potential[c.name] || assistData.potential[c.name + '⚡'] || assistData.potential[c.name + '👑'])) || null;
}
function assistTags(c) {
  const row = assistData.tags && (assistData.tags[c.name] || assistData.tags[c.name + '⚡'] || assistData.tags[c.name + '👑']);
  return new Set((row && row.tags) || []);
}
function assistTagHas(c, tag) {
  return assistTags(c).has(tag);
}
const ASSIST_WINCONS = new Set([
  'ウォールブレイカー','スケルトンバレル','エリクサーゴーレム','ディガー','ゴブリンバレル',
  'ホグライダー','攻城バーバリアン','ゴブリンドリル','迫撃砲','ジャイアント','エアバルーン',
  'ロイヤルホグ','ラムライダー','ゴブリンシュタイン','ゴブリンマシン','スケルトンラッシュ',
  'ロイヤルジャイアント','エリートバーバリアン','ゴブジャイアント','スパーキー','ロケット',
  '巨大クロスボウ','ペッカ','ラヴァハウンド','エレクトロジャイアント','メガナイト',
  '見習い親衛隊','ゴーレム','三銃士'
]);
const ASSIST_SECONDARY = new Set([
  'プリンセス','吹き矢ゴブリン','アサシン ユーノ','ロイヤルゴースト','リトルプリンス',
  'マジックアーチャー','ダークプリンス','ランバージャック','スケルトンキング','フェニックス',
  'マイティディガー','ゴールドナイト','プリンス','アーチャークイーン','モンク','巨大スケルトン',
  'ステルスブッシュ','コウモリの群れ','ゴブリンの呪い','アーチャー','ガーゴイル',
  'ゴブリンギャング','ロケット砲士','スケルトン部隊','盾の戦士','スケルトンドラゴン',
  'ザッピー','ホバリング砲','ダイナマイトゴブリン','ベビードラゴン','マザーネクロマンサー',
  'ダークネクロ','鍛冶屋ジャイアント'
]);
const ASSIST_SMALL_SPELLS = new Set(['ザップ','巨大雪玉','ローリングバーバリアン','ローリングウッド','矢の雨','ゴブリンの呪い']);
const ASSIST_MED_SPELLS = new Set(['ファイアボール','ポイズン','フリーズ','トルネード','アースクエイク','ロイヤルデリバリー','ボイド','ヴァイン']);
const ASSIST_BIG_SPELLS = new Set(['ライトニング','ロケット']);

function assistHas(c, words) {
  const s = (c.name + ' ' + (c.role || '')).toLowerCase();
  return words.some(w => s.includes(String(w).toLowerCase()));
}
// 呪文かどうか／呪文サイズ（小・中・大）を返す。実データの type と監修セットの両方で判定。
function assistIsSpell(c) {
  return c.type === 'spell' || ASSIST_SMALL_SPELLS.has(c.name) || ASSIST_MED_SPELLS.has(c.name) || ASSIST_BIG_SPELLS.has(c.name);
}
function assistSpellSize(c) {
  if (!assistIsSpell(c)) return null;
  if (ASSIST_BIG_SPELLS.has(c.name)) return 'big';
  if (ASSIST_MED_SPELLS.has(c.name)) return 'mid';
  if (ASSIST_SMALL_SPELLS.has(c.name)) return 'small';
  return c.cost >= 5 ? 'big' : c.cost >= 3 ? 'mid' : 'small';
}
// カードが実際に空中を撃てる前衛/後衛か（呪文の splash/air タグで空対応扱いされる誤判定を弾く）
function assistIsTrueAir(c) {
  if (assistIsSpell(c)) return false;
  return assistTagHas(c, 'air') || assistHas(c, ['対空']);
}
// 監修 axes に指定の軸が含まれるか
function assistAxisHas(c, axis) {
  const w = assistWincon(c);
  return !!(w && Array.isArray(w.axes) && w.axes.includes(axis));
}
function assistTypeOf(c) {
  const w = assistWincon(c);
  if (w && w.class === '勝ち筋') return 'wincon';
  if (w && w.class === '第2勝ち筋') return 'secondary';
  if (w && w.class === '補助勝ち筋') return 'supportWincon';
  if (w && w.class === 'サイクル札') return 'cycle';
  if (w && w.class === '防衛札') return 'defense';
  if (ASSIST_WINCONS.has(c.name)) return 'wincon';
  if (ASSIST_SECONDARY.has(c.name)) return 'secondary';
  if (ASSIST_SMALL_SPELLS.has(c.name)) return 'smallSpell';
  if (ASSIST_MED_SPELLS.has(c.name)) return 'midSpell';
  if (ASSIST_BIG_SPELLS.has(c.name)) return 'bigSpell';
  if (c.type === 'building') return 'building';
  if (c.cost <= 2 || assistHas(c, ['サイクル'])) return 'cycle';
  if (assistTagHas(c, 'air') || assistHas(c, ['対空'])) return 'air';
  if (assistTagHas(c, 'splash') || assistHas(c, ['範囲','小型処理','スプラッシュ'])) return 'splash';
  if (assistTagHas(c, 'tankKiller') || assistTagHas(c, 'ramp') || assistHas(c, ['高DPS','高火力','集中加熱'])) return 'dps';
  if (assistTagHas(c, 'tgHp') || assistTagHas(c, 'minitank') || assistHas(c, ['タンク','防衛'])) return 'defense';
  return 'support';
}
function assistIsMainWincon(c) {
  const w = assistWincon(c);
  return (w && w.class === '勝ち筋') || ASSIST_WINCONS.has(c.name);
}
function assistIsSecondary(c) {
  const w = assistWincon(c);
  return (w && (w.class === '第2勝ち筋' || w.class === '補助勝ち筋')) || ASSIST_SECONDARY.has(c.name);
}
function assistCostProfile(cards) {
  const arr = (cards || []).filter(Boolean).map(c => c.cost || 0).sort((a, b) => a - b);
  const avg = arr.length ? arr.reduce((s, v) => s + v, 0) / arr.length : 0;
  const cyc = arr.slice(0, Math.min(4, arr.length));
  const cycleAvg = cyc.length ? cyc.reduce((s, v) => s + v, 0) / cyc.length : 0;
  return { avg, cycleAvg };
}
function assistDeckInfo() {
  const cards = deck.filter(Boolean);
  const names = new Set(cards.map(c => c.name));
  const costProfile = assistCostProfile(cards);
  const avg = costProfile.avg;
  const cycleAvg = costProfile.cycleAvg;
  const wincons = cards.filter(assistIsMainWincon);
  const spells = cards.filter(assistIsSpell);
  const smallSpells = cards.filter(c => assistSpellSize(c) === 'small');
  const air = cards.filter(assistIsTrueAir);
  const splash = cards.filter(c => assistTagHas(c, 'splash') || assistHas(c, ['範囲','小型処理','スプラッシュ']));
  const dps = cards.filter(c => assistTagHas(c, 'tankKiller') || assistTagHas(c, 'ramp') || assistHas(c, ['高DPS','高火力','集中加熱']));
  const buildings = cards.filter(c => c.type === 'building');
  const cycles = cards.filter(c => c.cost <= 2 || assistHas(c, ['サイクル']));
  const main = wincons[0] || cards.find(assistIsSecondary) || cards[0] || null;
  const secondaries = cards.filter(c => assistIsSecondary(c) && !assistIsMainWincon(c));
  // 主勝ち筋の「型」を取り出す（natural候補の方向付けに使う）
  const mainW = wincons[0] && assistWincon(wincons[0]);
  const mainAxes = (mainW && Array.isArray(mainW.axes)) ? mainW.axes : [];
  const mainAttack = (mainW && mainW.attackType) || '';
  const style = cards.length === 0 ? 'まだ方向未定'
    : (wincons.length ? TR(wincons[0].name) + '軸' : '主軸探し中')
      + '・' + (cycleAvg && cycleAvg <= 2.4 ? '回しやすい' : avg >= 4.2 ? '重め' : '中速')
      + (spells.length ? '・呪文あり' : '・呪文なし');
  const personaAxes = (typeof getPersonaAxes === 'function') ? getPersonaAxes() : null;
  // 空きスロットの種類を把握（idx0=進化枠 / idx1=ヒーロー・チャンピオン枠 / idx2=ワイルド枠(進化orヒーロー) / idx3-7=通常）
  // 例：進化枠/ワイルド枠が両方埋まっていると、カードの「進化として強い」価値は出せない＝特別枠ボーナスを乗せない。
  const champCount = cards.filter(c => c.champion).length;
  const slots = {
    evoOpen:    deck[0] === null || deck[2] === null,                 // 進化を活かせる枠が空いているか
    heroOpen:   deck[1] === null || deck[2] === null,                 // ヒーローを活かせる枠が空いているか
    champOpen:  (deck[1] === null || deck[2] === null) && champCount < 2, // チャンピオンを置ける枠が空いているか
    specialOpen: deck[0] === null || deck[1] === null || deck[2] === null, // 特別枠(1〜3)のどれかが空き
    normalOpen: [3, 4, 5, 6, 7].some(i => deck[i] === null)          // 通常枠(4〜8)のどれかが空き
  };
  return { cards, names, avg, cycleAvg, wincons, spells, smallSpells, air, splash, dps, buildings, cycles, main, secondaries, mainAxes, mainAttack, personaAxes, slots, style };
}
function assistLegal(c, info) {
  if (info.names.has(c.name)) return false;
  if (info.cards.length >= 8) return false;
  // 呪文は最大3枚まで。逆に最後の1枚で呪文0なら、必ず呪文を候補にする。
  if (assistIsSpell(c) && info.spells.length >= 3) return false;
  if ((8 - info.cards.length) <= 1 && info.spells.length < 1 && !assistIsSpell(c)) return false;
  return true;
}
function assistTextHit(text, needles) {
  const s = String(text || '').toLowerCase();
  return needles.some(n => {
    const w = String(n == null ? '' : n).trim().toLowerCase();
    if (w.length < 2) return false; // 空文字・1字ノイズは誤ヒットの元なので無視
    return s.includes(w);
  });
}
function assistDeckTraitText(info) {
  const parts = [];
  info.cards.forEach(c => {
    const p = assistPotential(c);
    parts.push(c.name, c.role || '', p && p.scaling, p && p.partner);
    const tags = assistTags(c); tags.forEach(t => parts.push(t));
  });
  if (info.cycles.length >= 3 || info.avg <= 3.0) parts.push('軽サイクル', 'サイクル', '高回転');
  if (info.splash.length) parts.push('範囲攻撃');
  if (info.dps.length) parts.push('高DPS', 'タンクキラー');
  if (info.air.length) parts.push('対空');
  if (info.wincons.some(c => assistTagHas(c, 'tank') || assistHas(c, ['タンク']))) parts.push('タンク', '強後衛');
  if (info.wincons.some(c => assistTagHas(c, 'spellBait') || assistHas(c, ['バレル']))) parts.push('ベイト');
  return parts.filter(Boolean).join(' ');
}
function assistPotentialFit(c, info) {
  const p = assistPotential(c);
  if (!p) return 0;
  let score = 0;
  const trait = assistDeckTraitText(info);
  if (p.partner && assistTextHit(trait, String(p.partner).split(/[・/／,、\s()（）]+/))) score += 26;
  if (p.scaling && assistTextHit(trait, String(p.scaling).split(/[・/／,、\s()（）]+/))) score += 12;
  if (p.solo === '◎' && info.cards.length <= 2) score += 8;
  if (p.solo === '△' && info.cards.length <= 1) score -= 8;
  if (Array.isArray(p.phase) && (p.phase[1] === '◎' || p.phase[2] === '◎') && info.avg >= 3.8) score += 8;
  return score;
}
function assistPairRows(c, info) {
  if (!assistData.pairs || !c || !info || !info.names) return [];
  const rows = assistData.pairs[c.name] || [];
  return rows.filter(r => info.names.has(r.other) && r.kind !== 'utilityOrCommon');
}
function assistPairFit(c, info) {
  const rows = assistPairRows(c, info);
  if (!rows.length) return 0;
  const vals = rows.map(r => Math.max(0, Number(r.score) || 0)).sort((a, b) => b - a);
  const max = vals[0] || 0;
  const avg2 = vals.length >= 2 ? (vals[0] + vals[1]) / 2 : max;
  return Math.round(Math.min(30, max * 0.65 + avg2 * 0.35));
}
function assistBestPair(c, info) {
  const rows = assistPairRows(c, info).slice().sort((a, b) => (Number(b.score) || 0) - (Number(a.score) || 0));
  return rows[0] || null;
}
function assistWinconBonus(c, kind, info) {
  const w = assistWincon(c);
  if (!w) return 0;
  let score = 0;
  // 主勝ち筋がまだ無いときだけ、natural で主勝ち筋度を強く評価。
  // すでに主勝ち筋がある場合に2枚目の主役を勧めるのは方針に反するので加点しない。
  if (kind === 'natural') score += (w.mainWinconScore || 0) * (!info.wincons.length ? 8 : 0);
  if (kind === 'discovery') score += (w.secondaryWinconScore || 0) * 3 + (w.finishingScore || 0) * 1.5;
  if (kind === 'stable' && w.class === '防衛札') score += 30;
  if (w.class === 'サイクル札' && (info.avg >= 3.8 || info.cards.length >= 4)) score += 14;
  if (!w.ownerReviewed) score -= 6;
  return score;
}
// 主勝ち筋の「型」が次に欲しがる性質を返す（natural候補の方向付け）。
function assistMainWants(info) {
  const wants = new Set();
  if (!info.wincons.length) return wants;
  const at = info.mainAttack;
  if (['directPressure', 'chipPressure', 'siege', 'spellFinish'].includes(at)) {
    // ホグ/攻城/迫撃などの「素早く通す・刺す」型 → 道を開ける小型呪文・軽い回転・受け建物
    wants.add('smallSpell'); wants.add('cycle'); wants.add('defense');
  } else if (at === 'mainPressure') {
    // タンク後衛型 → 後ろから撃つ射撃支援・範囲・対空・中型呪文
    wants.add('rangedSupport'); wants.add('splash'); wants.add('air'); wants.add('midSpell');
  } else {
    wants.add('smallSpell'); wants.add('rangedSupport');
  }
  return wants;
}
function assistCostFit(c, info, kind) {
  const after = assistCostProfile(info.cards.concat([c]));
  const count = info.cards.length;
  let score = 0;
  // 平均コスト＝デッキ全体の重さ。序盤(1〜2枚)はまだ形が決まっていないので重い主役も許容。
  if (count >= 4) {
    if (after.avg > 4.4) score -= 18;
    else if (after.avg < 2.6) score -= 8;
    else if (after.avg >= 3.0 && after.avg <= 3.8) score += 6;
  } else if (assistIsMainWincon(c) && c.cost >= 5) {
    score += 6; // 早い段階なら重い主役もあり
  }
  // 回転コスト＝4枚回しの軽さ。高回転好き/サイクル型ではここを重視。
  const tempo = info.personaAxes ? (info.personaAxes.tempo || 0) : 0;
  if (tempo > 0.25 || info.cycles.length >= 2) {
    if (after.cycleAvg <= 2.4) score += count >= 3 ? 12 : 6;
    else if (after.cycleAvg >= 3.2 && count >= 4) score -= 10;
  }
  // ただし序盤に軽さだけへ寄りすぎると主役不在になりやすいので、序盤の軽量連打は抑える。
  if (count <= 2 && !info.wincons.length && c.cost <= 2 && !assistIsMainWincon(c)) score -= 12;
  return score;
}
function assistScore(c, kind, info) {
  let score = 0;
  const t = assistTypeOf(c);
  const size = assistSpellSize(c);
  const isSpell = assistIsSpell(c);
  if (kind === 'natural') {
    if (!info.wincons.length) {
      // 主勝ち筋がまだ無い → まず主役を作る
      if (t === 'wincon') score += 90;
      if (assistIsSecondary(c)) score += 24;
    } else {
      // 主勝ち筋がある → その型が欲しがる支援を優先（型に沿って伸ばす）
      const wants = assistMainWants(info);
      if (wants.has('smallSpell') && size === 'small') score += 42;
      if (wants.has('midSpell') && size === 'mid') score += 30;
      if (wants.has('cycle') && c.cost <= 2 && !isSpell) score += 26;
      if (wants.has('rangedSupport') && !isSpell && (assistIsTrueAir(c) || assistTagHas(c, 'splash') || assistTagHas(c, 'tankKiller') || assistHas(c, ['遠距離','高DPS']))) score += 28;
      if (wants.has('splash') && !isSpell && (assistTagHas(c, 'splash') || assistHas(c, ['範囲','小型処理']))) score += 22;
      if (wants.has('air') && assistIsTrueAir(c)) score += 20;
      if (wants.has('defense') && (c.type === 'building' || assistTagHas(c, 'defBuilding'))) score += 22;
      // 型に依らず、小型呪文と軽い補助は主軸を通しやすい
      if (size === 'small') score += 12;
      if (assistIsSecondary(c)) score += 10;
      if (info.main && assistHas(c, ['レイジ','回復','バフ','トルネード','フリーズ'])) score += 10;
    }
    score += assistCostFit(c, info, kind);
  } else if (kind === 'stable') {
    // 対空は「本当に空を撃てるユニット」だけ。呪文の air/splash タグでの誤加点を防ぐ。
    // さらに1コスのスピリットは“受け”として薄いので対空穴埋めの満点は与えない。
    if (assistIsTrueAir(c)) {
      const airBase = info.air.length < 1 ? 60 : info.air.length < 2 ? 34 : 0;
      const thin = c.cost <= 1 ? 0.45 : 1; // スピリット系は減衰
      score += airBase * thin;
    }
    // 呪文ゼロ → 小型呪文を中心に1枚だけ推す（大型呪文を穴埋め扱いで押し付けない）
    if (!info.spells.length && isSpell) score += (size === 'small' ? 50 : size === 'mid' ? 28 : 8) + (info.cards.length >= 5 ? 24 : 0);
    // 範囲処理・地上DPSは呪文以外のユニット役で埋める
    if (!info.splash.length && !isSpell && (assistTagHas(c, 'splash') || assistHas(c, ['範囲','小型処理']))) score += 38;
    if (!info.dps.length && !isSpell && (assistTagHas(c, 'tankKiller') || assistTagHas(c, 'ramp') || assistHas(c, ['高DPS','高火力','集中加熱']))) score += 32;
    if (!info.buildings.length && (c.type === 'building' || assistTagHas(c, 'defBuilding'))) score += 24;
    // 防衛で腐りにくい中型の受け（ミニタンク/高HP）を安定枠として後押し
    if (!isSpell && c.cost >= 3 && c.cost <= 5 && (assistTagHas(c, 'minitank') || assistTagHas(c, 'tgHp') || assistHas(c, ['防衛','タンク']))) score += 16;
    if (info.avg >= 4.0 && c.cost <= 2 && !isSpell) score += 22;
    if (c.cost <= 4) score += 6;
    score += assistCostFit(c, info, kind);
  } else {
    // discovery：今の主軸とは「別の圧」を足す。デッキ状況で変わるようにする。
    if (assistIsSecondary(c)) score += 40;
    // まだ第2勝ち筋が無ければ歓迎。すでにあるなら新規性（別カード性）を求めて控えめに。
    if (info.secondaries.length === 0) score += 18;
    else score -= 12 * info.secondaries.length;
    // 奇襲・ベイト・透明など「相手の受け方を迷わせる」性質を加点
    if (assistTagHas(c, 'bridgeSpam') || assistTagHas(c, 'spellBait') || assistTagHas(c, 'dash') || assistHas(c, ['奇襲','超長射程','透明','ダッシュ','複製','全停止','大量召喚'])) score += 26;
    // 主勝ち筋が地上なら空、空なら地上、とレーンを散らせる候補を後押し
    if (info.wincons.length) {
      const mainAir = info.wincons.some(w => assistTagHas(w, 'air') || assistTagHas(w, 'flying'));
      const candAir = assistTagHas(c, 'air') || assistTagHas(c, 'flying');
      if (mainAir !== candAir) score += 14;
    }
    if (c.champion) score += 10;
    if (info.cards.length <= 2 && t === 'wincon') score += 10;
    score += assistCostFit(c, info, kind);
  }
  score += assistPotentialFit(c, info);
  score += assistWinconBonus(c, kind, info);
  const pairFit = assistPairFit(c, info);
  if (pairFit) score += kind === 'discovery' ? Math.round(pairFit * 0.55) : pairFit;
  // スロット適合：特別枠(進化/ヒーロー/チャンピオン)が空いていれば、その強みを持つカードを後押し。
  // 枠が埋まっていれば加点しないだけ。シナジーが高ければ通常候補として残す（チャンピオンはタップ時に入れ替えUIへ）。
  if (info.slots) {
    if (info.slots.evoOpen && c.evolved) score += 16;
    if (info.slots.heroOpen && c.hero) score += 14;
    if (info.slots.champOpen && c.champion) score += 16;
  }
  // intentFit：ユーザーの嗜好プロフィール(MBTI＋2択)に沿うほど加点。
  // 「発見候補」は少し違う方向を出す枠なので persona の効きを弱める。
  if (info.personaAxes) {
    const fit = personaCardFit(c, info.personaAxes);
    score += kind === 'discovery' ? Math.round(fit * 0.4) : fit;
  }
  // 同じ役割が既に厚いなら重複ペナルティ（どの候補でも効かせる）
  if (!isSpell) {
    if (info.air.length >= 2 && assistIsTrueAir(c)) score -= 16;
    if (info.dps.length >= 2 && (assistTagHas(c, 'tankKiller') || assistTagHas(c, 'ramp'))) score -= 12;
  }
  // 主勝ち筋が既にあるのに別の主勝ち筋を勧めない（natural/stable）
  if (kind !== 'discovery' && info.wincons.length && t === 'wincon') score -= 30;
  if (info.avg >= 4.4 && c.cost >= 5 && info.cards.length >= 5) score -= 28;
  if (info.spells.length >= 2 && isSpell) score -= 22;
  if (info.cards.length >= 6 && !info.wincons.length && t !== 'wincon') score -= 45;
  return score;
}
function assistReason(c, kind, info) {
  const t = assistTypeOf(c);
  const p = assistPotential(c);
  const w = assistWincon(c);
  const size = assistSpellSize(c);
  const bp = assistBestPair(c, info);
  if (kind === 'natural') {
    if (!info.wincons.length) {
      if (w && w.class === '勝ち筋') return 'まず勝ち方の主役を作れます。';
      if (t === 'wincon') return 'まず勝ち方の主役を作れます。';
    }
    const mainName = info.wincons.length ? TR(info.wincons[0].name) : '主軸';
    if (size === 'small') return mainName + 'を通すための小型呪文。道を開けつつ少し圧もかけられます。';
    if (bp && (bp.score || 0) >= 12) return TR(bp.other) + 'と一緒に使われやすく、今の形に自然に足せます。';
    if (p && p.partner) return '今の構成と噛み合う相手があり、' + mainName + 'を伸ばせます。';
    if (assistIsTrueAir(c) || assistTagHas(c, 'splash')) return mainName + 'の後ろから守って撃てる支援役です。';
    return mainName + 'をそのまま伸ばしやすい候補です。';
  }
  if (kind === 'stable') {
    if (info.air.length < 2 && assistIsTrueAir(c)) return '対空が薄いので、空中の攻めへの受けが安定します。';
    if (!info.spells.length && assistIsSpell(c)) return '呪文が無いので、小物処理や押し込みが安定します。';
    if (!info.splash.length && (assistTagHas(c, 'splash') || assistHas(c, ['範囲','小型処理']))) return '範囲処理を足して、小物で崩されにくくします。';
    if (!info.dps.length && (assistTagHas(c, 'tankKiller') || assistTagHas(c, 'ramp'))) return '相手のタンクを溶かす役がいないので、守りが安定します。';
    if (info.avg >= 4.0 && c.cost <= 2) return '重めなので、回転を少し整える候補です。';
    return '今の穴を埋めて、事故を減らす候補です。';
  }
  if (w && (w.class === '第2勝ち筋' || w.class === '補助勝ち筋')) return 'もう一つの圧を足して、相手の受け方を迷わせます。';
  if (assistIsSecondary(c)) return 'もう一つの圧を足して、相手の受け方を迷わせます。';
  return '少し違う攻め方や面白さを足せる候補です。';
}
// 「理由を詳しく」用の補足文。役割の穴・噛み合い・倍速適性などを1〜2文で添える。
function assistDetail(c, kind, info) {
  const p = assistPotential(c);
  const w = assistWincon(c);
  const parts = [];
  const bp = assistBestPair(c, info);
  if (bp && (bp.score || 0) >= 8) {
    const why = bp.kind === 'broadSynergy' ? 'いろいろな構成で一緒に使われやすい組み合わせです。'
      : bp.kind === 'templateCore' ? '特定の型でよく使われる組み合わせです。'
      : bp.kind === 'hiddenWinLift' ? '一緒に入ると勝ちやすい傾向があります。'
      : '一緒に採用されることが多い組み合わせです。';
    parts.push(TR(bp.other) + 'との相性データがあります。' + why);
  }
  if (p && p.partner) parts.push('噛み合う相手: ' + p.partner + '。');
  if (p && p.scaling) parts.push('伸び方は「' + p.scaling + '」型です。');
  if (p && Array.isArray(p.phase)) {
    if (p.phase[1] === '◎' || p.phase[2] === '◎') parts.push('2倍/3倍タイムで価値が伸びます。');
    else if (p.phase[0] === '◎') parts.push('序盤から無理なく使えます。');
  }
  // 注意点（穴が残る）を正直に添える＝押し付けない
  if (kind === 'natural' && info.air.length < 1 && !assistIsTrueAir(c)) parts.push('ただし対空は増えないので、次は空受けを足したいです。');
  if (kind === 'discovery' && w && (w.class === '第2勝ち筋' || w.class === '補助勝ち筋')) parts.push('単体ではなく、組み合わせるとタワーダメージにつながります。');
  if (!parts.length) parts.push('今の方向を崩さずに足せる、扱いやすい1枚です。');
  return parts.join('');
}
function assistBadges(c, info) {
  const badges = [];
  const w = assistWincon(c);
  const p = assistPotential(c);
  const tags = assistTags(c);
  if (w && w.class) {
    const label = w.class === '勝ち筋' ? '主役級'
      : (w.class === '第2勝ち筋' || w.class === '補助勝ち筋') ? '追加の圧'
      : w.class === 'サイクル札' ? '回転調整'
      : w.class === '防衛札' ? '守り安定'
      : w.class === '変数カード' ? 'コンボ札'
      : '';
    if (label) badges.push(label);
  }
  if (p && p.partner) badges.push('噛み合い: ' + p.partner);
  if (p && p.scaling) badges.push(p.scaling);
  if (p && Array.isArray(p.phase)) {
    if (p.phase[1] === '◎' || p.phase[2] === '◎') badges.push('倍速向き');
    else if (p.phase[0] === '◎') badges.push('序盤OK');
  }
  if (p && p.solo === '◎') badges.push('単体でも動ける');
  const bp = info ? assistBestPair(c, info) : null;
  if (bp && (bp.score || 0) >= 12) badges.push('相性: ' + bp.other);
  if (tags.has('air')) badges.push('対空');
  if (tags.has('splash')) badges.push('範囲');
  if (tags.has('tankKiller')) badges.push('高火力');
  return [...new Set(badges)].slice(0, 3);
}
function pickAssistCandidate(kind, used, info) {
  const ranked = [];
  CARDS.forEach(c => {
    if (!assistLegal(c, info) || used.has(c.name)) return;
    const score = assistScore(c, kind, info);
    if (score > 0) ranked.push({ card: c, score });
  });
  ranked.sort((a, b) => b.score - a.score || a.card.cost - b.card.cost);
  const pick = ranked[Math.min(assistVariant, Math.max(0, ranked.length - 1)) % Math.min(3, Math.max(1, ranked.length))];
  if (!pick) return null;
  used.add(pick.card.name);
  return { kind, card: pick.card, score: pick.score, reason: assistReason(pick.card, kind, info), detail: assistDetail(pick.card, kind, info), badges: assistBadges(pick.card, info) };
}
function buildAssistSuggestions() {
  const info = assistDeckInfo();
  if (info.cards.length >= 8) return [];
  const used = new Set();
  return ['natural','stable','discovery'].map(k => pickAssistCandidate(k, used, info)).filter(Boolean);
}
function assistKindLabel(kind) {
  return kind === 'natural' ? '自然候補' : kind === 'stable' ? '安定候補' : '発見候補';
}
function assistKindIcon(kind) {
  return kind === 'natural' ? '🌱' : kind === 'stable' ? '🛡' : '✨';
}
// アシスト3択の下に出す拡張ブロック（将来：帯メタ/対面相性/支配度などをここに足す）。
// いまは空のプレースホルダ＝コンテナだけ用意して、増えても下までスクロールで届くようにする。
function assistExtraHtml(info) {
  return '<div class="assist-extra" id="assistExtra"></div>';
}
function esc(s) {
  return String(s == null ? '' : s).replace(/[&<>"']/g, ch => ({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[ch]));
}
function updateAssistPanel() {
  const controls = document.querySelector('.controls');
  const btn = document.getElementById('assistToggle');
  const panel = document.getElementById('assistPanel');
  if (!controls || !btn || !panel) return;
  controls.classList.toggle('assist-active', assistMode);
  btn.setAttribute('aria-pressed', assistMode ? 'true' : 'false');
  btn.innerHTML = assistMode ? '<span>アシストON</span>' : '<span>アシスト</span>';
  if (!assistMode) { panel.innerHTML = ''; assistSuggestions = []; refreshAssistHighlights(); return; }
  const info = assistDeckInfo();
  assistSuggestions = buildAssistSuggestions();
  if (info.cards.length >= 8) {
    panel.innerHTML = '<div class="assist-head"><div class="assist-title">次の一手<span class="assist-beta">BETA</span></div><div class="assist-state">8枚完成</div></div>'
      + '<div class="assist-empty">デッキが完成しました。ここからは分析で「どう勝つか」を読みましょう。</div>'
      + '<div class="assist-actions"><a class="assist-mini" href="strategy.html">デッキ分析へ</a></div>';
    refreshAssistHighlights();
    return;
  }
  const cardsHtml = assistSuggestions.length ? '<div class="assist-cards">' + assistSuggestions.map(s => {
    const c = s.card;
    const badges = (s.badges || []).map(x => '<span>' + esc(x) + '</span>').join('');
    const detail = s.detail ? '<button class="ac-detail-toggle" type="button" data-detail-for="' + esc(c.name) + '" aria-expanded="false">理由を詳しく</button>'
      + '<span class="ac-detail" data-detail="' + esc(c.name) + '" hidden>' + esc(s.detail) + '</span>' : '';
    return '<div class="assist-card ' + s.kind + '" role="button" tabindex="0" data-assist-card="' + esc(c.name) + '">'
      + (c.img ? '<img src="' + esc(c.img) + '" alt="" loading="lazy">' : '<span></span>')
      + '<span class="ac-body"><span class="ac-kind">' + assistKindIcon(s.kind) + ' ' + assistKindLabel(s.kind) + '</span>'
      + '<span class="ac-name">' + esc(TR(c.name)) + '</span>'
      + '<span class="ac-reason">' + esc(s.reason) + '</span>'
      + (badges ? '<span class="ac-badges">' + badges + '</span>' : '')
      + detail + '</span>'
      + '<span class="ac-add">＋</span></div>';
  }).join('') + '</div>' : '<div class="assist-empty">まず使いたいカードを1枚選ぶと、次の候補を出せます。</div>';
  const dataState = assistData.ready ? 'データ反映' : '簡易提案';
  const pAxes = info.personaAxes;
  const pSum = pAxes ? personaSummary(pAxes) : '';
  const costState = info.cards.length ? '平均' + info.avg.toFixed(1) + ' / 回転' + info.cycleAvg.toFixed(1) : 'コスト未定';
  const personaLine = pSum
    ? '<div class="assist-persona is-set" id="assistPersona"><span class="ap-ico">🎯</span><span class="ap-text">あなた好み：' + esc(pSum) + '</span><span class="ap-edit">変更</span></div>'
    : '<div class="assist-persona" id="assistPersona"><span class="ap-ico">🎯</span><span class="ap-text">デッキの好みを設定すると、あなた向けに候補が絞れます</span><span class="ap-edit">設定</span></div>';
  panel.innerHTML = '<div class="assist-head"><div class="assist-title">次の1枚<span class="assist-beta">BETA</span></div><div class="assist-state">' + esc(info.style) + ' / ' + esc(costState) + ' / ' + dataState + '</div></div>'
    + personaLine
    + cardsHtml
    + '<div class="assist-actions"><button class="assist-mini" id="assistRefresh" type="button">別候補</button><button class="assist-mini" id="assistOff" type="button">通常検索</button></div>'
    + assistExtraHtml(info)
    + '<div class="assist-bottom-pad" aria-hidden="true"></div>';
  // 「理由を詳しく」トグル（カード追加クリックより先に拾い、伝播を止める）
  panel.querySelectorAll('.ac-detail-toggle').forEach(t => {
    t.addEventListener('click', (e) => {
      e.stopPropagation();
      const name = t.getAttribute('data-detail-for');
      const d = panel.querySelector('.ac-detail[data-detail="' + (window.CSS && CSS.escape ? CSS.escape(name) : name) + '"]');
      const open = t.getAttribute('aria-expanded') === 'true';
      t.setAttribute('aria-expanded', open ? 'false' : 'true');
      t.textContent = open ? '理由を詳しく' : '閉じる';
      if (d) d.hidden = open;
    });
  });
  panel.querySelectorAll('[data-assist-card]').forEach(b => {
    let touchY = 0, touchMoved = false;
    const addCard = () => {
      const c = CARDS.find(x => x.name === b.getAttribute('data-assist-card'));
      if (!c) return;
      addAssistToDeck(c);
      showToast(assistKindLabel((assistSuggestions.find(s => s.card.name === c.name) || {}).kind || 'natural') + '：' + c.name);
      updateAssistPanel();
    };
    b.addEventListener('touchstart', (e) => {
      const t = e.touches && e.touches[0]; touchY = t ? t.clientY : 0; touchMoved = false;
    }, { passive: true });
    b.addEventListener('touchmove', (e) => {
      const t = e.touches && e.touches[0]; if (t && Math.abs(t.clientY - touchY) > 8) touchMoved = true;
    }, { passive: true });
    b.addEventListener('touchend', (e) => {
      if (touchMoved || e.target.closest('.ac-detail-toggle') || e.target.closest('.ac-detail')) return;
      e.preventDefault();
      _suppressClickUntil = Date.now() + 600;
      addCard();
    }, { passive: false });
    b.addEventListener('click', (e) => {
      if (Date.now() < _suppressClickUntil || e.target.closest('.ac-detail-toggle') || e.target.closest('.ac-detail')) return;
      addCard();
    });
    b.addEventListener('keydown', (e) => {
      if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); addCard(); }
    });
  });
  const r = document.getElementById('assistRefresh');
  if (r) r.onclick = () => { assistVariant = (assistVariant + 1) % 3; updateAssistPanel(); };
  const off = document.getElementById('assistOff');
  if (off) off.onclick = () => setAssistMode(false);
  const pe = document.getElementById('assistPersona');
  if (pe) pe.onclick = () => openPersonaDialog();
  refreshAssistHighlights();
}
function refreshAssistHighlights() {
  const map = {};
  assistSuggestions.forEach(s => { map[s.card.name] = assistKindLabel(s.kind); });
  document.querySelectorAll('#cardList .card').forEach(el => {
    const label = map[el.dataset.name] || '';
    el.classList.toggle('assist-suggest', !!label);
    if (label) el.setAttribute('data-assist-label', label);
    else el.removeAttribute('data-assist-label');
  });
}
function setAssistMode(on) {
  assistMode = !!on;
  assistVariant = 0;
  try { localStorage.setItem('cr_assist_mode', assistMode ? 'on' : 'off'); } catch(e) {}
  updateAssistPanel();
  render();
}

// =============================================================
//  デッキ嗜好プロフィール（MBTI＋2択）— アシストの方向付け(intentFit)に使う
//  ・6軸で正規化（-1〜+1）。MBTIで土台を作り、2択の答えで微調整して掛け合わせる。
//  ・「MBTIの情報」は外部APIでなく内蔵テーブルで性格→デッキ嗜好へ写像（後でAPI差し替え可）。
//  ・ログイン中はアカウントへ保存(CRAuth.saveDeckPersona)、未ログインはローカルに保持。
// =============================================================
// 軸の意味（左 -1 ／ 右 +1）
const PERSONA_AXES = [
  { key: 'weight',     left: '軽い',   right: '重い',     desc: 'コストの重さ' },
  { key: 'tempo',      left: 'じっくり', right: '高回転',   desc: '回転率' },
  { key: 'style',      left: '受け',   right: '攻め',     desc: '攻撃型/防御型' },
  { key: 'thrill',     left: '堅実',   right: '爽快',     desc: '爽快感' },
  { key: 'risk',       left: '安定',   right: '一発',     desc: 'リスク許容' },
  { key: 'complexity', left: 'シンプル', right: 'テクい',   desc: '操作の複雑さ' }
];
const PERSONA_AXIS_KEYS = PERSONA_AXES.map(a => a.key);
let personaCache = (() => { try { return JSON.parse(localStorage.getItem('cr_deck_persona') || 'null'); } catch (e) { return null; } })();

function emptyAxes() { const o = {}; PERSONA_AXIS_KEYS.forEach(k => o[k] = 0); return o; }
function clamp1(x) { return x < -1 ? -1 : x > 1 ? 1 : x; }
function addAxes(base, delta, w) {
  w = (w == null) ? 1 : w;
  const o = Object.assign({}, base);
  PERSONA_AXIS_KEYS.forEach(k => { if (delta && delta[k] != null) o[k] = (o[k] || 0) + delta[k] * w; });
  return o;
}
// MBTI 4軸 → デッキ嗜好の寄与（内蔵「MBTI情報」テーブル）
const MBTI_CONTRIB = {
  E: { style: 0.5, thrill: 0.4, tempo: 0.3 },   I: { style: -0.5, thrill: -0.3, weight: 0.2 },
  S: { complexity: -0.4, weight: -0.2, risk: -0.1 }, N: { complexity: 0.4, thrill: 0.2, risk: 0.2 },
  T: { style: 0.2, risk: -0.2, complexity: 0.2 },  F: { thrill: 0.4, style: -0.1, risk: 0.1 },
  J: { risk: -0.4, tempo: -0.1, complexity: 0.1 }, P: { risk: 0.4, tempo: 0.3, thrill: 0.2 }
};
function normalizeMbti(s) {
  const v = String(s || '').toUpperCase().replace(/[^EISNTFJP]/g, '');
  if (v.length !== 4) return '';
  if (!/^[EI][SN][TF][JP]$/.test(v)) return '';
  return v;
}
function mbtiToAxes(mbti) {
  const m = normalizeMbti(mbti);
  let ax = emptyAxes();
  if (!m) return ax;
  m.split('').forEach(letter => { ax = addAxes(ax, MBTI_CONTRIB[letter], 1); });
  return ax;
}
// 2択質問（クラロワの言葉で。MBTIという語は前面に出さない）。各選択肢が軸へ寄与。
const PERSONA_QUESTIONS = [
  { id: 'q_weight', q: 'デッキの主役はどっち？',
    a: { label: '軽くて手数で押す', d: { weight: -0.7, tempo: 0.5 } },
    b: { label: '重くて一撃が大きい', d: { weight: 0.7, tempo: -0.4 } } },
  { id: 'q_style', q: '試合の入り方は？',
    a: { label: '受けてから返す', d: { style: -0.7, risk: -0.3 } },
    b: { label: '橋前から圧をかける', d: { style: 0.7, thrill: 0.3 } } },
  { id: 'q_tempo', q: '回し方の好みは？',
    a: { label: '細かく速く回す', d: { tempo: 0.7, weight: -0.3 } },
    b: { label: 'エリクサーを溜めて構える', d: { tempo: -0.6, weight: 0.3 } } },
  { id: 'q_thrill', q: '勝つときの気持ちよさは？',
    a: { label: '一気に爽快に削りたい', d: { thrill: 0.7, risk: 0.3 } },
    b: { label: '堅実に確実に勝ちたい', d: { thrill: -0.6, risk: -0.3 } } },
  { id: 'q_risk', q: '勝負どころは？',
    a: { label: '安定択でじわじわ', d: { risk: -0.7, style: -0.2 } },
    b: { label: 'ハマれば一発逆転', d: { risk: 0.7, thrill: 0.3 } } },
  { id: 'q_complexity', q: '操作はどっちが好き？',
    a: { label: 'シンプルで分かりやすい', d: { complexity: -0.7 } },
    b: { label: '組み合わせて魅せる', d: { complexity: 0.7, thrill: 0.2 } } }
];
// MBTI土台 ＋ 2択の答え → 最終軸（-1〜+1にクランプ）
function computePersonaAxes(persona) {
  if (!persona) return null;
  let ax = mbtiToAxes(persona.mbti);
  const answers = persona.answers || {};
  PERSONA_QUESTIONS.forEach(qn => {
    const pick = answers[qn.id];
    if (pick === 'a') ax = addAxes(ax, qn.a.d, 1);
    else if (pick === 'b') ax = addAxes(ax, qn.b.d, 1);
  });
  const out = {}; PERSONA_AXIS_KEYS.forEach(k => out[k] = clamp1(ax[k] || 0));
  return out;
}
// 現在のpersona（ログイン中はアカウント優先、無ければローカル）
function getPersona() {
  if (window.CRAuth && CRAuth.getUser && CRAuth.getUser() && CRAuth.getDeckPersona) {
    const p = CRAuth.getDeckPersona();
    if (p) return p;
  }
  return personaCache;
}
function getPersonaAxes() { return computePersonaAxes(getPersona()); }
function personaIsSet() {
  const p = getPersona();
  return !!(p && (normalizeMbti(p.mbti) || (p.answers && Object.keys(p.answers).length)));
}
async function savePersona(persona) {
  personaCache = persona;
  try { localStorage.setItem('cr_deck_persona', JSON.stringify(persona)); } catch (e) {}
  if (window.CRAuth && CRAuth.getUser && CRAuth.getUser() && CRAuth.saveDeckPersona) {
    try { await CRAuth.saveDeckPersona(persona); } catch (e) {}
  }
}
// カード固有の軸ベクトル（カードデータ＋監修JSONから推定）
function personaCardVector(c) {
  const v = emptyAxes();
  const cost = c.cost || 0;
  v.weight = clamp1((cost - 3.5) / 2.5);            // 軽い(-) 〜 重い(+)
  v.tempo = cost <= 2 ? 0.7 : cost >= 5 ? -0.5 : 0; // 軽い札ほど高回転
  // 攻め/受け：勝ち筋・橋前・奇襲は攻め、建物・防衛・タンクは受け
  let style = 0;
  if (assistIsMainWincon(c) || assistIsSecondary(c)) style += 0.5;
  if (assistTagHas(c, 'bridgeSpam') || assistHas(c, ['奇襲','突撃','橋前'])) style += 0.4;
  if (c.type === 'building' || assistTagHas(c, 'defBuilding') || assistHas(c, ['防衛','タンク'])) style -= 0.6;
  v.style = clamp1(style);
  // 爽快感：チャンピオン・大型呪文・一撃・大量召喚・複製・全停止
  let thrill = 0;
  if (c.champion) thrill += 0.4;
  if (assistSpellSize(c) === 'big') thrill += 0.5;
  if (assistTagHas(c, 'dash') || assistHas(c, ['一撃','複製','全停止','大量召喚','超長射程'])) thrill += 0.3;
  if (c.cost <= 1) thrill -= 0.2;
  v.thrill = clamp1(thrill);
  // リスク：ガラスタンク/オールイン気味（高HP低DPS壁＋単体勝ち筋）や大型呪文all-in
  let risk = 0;
  if (assistIsMainWincon(c) && cost >= 6) risk += 0.4;
  if (assistTagHas(c, 'spellBait')) risk += 0.2;
  if (assistSpellSize(c) === 'big') risk += 0.3;
  if (c.type === 'building') risk -= 0.3;
  v.risk = clamp1(risk);
  // 複雑さ：チャンピオン・コンボ前提(partner)・攻城・透明など
  let cx = 0;
  const p = assistPotential(c);
  if (c.champion) cx += 0.4;
  if (p && p.partner) cx += 0.3;
  if (assistHas(c, ['攻城','透明','潜伏','超長射程'])) cx += 0.3;
  if (cost <= 2 && !c.champion) cx -= 0.2;
  v.complexity = clamp1(cx);
  return v;
}
// persona軸 × カード軸 の一致度（intentFit用の加点。最大～+30）
function personaCardFit(c, axes) {
  if (!axes) return 0;
  const v = personaCardVector(c);
  let dot = 0, wsum = 0;
  PERSONA_AXIS_KEYS.forEach(k => {
    const u = axes[k] || 0;
    dot += u * (v[k] || 0);
    wsum += Math.abs(u);
  });
  if (wsum < 0.001) return 0;
  return Math.round((dot / wsum) * 30); // -30〜+30
}
// persona要約文（アシストの状態表示用）
function personaSummary(axes) {
  if (!axes) return '';
  const parts = [];
  PERSONA_AXES.forEach(a => {
    const v = axes[a.key];
    if (v >= 0.34) parts.push(a.right);
    else if (v <= -0.34) parts.push(a.left);
  });
  return parts.slice(0, 3).join('・');
}

// ===== デッキ嗜好プロフィール 設定ダイアログ（MBTI入力＋2択） =====
let _personaDraft = null;
function openPersonaDialog() {
  const cur = getPersona() || {};
  _personaDraft = { mbti: normalizeMbti(cur.mbti) || '', answers: Object.assign({}, cur.answers || {}) };
  const ov = document.createElement('div');
  ov.className = 'swap-overlay persona-overlay';
  ov.innerHTML = '<div class="swap-box persona-box">'
    + '<div class="persona-title">デッキの好みを設定</div>'
    + '<div class="persona-sub">性格タイプ（MBTI）と、いくつかの2択から、あなた向けに候補を絞ります。未入力でもOK。</div>'
    + '<div class="persona-mbti">'
    + '<label class="persona-label">MBTI（任意）</label>'
    + '<input type="text" id="personaMbti" class="persona-input" maxlength="4" placeholder="例：INTJ" autocomplete="off" autocapitalize="characters" spellcheck="false" value="' + esc(_personaDraft.mbti) + '">'
    + '<div class="persona-mbti-hint" id="personaMbtiHint"></div>'
    + '</div>'
    + '<div class="persona-qs" id="personaQs"></div>'
    + '<div class="persona-actions">'
    + '<button class="btn btn-ghost" id="personaClear" type="button">クリア</button>'
    + '<button class="btn btn-ghost" id="personaCancel" type="button">閉じる</button>'
    + '<button class="btn" id="personaSave" type="button">保存</button>'
    + '</div>'
    + '</div>';
  document.body.appendChild(ov);
  ov.onclick = e => { if (e.target === ov) ov.remove(); };

  function renderQs() {
    const wrap = ov.querySelector('#personaQs');
    wrap.innerHTML = PERSONA_QUESTIONS.map(qn => {
      const sel = _personaDraft.answers[qn.id] || '';
      return '<div class="persona-q">'
        + '<div class="persona-q-text">' + esc(qn.q) + '</div>'
        + '<div class="persona-q-opts">'
        + '<button class="persona-opt' + (sel === 'a' ? ' on' : '') + '" type="button" data-q="' + esc(qn.id) + '" data-pick="a">' + esc(qn.a.label) + '</button>'
        + '<button class="persona-opt' + (sel === 'b' ? ' on' : '') + '" type="button" data-q="' + esc(qn.id) + '" data-pick="b">' + esc(qn.b.label) + '</button>'
        + '</div></div>';
    }).join('');
    wrap.querySelectorAll('.persona-opt').forEach(b => {
      b.onclick = () => {
        const q = b.getAttribute('data-q'), pick = b.getAttribute('data-pick');
        // 同じ選択を再タップで解除（中立に戻せる）
        if (_personaDraft.answers[q] === pick) delete _personaDraft.answers[q];
        else _personaDraft.answers[q] = pick;
        renderQs();
      };
    });
  }
  function updateMbtiHint() {
    const hint = ov.querySelector('#personaMbtiHint');
    if (!hint) return;
    const v = normalizeMbti(_personaDraft.mbti);
    if (!_personaDraft.mbti) hint.textContent = '空欄でも2択だけで設定できます。';
    else if (v) hint.textContent = '✓ ' + v + ' を反映します。';
    else hint.textContent = '4文字（E/I・S/N・T/F・J/P）で入力してください。';
  }
  const mbtiInput = ov.querySelector('#personaMbti');
  mbtiInput.addEventListener('input', () => {
    mbtiInput.value = mbtiInput.value.toUpperCase().replace(/[^EISNTFJP]/g, '').slice(0, 4);
    _personaDraft.mbti = mbtiInput.value;
    updateMbtiHint();
  });
  ov.querySelector('#personaClear').onclick = () => {
    _personaDraft = { mbti: '', answers: {} };
    mbtiInput.value = '';
    updateMbtiHint(); renderQs();
  };
  ov.querySelector('#personaCancel').onclick = () => ov.remove();
  ov.querySelector('#personaSave').onclick = async () => {
    const persona = { mbti: normalizeMbti(_personaDraft.mbti), answers: _personaDraft.answers, updatedAt: Date.now() };
    await savePersona(persona);
    ov.remove();
    showToast('好みを保存しました');
    updateAssistPanel();
  };
  updateMbtiHint();
  renderQs();
}

function render() {
  const filtered = getFiltered();
  document.getElementById('countInfo').innerHTML = filtered.length + ' / ' + CARDS.length + ' <span class="cw">枚</span>';
  const list = document.getElementById('cardList');
  list.innerHTML = '';
  filtered.forEach(c => {
    const inDeck = deck.some(d => d && d.name === c.name);
    const faved = isFav(c.name);
    const div = document.createElement('div');
    const assistHit = assistSuggestions.find(s => s.card.name === c.name);
    div.className = 'card' + (inDeck ? ' in-deck' : '') + (assistHit ? ' assist-suggest' : '');
    if (assistHit) div.setAttribute('data-assist-label', assistKindLabel(assistHit.kind));
    div.dataset.name = c.name;
    const tagClass = c.champion ? 'tag-champion' : c.hero ? 'tag-hero' : 'tag-' + c.type;
    const tagText = c.champion ? 'チャンピオン' : c.hero ? 'ヒーロー' : c.type === 'troop' ? 'ユニット' : c.type === 'spell' ? '呪文' : '建物';
    const heartSvg = `<svg width="20" height="19" viewBox="0 0 24 22" fill="none" xmlns="http://www.w3.org/2000/svg">
      <path class="heart-fill heart-stroke" d="M12 20.5C12 20.5 2 13.5 2 7C2 4.2 4.2 2 7 2C9 2 10.8 3.1 12 4.7C13.2 3.1 15 2 17 2C19.8 2 22 4.2 22 7C22 13.5 12 20.5 12 20.5Z" stroke-linejoin="round" stroke-linecap="round"/>
    </svg>`;
    // 進化タブなら進化後画像、英雄タブなら英雄画像を表示（無ければ通常画像）
    const cardImgSrc = (activeTypes.has('evolved') && c.imgEvolved) ? c.imgEvolved
                     : (activeTypes.has('hero') && c.imgHero) ? c.imgHero
                     : c.img;
    const imgHtml = cardImgSrc ? `<img class="card-img" src="${cardImgSrc}" alt="" loading="lazy">` : '';
    div.innerHTML = `
      ${imgHtml}
      <button class="fav-btn ${faved ? 'active' : ''}${justFaved === c.name ? ' pop' : ''}" title="${faved ? 'お気に入り解除' : 'お気に入り追加'}" onclick="toggleFav('${c.name}', event)">${heartSvg}</button>
      <div class="card-top">
        <div class="cost-pip pip-${Math.min(c.cost,9)}">${c.cost}</div>
        <div class="card-name">${c.name}</div>
      </div>
      <span class="type-tag ${tagClass}">${tagText}</span>
      <div class="card-bottom">
        <div class="card-role">${c.role}</div>
      </div>`;
    div.draggable = true;
    div.addEventListener('dragstart', e => {
      if (deck.some(d => d && d.name === c.name)) { e.preventDefault(); return; }
      dragSrcCard = c;
      dragSrcIdx = null;
      div.style.opacity = '0.4';
      e.dataTransfer.effectAllowed = 'move';
    });
    div.addEventListener('dragend', e => { div.style.opacity = ''; dragSrcCard = null; });
    div.onclick = () => { if (assistMode || isDragging || Date.now() < _suppressClickUntil) return; toggleDeck(c); }; // アシストON中はタップ追加しない（スクロールは可）。ドラッグ中／タッチタップ直後のclickも無視
    list.appendChild(div);
  });
  if (window.CRI18N) CRI18N.apply(); // 再描画後にUI全体を再翻訳（コスト/枚数など監視外の文言が日本語に戻るのを防ぐ）
  refreshAssistHighlights();
}

// ★デッキ変更時の軽量更新：カード一覧を作り直さず .in-deck クラスだけ切替＝連打・スクロール後タップでも軽い（全再構築＋CRI18N.applyを回避）。
function refreshInDeck() {
  const inset = new Set(deck.filter(Boolean).map(d => d.name));
  document.querySelectorAll('#cardList .card').forEach(el => {
    el.classList.toggle('in-deck', inset.has(el.dataset.name));
  });
  refreshAssistHighlights();
}


// ヒーロー配置ルール：idx1（スロット2）かidx2（スロット3）のみ
function championCanGoTo(slotIdx) { return slotIdx === 1 || slotIdx === 2; }

// ヒーローの優先配置先を返す（スロット2→スロット3の順）
function championTargetSlot() {
  if (deck[1] === null) return 1;
  if (deck[2] === null) return 2;
  return -1;
}

// 通常カードを入れる空きスロット。ルール上どこでも置けるので、番号が一番小さい空き枠から順に
function firstNormalEmpty() {
  for (let i = 0; i < 8; i++) if (deck[i] === null) return i;
  return -1;
}
// アシストから通常カードを足すときは、特別枠(1〜3)を温存して4〜8枠へ入れる
function firstAssistNormalEmpty() {
  for (let i = 3; i < 8; i++) if (deck[i] === null) return i;
  return -1;
}
function placeNormal(card) {
  const idx = firstNormalEmpty();
  if (idx === -1) { showToast('⚠ デッキは8枚まで'); return false; }
  deck[idx] = card; return true;
}

function placeAssistNormal(card) {
  let idx = firstAssistNormalEmpty();
  // 通常枠が埋まっている場合だけ最後の保険として特別枠も許可（8枚完成不能を避ける）
  if (idx === -1) idx = firstNormalEmpty();
  if (idx === -1) { showToast('⚠ デッキは8枚まで'); return false; }
  deck[idx] = card; return true;
}

function assistPlaceSpecial(card) {
  // チャンピオンはスロット2/3固定。枠が埋まっていれば既存の入れ替えUIへ。
  if (card.champion) { addToDeck(card); return true; }
  // 進化/ヒーローは専用枠が空いていればそこへ。埋まっているなら通常枠(4〜8)へ入れる。
  if (card.evolved && deck[0] === null) { deck[0] = card; renderDeck(); refreshInDeck(); return true; }
  if (card.hero && deck[1] === null) { deck[1] = card; renderDeck(); refreshInDeck(); return true; }
  if ((card.evolved || card.hero) && deck[2] === null) { deck[2] = card; renderDeck(); refreshInDeck(); return true; }
  return false;
}

function addAssistToDeck(card) {
  if (!card || deck.some(d => d && d.name === card.name)) return;
  if (card.evolved || card.hero || card.champion) {
    if (assistPlaceSpecial(card)) return;
  }
  if (!placeAssistNormal(card)) return;
  renderDeck(); refreshInDeck();
}

function addToDeck(card) {
  if (deck.some(d => d && d.name === card.name)) return;
  if (card.champion) {
    // チャンピオンは最大2枚（スロット2・3）。2枚埋まっていればどちらと交換するか聞く
    const champIdxs = deck.map((d, i) => (d && d.champion) ? i : -1).filter(i => i >= 0);
    if (champIdxs.length >= 2) { openImageReplaceDialog(card, champIdxs, { relocateOld: false }); return; }
    const idx = championTargetSlot();
    if (idx === -1) { openImageReplaceDialog(card, [1, 2], { relocateOld: true }); return; } // 2・3枠どちらと
    deck[idx] = card; renderDeck(); refreshInDeck();
    return;
  }
  // 進化タブ→進化枠(1枚目)か3枚目 / ヒーロータブ→ヒーロー枠(2枚目)か3枚目
  if (activeTypes.has('evolved') && card.evolved) {
    if (deck[0] === null) deck[0] = card;
    else if (deck[2] === null) deck[2] = card;
    else { openImageReplaceDialog(card, [0, 2], { relocateOld: true, mode: 'evolved' }); return; }
    renderDeck(); refreshInDeck(); return;
  }
  if (activeTypes.has('hero') && card.hero) {
    if (deck[1] === null) deck[1] = card;
    else if (deck[2] === null) deck[2] = card;
    else { openImageReplaceDialog(card, [1, 2], { relocateOld: true, mode: 'hero' }); return; }
    renderDeck(); refreshInDeck(); return;
  }
  if (!placeNormal(card)) return;
  renderDeck(); refreshInDeck();
}

// 入れ替えダイアログ（チャンピオン/進化/ヒーロー共通・画像で視認性高め）
// idxs: 候補スロット, opts.relocateOld: 押し出したカードを通常枠へ
function openImageReplaceDialog(card, idxs, opts) {
  opts = opts || {};
  // 入れるカードの画像（進化/ヒーロー文脈ならその姿）
  const newImgSrc = ctxCardImg(card, opts.mode);
  const cardImg = newImgSrc ? `<img src="${newImgSrc}" alt="">` : '';
  const doReplace = (i) => {
    const old = deck[i];
    deck[i] = card;
    if (opts.relocateOld && old) {
      if (old.champion) {
        // チャンピオンは必ずスロット2/3。押し出されたら空いている方の枠へ。無ければデッキから出す（通常枠には絶対入れない）
        const other = [1, 2].find(s => s !== i && deck[s] === null);
        if (other !== undefined) deck[other] = old;
      } else {
        placeNormal(old);
      }
    }
    ov.remove(); renderDeck(); refreshInDeck();
  };
  const ov = document.createElement('div');
  ov.className = 'swap-overlay';

  if (idxs.length === 1) {
    // 「いま → これに」：今のカードを薄く、入れるカードを強調。入れるカードをタップで確定
    const old = deck[idxs[0]];
    ov.innerHTML = `<div class="swap-box">
      <div class="swap-title">入れ替える？</div>
      <div class="swap-fromto">
        <div class="ft-card dim"><div class="ft-cap">いま</div>${old && old.img ? `<img src="${old.img}" alt="">` : ''}<div class="ft-name">${old ? old.name : ''}</div></div>
        <div class="ft-arrow">➜</div>
        <div class="ft-card hot" id="ftConfirm"><div class="ft-cap">これに</div>${cardImg}<div class="ft-name">${card.name}</div></div>
      </div>
    </div>`;
    ov.querySelector('#ftConfirm').onclick = () => doReplace(idxs[0]);
  } else {
    // 「どっちと入れ替える？」：中央に入れる対象、両脇に候補。候補カードをタップで確定
    const sideHtml = (i) => {
      const d = deck[i];
      const img = slotCardImg(d, i); // その枠に表示される姿（進化/ヒーロー）
      return `<div class="swap-opt" data-idx="${i}">
        ${img ? `<img src="${img}" alt="">` : ''}
        <div class="swap-opt-name">${d ? d.name : ''}</div>
        <div class="swap-opt-slot">${T('slot.n', { n: i + 1 })}</div>
      </div>`;
    };
    ov.innerHTML = `<div class="swap-box">
      <div class="swap-title">${T('swap.withWhich', { name: TR(card.name) })}</div>
      <div class="swap-choose">
        ${sideHtml(idxs[0])}
        <div class="swap-center"><div class="ft-cap">入れる</div>${cardImg}<div class="ft-name">${card.name}</div></div>
        ${sideHtml(idxs[1])}
      </div>
    </div>`;
    ov.querySelectorAll('.swap-opt').forEach(o => { o.onclick = () => doReplace(+o.dataset.idx); });
  }
  ov.onclick = (e) => { if (e.target === ov) ov.remove(); }; // ポップアップ外タップでキャンセル
  document.body.appendChild(ov);
}

// チャンピオン追加時、スロット2・3が非チャンピオンで埋まっている場合の入れ替えダイアログ
function openChampSwapDialog(card) {
  const ov = document.createElement('div');
  ov.className = 'swap-overlay';
  const opts = [1, 2].map(i => {
    const d = deck[i];
    return `<div class="swap-opt" data-idx="${i}">
      ${d.img ? `<img src="${d.img}" alt="">` : ''}
      <div class="swap-opt-name">${d.name}</div>
      <div class="swap-opt-slot">${T('slot.n', { n: i + 1 })}</div>
    </div>`;
  }).join('');
  ov.innerHTML = `<div class="swap-box">
    <div class="swap-title">${T('swap.withWhich', { name: TR(card.name) })}</div>
    <div class="swap-options">${opts}</div>
    <button class="btn btn-ghost swap-cancel">キャンセル</button>
  </div>`;
  ov.onclick = e => { if (e.target === ov) ov.remove(); };
  ov.querySelector('.swap-cancel').onclick = () => ov.remove();
  ov.querySelectorAll('.swap-opt').forEach(o => {
    o.onclick = () => {
      const i = +o.dataset.idx;
      const displaced = deck[i];
      deck[i] = card;
      const empty = deck.findIndex(d => d === null);
      if (empty >= 0) {
        deck[empty] = displaced;
        showToast(T('toast.movedToSlot', { name: TR(displaced.name), n: empty + 1 }));
      } else {
        showToast(T('toast.removedFromDeck', { name: TR(displaced.name) }));
      }
      ov.remove();
      renderDeck(); refreshInDeck();
    };
  });
  document.body.appendChild(ov);
}

function removeFromDeck(card) {
  const idx = deck.findIndex(d => d && d.name === card.name);
  if (idx >= 0) { deck[idx] = null; renderDeck(); refreshInDeck(); }
}


let dragSrcIdx = null;
let dragSrcCard = null;
let _lastPreviewIdx = null; // ドラッグ中の仮表示：同じ枠での重複再計算を防ぐ

function onDragStart(e) {
  dragSrcIdx = parseInt(this.dataset.idx);
  dragSrcCard = null;
  this.classList.add('dragging');
  e.dataTransfer.effectAllowed = 'move';
}

function onDragEnd(e) {
  document.querySelectorAll('.slot').forEach(s => {
    s.classList.remove('dragging', 'drag-over');
  });
  _lastPreviewIdx = null;
  clearPreviewStats();
  // カード選択ゾーン上でドロップ終了→キャンセル
  if (dragSrcIdx !== null) {
    const el = document.elementFromPoint(e.clientX, e.clientY);
    if (el && el.closest('#cardList')) {
      deck[dragSrcIdx] = null;
      dragSrcIdx = null;
      renderDeck(); refreshInDeck();
    }
  }
  dragSrcIdx = null;
  dragSrcCard = null;
}

// ドラッグ中、その枠に置いた/入れ替えた場合の仮デッキを作る
function hypotheticalDeck(destIdx) {
  const hyp = deck.slice();
  if (dragSrcCard) {
    if (!deck.some(d => d && d.name === dragSrcCard.name)) hyp[destIdx] = dragSrcCard;
  } else if (dragSrcIdx !== null && dragSrcIdx !== destIdx) {
    const t = hyp[destIdx]; hyp[destIdx] = hyp[dragSrcIdx]; hyp[dragSrcIdx] = t;
  }
  return hyp;
}

function onDragOver(e) {
  e.preventDefault();
  e.dataTransfer.dropEffect = 'move';
  this.classList.add('drag-over');
  const destIdx = parseInt(this.dataset.idx);
  if ((dragSrcCard || dragSrcIdx !== null) && _lastPreviewIdx !== destIdx) {
    _lastPreviewIdx = destIdx;
    previewStats(hypotheticalDeck(destIdx)); // 平均コストを仮表示（同じ枠の上では再計算しない）
  }
}

function onDragLeave(e) {
  // 子要素（カード画像・名前等）へカーソルが移っただけでも発火する→無視（“チラつき”の原因だった）
  if (e.relatedTarget && this.contains(e.relatedTarget)) return;
  this.classList.remove('drag-over');
  if (_lastPreviewIdx === parseInt(this.dataset.idx)) { _lastPreviewIdx = null; clearPreviewStats(); }
}

function onDrop(e) {
  e.preventDefault();
  this.classList.remove('drag-over');
  _lastPreviewIdx = null;
  clearPreviewStats();
  const destIdx = parseInt(this.dataset.idx);
  if (dragSrcCard) {
    const c = dragSrcCard;
    dragSrcCard = null;
    if (deck.some(d => d && d.name === c.name)) { showToast('⚠ すでに追加済み'); return; }
    if (c.champion && deck.filter(d => d && d.champion).length >= 2) { showToast('⚠ チャンピオンは2枚まで'); return; }
    if (c.champion && !championCanGoTo(destIdx)) { showToast('⚠ チャンピオンはスロット2か3のみ'); return; }
    deck[destIdx] = c;
    renderDeck(); refreshInDeck();
  } else if (dragSrcIdx !== null && dragSrcIdx !== destIdx) {
    const movingCard = deck[dragSrcIdx];
    const targetCard = deck[destIdx];
    // チャンピオンは2・3スロット以外に移動不可
    if (movingCard && movingCard.champion && !championCanGoTo(destIdx)) { showToast('⚠ チャンピオンはスロット2か3のみ'); return; }
    if (targetCard && targetCard.champion && !championCanGoTo(dragSrcIdx)) { showToast('⚠ チャンピオンはスロット2か3のみ'); return; }
    const tmp = deck[destIdx];
    deck[destIdx] = deck[dragSrcIdx];
    deck[dragSrcIdx] = tmp;
    dragSrcIdx = null;
    renderDeck(); refreshInDeck();
  }
}


// タッチD&D（モバイル・デッキスロット専用）
let touchSrcIdx = null;
let touchClone = null;
let touchSrcCard = null;
let touchOffsetX = 0;
let touchOffsetY = 0;

function createGhost(imgSrc, name, cost, size) {
  const ghost = document.createElement('div');
  ghost.style.cssText = [
    'position:fixed',
    'pointer-events:none',
    'z-index:9999',
    'width:' + size + 'px',
    'height:' + size + 'px',
    'border-radius:10px',
    'background:#1e2230',
    'border:2px solid rgba(58,142,240,0.8)',
    'display:flex',
    'flex-direction:column',
    'align-items:center',
    'justify-content:center',
    'gap:4px',
    'opacity:0.85',
    'box-shadow:0 4px 20px rgba(0,0,0,0.5)',
  ].join(';');
  if (imgSrc) {
    const img = document.createElement('img');
    img.src = imgSrc;
    img.style.cssText = 'width:60%;height:60%;object-fit:contain;';
    ghost.appendChild(img);
  }
  const label = document.createElement('div');
  label.textContent = name;
  label.style.cssText = 'font-size:9px;color:#e8eaf0;text-align:center;padding:0 4px;line-height:1.2;font-family:sans-serif;';
  ghost.appendChild(label);
  document.body.appendChild(ghost);
  return ghost;
}

function moveGhost(ghost, x, y) {
  const w = ghost.offsetWidth;
  const h = ghost.offsetHeight;
  ghost.style.left = (x - w/2) + 'px';
  ghost.style.top  = (y - h/2 - 20) + 'px';
}

let longPressTimer = null;
let touchStartX = 0;
let touchStartY = 0;
const LONG_PRESS_MS = 150;      // 長押し＝ドラッグ開始。短い接触はタップ＝即追加（少し短め＝ドラッグに入りやすく）
const LONG_PRESS_DECK_MS = 150; // デッキゾーンも同じ（30だと普通のタップがドラッグ扱いでもっさりしてた）
const DRAG_THRESHOLD = 10;
let isDragging = false;
let _touchMoved = false, _suppressClickUntil = 0;

function startDrag(srcCard, srcIdx, imgSrc, name, cost, x, y, srcEl) {
  isDragging = true;
  touchSrcCard = srcCard;
  touchSrcIdx = srcIdx;
  // ゴーストを作成して body に追加してから位置を設定
  touchClone = createGhost(imgSrc, name, cost, 90);
  // 次フレームで offsetWidth が確定してから位置設定
  requestAnimationFrame(() => {
    moveGhost(touchClone, x, y);
  });
  if (srcEl) srcEl.style.opacity = '0.3';
}

function cancelDrag() {
  clearTimeout(longPressTimer);
  longPressTimer = null;
  isDragging = false;
  clearPreviewStats();
  touchSrcCard = null;
  touchSrcIdx = null;
  if (touchClone) { touchClone.remove(); touchClone = null; }
  document.querySelectorAll('.slot').forEach(s => { s.classList.remove('drag-over'); s.style.opacity = ''; });
  document.querySelectorAll('.card').forEach(c => { c.style.opacity = ''; });
}

function initTouchDnD() {
  // カード選択ゾーン
  document.getElementById('cardList').addEventListener('touchstart', e => {
    if (isDragging || longPressTimer || e.touches.length > 1) return; // ドラッグ中/長押し待ち/2本指は無視（2枚目タップでバグらない）
    if (assistMode) return; // アシストON中はドラッグ無効（スクロール優先・タップ追加もしない）
    if (e.target.closest('.fav-btn')) return; // ハートタップ時はドラッグしない
    const card = e.target.closest('.card');
    if (!card || card.classList.contains('in-deck')) return;
    const cardName = card.querySelector('.card-name').textContent.trim();
    const srcCard = CARDS.find(c => c.name === cardName);
    if (!srcCard) return;
    const t = e.touches[0];
    touchStartX = t.clientX; touchStartY = t.clientY; _touchMoved = false;
    if (document.documentElement.classList.contains('nopin')) return; // ピンOFF=ドラッグ無効（タップは有効・_touchMovedリセット後にreturn＝スクロール後のタップ取りこぼし無し）
    longPressTimer = setTimeout(() => {
      startDrag(srcCard, null, srcCard.img, srcCard.name, srcCard.cost, touchStartX, touchStartY, card);
    }, LONG_PRESS_MS);
  }, {passive:true});

  // ★タップ＝即追加：動かさず離した瞬間に入れる（ネイティブclick頼みをやめる＝スクロール後の素早いタップも100%反応）
  document.getElementById('cardList').addEventListener('touchend', e => {
    if (longPressTimer) { clearTimeout(longPressTimer); longPressTimer = null; }
    if (isDragging || _touchMoved) return;            // ドラッグ/スクロールはタップにしない
    if (assistMode) return;                            // アシストON中はタップ追加しない（スクロールは効く）
    if (e.target.closest('.fav-btn')) return;
    const cardEl = e.target.closest('.card');
    if (!cardEl || cardEl.classList.contains('in-deck')) return;
    const c = CARDS.find(x => x.name === cardEl.dataset.name);
    if (!c) return;
    _suppressClickUntil = Date.now() + 600;           // 直後のネイティブclick二重発火を抑止
    toggleDeck(c);
  }, { passive: true });

  // デッキスロット
  document.getElementById('deckSlots').addEventListener('touchstart', e => {
    if (isDragging || longPressTimer || e.touches.length > 1) return; // ドラッグ中/長押し待ち/2本指は無視
    const slot = e.target.closest('.slot.filled');
    if (!slot) return;
    const idx = parseInt(slot.dataset.idx);
    const c = deck[idx];
    if (!c) return;
    const t = e.touches[0];
    touchStartX = t.clientX; touchStartY = t.clientY; _touchMoved = false;
    if (document.documentElement.classList.contains('nopin')) return; // ピンOFF=ドラッグ無効（タップで外すは有効・_touchMovedリセット後にreturn）
    longPressTimer = setTimeout(() => {
      startDrag(null, idx, c.img, c.name, c.cost, touchStartX, touchStartY, slot);
    }, LONG_PRESS_DECK_MS);
  }, {passive:true});

  // ★デッキスロットのタップ＝即外す（カード選択と同じ。clickに頼らないので もっさり しない）
  document.getElementById('deckSlots').addEventListener('touchend', e => {
    if (longPressTimer) { clearTimeout(longPressTimer); longPressTimer = null; }
    if (isDragging || _touchMoved) return;
    if (e.target.closest('.mode-toggle-btn')) return; // 進化↔英雄の切替ボタンは外さない
    const slot = e.target.closest('.slot.filled');
    if (!slot) return;
    const idx = parseInt(slot.dataset.idx);
    const c = deck[idx];
    if (!c) return;
    _suppressClickUntil = Date.now() + 600;
    removeFromDeck(c);
  }, { passive: true });

  document.addEventListener('touchmove', e => {
    const t = e.touches[0];
    // 長押し前に大きく動いたらキャンセル（スクロール優先）
    if (!isDragging) {
      const dx = Math.abs(t.clientX - touchStartX);
      const dy = Math.abs(t.clientY - touchStartY);
      if (dx > DRAG_THRESHOLD || dy > DRAG_THRESHOLD) {
        _touchMoved = true;
        clearTimeout(longPressTimer);
        longPressTimer = null;
      }
      return;
    }
    e.preventDefault();
    if (touchClone) moveGhost(touchClone, t.clientX, t.clientY);
    spangleAt(t.clientX, t.clientY); // ¥500: ドラッグ軌跡（スパンコール）
    document.querySelectorAll('.slot').forEach(s => s.classList.remove('drag-over'));
    const el = document.elementFromPoint(t.clientX, t.clientY);
    const target = el && el.closest('.slot');
    const onCardListNow = el && el.closest('#cardList');
    if (target) {
      target.classList.add('drag-over');
      // 置く/入れ替えた場合の平均コストを仮表示
      const destIdx = parseInt(target.dataset.idx);
      const hyp = deck.slice();
      if (touchSrcCard) { if (!deck.some(d => d && d.name === touchSrcCard.name)) hyp[destIdx] = touchSrcCard; }
      else if (touchSrcIdx !== null && touchSrcIdx !== destIdx) { const tmp = hyp[destIdx]; hyp[destIdx] = hyp[touchSrcIdx]; hyp[touchSrcIdx] = tmp; }
      previewStats(hyp);
    } else if (onCardListNow && touchSrcIdx !== null) {
      // デッキから抜く場合の平均コストを仮表示
      const hyp = deck.slice(); hyp[touchSrcIdx] = null; previewStats(hyp);
    } else {
      clearPreviewStats();
    }
  }, {passive:false});

  document.addEventListener('touchend', e => {
    clearTimeout(longPressTimer);
    longPressTimer = null;
    if (!isDragging) return;
    clearPreviewStats();
    const t = e.changedTouches[0];
    if (touchClone) { touchClone.remove(); touchClone = null; }
    document.querySelectorAll('.slot').forEach(s => { s.classList.remove('drag-over'); s.style.opacity = ''; });
    document.querySelectorAll('.card').forEach(c => { c.style.opacity = ''; });
    const el = document.elementFromPoint(t.clientX, t.clientY);
    const target = el && el.closest('.slot');
    const onCardList = el && el.closest('#cardList');
    if (touchSrcIdx !== null && onCardList) {
      // デッキ→カード選択ゾーンへドロップ＝キャンセル（削除）
      deck[touchSrcIdx] = null;
      renderDeck(); refreshInDeck();
    } else if (target) {
      const destIdx = parseInt(target.dataset.idx);
      if (touchSrcCard) {
        const c = touchSrcCard;
        if (deck.some(d => d && d.name === c.name)) { showToast('⚠ すでに追加済み'); }
        else if (c.champion && deck.filter(d => d && d.champion).length >= 2) { showToast('⚠ チャンピオンは2枚まで'); }
        else if (c.champion && !championCanGoTo(destIdx)) { showToast('⚠ チャンピオンはスロット2か3のみ'); }
        else { deck[destIdx] = c; renderDeck(); refreshInDeck(); }
      } else if (touchSrcIdx !== null && destIdx !== touchSrcIdx) {
        const movingCard = deck[touchSrcIdx];
        const targetCard = deck[destIdx];
        if (movingCard && movingCard.champion && !championCanGoTo(destIdx)) { showToast('⚠ チャンピオンはスロット2か3のみ'); }
        else if (targetCard && targetCard.champion && !championCanGoTo(touchSrcIdx)) { showToast('⚠ チャンピオンはスロット2か3のみ'); }
        else {
          const tmp = deck[destIdx];
          deck[destIdx] = deck[touchSrcIdx];
          deck[touchSrcIdx] = tmp;
          renderDeck(); refreshInDeck();
        }
      } else if (touchSrcIdx !== null && destIdx === touchSrcIdx && !_touchMoved) {
        // 同じスロットで動かさず離した＝タップ＝外す（遅いタップ救済）
        _suppressClickUntil = Date.now() + 600;
        removeFromDeck(deck[touchSrcIdx]);
      }
    } else if (touchSrcCard && !_touchMoved) {
      // 長押しで掴んだが動かさず離した＝タップ＝そのまま追加（遅いタップ救済）
      _suppressClickUntil = Date.now() + 600;
      toggleDeck(touchSrcCard);
    }
    isDragging = false;
    touchSrcCard = null;
    touchSrcIdx = null;
  }, {passive:true});

  document.addEventListener('touchcancel', cancelDrag, {passive:true});
}
function toggleSlot2Mode(name, e) {
  e.stopPropagation();
  slot2Mode[name] = (slot2Mode[name] === 'hero') ? 'evolved' : 'hero';
  renderDeck();
}

function toggleDeck(card) { addToDeck(card); }


// スロットタイプ定義（0始まり、コの字順）
// idx0=進化枠, idx1=ヒーロー/チャンピオン枠, idx2=ワイルド枠, idx3-7=通常
// スロット2（idx=2）の選択モード（両方対応カードのみ有効）
let slot2Mode = {}; // key: カード名, value: "evolved" | "hero"

const SLOT_TYPE = ['evolved','hero','wild','normal','normal','normal','normal','normal'];

// どのスロットにも全カード置ける（制限なし）
function canPlace(card, slotIdx) { return true; }

// スロット位置とカード種類でモードを決定
function slotMode(card, slotIdx) {
  const st = SLOT_TYPE[slotIdx];
  if (st === 'evolved' && card.evolved) return 'evolved';
  if (st === 'hero'    && card.hero)    return 'hero';
  if (st === 'wild') {
    // 両方対応カードはslot2Modeの選択状態を参照（デフォルトはevolved）
    if (card.evolved && card.hero) return slot2Mode[card.name] || 'evolved';
    if (card.evolved) return 'evolved';
    if (card.hero)    return 'hero';
  }
  return 'normal';
}

// そのスロットに置いた時に表示される画像（進化/ヒーロー/通常）
function slotCardImg(card, idx) {
  if (!card) return '';
  const mode = slotMode(card, idx);
  return mode === 'evolved' && card.imgEvolved ? card.imgEvolved
       : mode === 'hero' && card.imgHero ? card.imgHero
       : card.img;
}
// 文脈（進化/ヒーロー）で入れるカードの画像
function ctxCardImg(card, mode) {
  if (mode === 'evolved' && card.imgEvolved) return card.imgEvolved;
  if (mode === 'hero' && card.imgHero) return card.imgHero;
  return card.img;
}

const COST_COLORS = {1:'#4caf50',2:'#26c6a0',3:'#3a8ef0',4:'#e8a020',5:'#8b5cf6',6:'#e05050',7:'#c0781a',8:'#888',9:'#9090d0'};

function renderDeck() {
  const slots = document.getElementById('deckSlots');
  slots.innerHTML = '';
  for (let i = 0; i < 8; i++) {
    const div = document.createElement('div');
    const c = deck[i];
    const st = SLOT_TYPE[i];
    const slotClass = st === 'evolved' ? ' slot-evolved' : st === 'hero' ? ' slot-hero' : st === 'wild' ? ' slot-wild' : '';
    if (c) {
      const mode = slotMode(c, i);
      const modeClass = mode === 'evolved' ? ' slot-evolved' : mode === 'hero' ? ' slot-hero' : '';
      div.className = 'slot filled' + modeClass + (isFav(c.name) ? ' fav' : ''); // お気に入りは .fav（¥2,000特典でリムライト）
      if (isFav(c.name)) div.style.setProperty('--favDelay', '-' + (performance.now() / 1000 % 3.6).toFixed(2) + 's'); // 共通時計に同期＝再生成しても途切れない
      div.title = 'クリックで外す';
      div.draggable = true;
      div.dataset.idx = i;
      const modeBadge = mode === 'evolved' ? '<span class="slot-badge evolved-badge">進化</span>'
                      : mode === 'hero'    ? '<span class="slot-badge hero-badge">英雄</span>' : '';
      const slotImgSrc = mode === 'evolved' && c.imgEvolved ? c.imgEvolved
                       : mode === 'hero'    && c.imgHero    ? c.imgHero
                       : c.img;
      const slotImg = slotImgSrc
        ? `<div class="slot-img-wrap"><img class="slot-img" src="${slotImgSrc}" alt="" loading="lazy"></div>`
        : `<div class="slot-img-wrap"></div>`;
      // wildスロット（idx=2）かつ進化・ヒーロー両方対応カード→切り替えボタン
      const showToggle = SLOT_TYPE[i] === 'wild' && c.evolved && c.hero;
      const toggleBtn = showToggle ? `<button class="mode-toggle-btn" onclick="toggleSlot2Mode('${c.name}', event)">
        ${mode === 'evolved' ? '⚡進化' : '👑英雄'}
      </button>` : '';
      div.innerHTML = `${slotImg}${modeBadge}${toggleBtn}`;
      div.onclick = () => { if (isDragging || Date.now() < _suppressClickUntil) return; removeFromDeck(c); };
      div.addEventListener('dragstart', onDragStart);
      div.addEventListener('dragend',   onDragEnd);
      div.addEventListener('dragover',  onDragOver);
      div.addEventListener('dragleave', onDragLeave);
      div.addEventListener('drop',      onDrop);
    } else {
      div.className = 'slot' + slotClass;
      div.dataset.idx = i;
      const emptyContent = st === 'evolved' ? '<span class="slot-empty-icon diamond-evolved" title="進化"></span>'
                         : st === 'hero'    ? '<span class="slot-empty-icon diamond-hero" title="ヒーロー/チャンピオン"></span>'
                         : st === 'wild'    ? '<span class="slot-empty-icon diamond-wild" title="進化/ヒーロー"></span>'
                         : '<span class="slot-empty-text">+</span>';
      div.innerHTML = `<div class="slot-empty-center">${emptyContent}</div>`;
      div.addEventListener('dragover',  onDragOver);
      div.addEventListener('dragleave', onDragLeave);
      div.addEventListener('drop',      onDrop);
    }
    slots.appendChild(div);
  }

  updateActionButtons();
  showDeckStats(deck, true); // 実デッキの統計を表示（入れ替え時は平均コストをロール）
  updateDeckGlow(deck.filter(Boolean).length); // ¥500特典：枚数に応じてデッキ枠のグロー（8枚でシャキーン）
  // ¥2,000特典：お気に入りが「増えた」瞬間だけ、デッキ内のお気に入り同士を一瞬つなぐ
  const favNow = deck.filter(c => c && isFav(c.name)).map(c => c.name);
  document.body.classList.toggle('has-fav', favNow.length > 0); // お気に入りがある時だけリム回転（安定化）
  const favAdded = favNow.filter(n => !(window._favPrev || []).includes(n));
  window._favPrev = favNow;
  if (favAdded.length) requestAnimationFrame(() => { popFavSlots(favAdded); flashFavLinks(); }); // 入れた瞬間：ふわん＋お気に入り結線
  updateAssistPanel();
}

// ===== ¥500/¥2,000 演出ヘルパー =====
function fxTrailOn() {
  return document.body.classList.contains('perk-drop') && window.CRAuth && (!CRAuth.getFxTrail || CRAuth.getFxTrail());
}
let _spLast = 0;
const SPANGLE_COLORS = ['linear-gradient(135deg,#fff,#ffd76a)', 'linear-gradient(135deg,#bff7ec,#26c6a0)', 'linear-gradient(135deg,#ffd6f0,#e0709f)', 'linear-gradient(135deg,#fff,#a9c7ff)'];
function spawnSpangle(x, y) {
  const s = document.createElement('div');
  s.className = 'spangle';
  s.style.left = x + 'px'; s.style.top = y + 'px';
  s.style.setProperty('--dx', ((Math.random() * 2 - 1) * 20).toFixed(0) + 'px');
  s.style.setProperty('--dy', ((Math.random() * 2 - 1) * 14 + 12).toFixed(0) + 'px');
  s.style.setProperty('--rot', ((Math.random() * 2 - 1) * 220).toFixed(0) + 'deg');
  s.style.background = SPANGLE_COLORS[(Math.random() * SPANGLE_COLORS.length) | 0];
  document.body.appendChild(s);
  setTimeout(() => s.remove(), 680);
}
function spangleAt(x, y) {
  if (!fxTrailOn()) return;
  const now = performance.now();
  if (now - _spLast < 32) return;        // 連発しすぎ防止
  _spLast = now;
  spawnSpangle(x, y); if (Math.random() < 0.55) spawnSpangle(x, y);
}
// デスクトップ(ネイティブDnD)：ドラッグ中の dragover 座標で軌跡を出す
document.addEventListener('dragover', e => {
  if (dragSrcCard || dragSrcIdx !== null) spangleAt(e.clientX, e.clientY);
}, true);

// ¥2,000特典：デッキ内のお気に入りカード同士を細い金線で一瞬だけ結ぶ
function flashFavLinks() {
  if (!document.body.classList.contains('perk-bottle')) return;
  const favs = Array.from(document.querySelectorAll('#deckSlots .slot.filled.fav'));
  if (favs.length < 2) return;
  const pts = favs.map(el => { const r = el.getBoundingClientRect(); return [r.left + r.width / 2, r.top + r.height / 2]; });
  // 直線でなく、midを垂直方向へ少し持ち上げた緩い曲線でつなぐ＝平面的でなく奥行き(3D)を感じる空気感
  let d = 'M ' + pts[0][0].toFixed(1) + ' ' + pts[0][1].toFixed(1);
  for (let i = 1; i < pts.length; i++) {
    const x0 = pts[i - 1][0], y0 = pts[i - 1][1], x1 = pts[i][0], y1 = pts[i][1];
    const dx = x1 - x0, dy = y1 - y0, len = Math.hypot(dx, dy) || 1;
    const off = Math.min(46, len * 0.22);
    const cx = (x0 + x1) / 2 - dy / len * off, cy = (y0 + y1) / 2 + dx / len * off;
    d += ' Q ' + cx.toFixed(1) + ' ' + cy.toFixed(1) + ' ' + x1.toFixed(1) + ' ' + y1.toFixed(1);
  }
  const NS = 'http://www.w3.org/2000/svg';
  const svg = document.createElementNS(NS, 'svg');
  svg.setAttribute('class', 'fav-link-overlay');
  const path = document.createElementNS(NS, 'path');
  path.setAttribute('d', d);
  svg.appendChild(path);
  document.body.appendChild(svg);
  const total = path.getTotalLength ? path.getTotalLength() : 600;
  path.style.strokeDasharray = total; path.style.strokeDashoffset = total;
  path.animate(
    [{ strokeDashoffset: total, opacity: 0 }, { strokeDashoffset: 0, opacity: 0.9, offset: 0.5 }, { strokeDashoffset: 0, opacity: 0 }],
    { duration: 1100, easing: 'ease-out' }
  );
  setTimeout(() => svg.remove(), 1150);
}

// ¥2,000特典：お気に入りを入れた瞬間、そのスロットを「ふわん」と一瞬ふくらませる
function popFavSlots(names) {
  if (!document.body.classList.contains('perk-bottle')) return;
  names.forEach(name => {
    deck.forEach((c, i) => {
      if (c && c.name === name) {
        const el = document.querySelector('#deckSlots .slot[data-idx="' + i + '"]');
        if (!el) return;
        el.classList.remove('fav-pop'); void el.offsetWidth; el.classList.add('fav-pop');
        setTimeout(() => el.classList.remove('fav-pop'), 600);
        // さりげなくハートがふわっと舞う
        const r = el.getBoundingClientRect();
        const h = document.createElement('div'); h.className = 'fav-heart';
        h.innerHTML = '<svg viewBox="0 0 24 24" width="18" height="18" fill="none" stroke="#ffb3d1" stroke-width="1.6" stroke-linejoin="round"><path d="M12 20.3S3.6 15.3 3.6 9.2C3.6 6.5 5.5 5 7.6 5c1.7 0 3.2 1 4.4 2.7C13.2 6 14.7 5 16.4 5c2.1 0 4 1.5 4 4.2 0 6.1-8.4 11.1-8.4 11.1Z"/></svg>'; // 中空のふんわりハート
        h.style.left = (r.left + r.width / 2) + 'px'; h.style.top = (r.top + r.height * 0.42) + 'px';
        document.body.appendChild(h); setTimeout(() => h.remove(), 880);
      }
    });
  });
}

// ¥500特典：カード枚数(0-8)に応じてデッキ枠のグローを段階的に設定（perk-dropユーザーのみ）。
// box-shadowをJSで枚数比例にし、CSSのtransitionで増減がなめらかに（8→7はフェード）。8枚で .deck-full=シャキーン＋継続。
function updateDeckGlow(n) {
  const el = document.getElementById('deckSlots');
  if (!el) return;
  const perk = document.body.classList.contains('perk-drop');
  el.classList.toggle('deck-full', perk && n === 8); // 8枚到達時だけ付与＝再描画(入れ替え)では再発火しない
  if (!perk || n === 0) { el.style.boxShadow = ''; return; }
  const t = n / 8;                                   // 0.125 .. 1（徐々に強く）
  const blur = Math.round(8 + 26 * t);
  const spread = (1 + 2 * t).toFixed(1);
  const ai = (0.15 + 0.5 * t).toFixed(2);            // inset（内側の縁）の濃さ
  const ao = (0.12 + 0.45 * t).toFixed(2);           // outer（外側）の濃さ
  const wash = (0.10 + 0.28 * t).toFixed(2);         // 内側を満たすティール＝背景の色づき（8枚で最大→減ると1秒でフェード）
  el.style.boxShadow =
    'inset 0 0 ' + blur + 'px ' + spread + 'px rgba(38,198,160,' + ai + '), ' +
    'inset 0 0 ' + Math.round(blur * 3.2) + 'px 0 rgba(38,198,160,' + wash + '), ' +
    '0 0 ' + Math.round(blur * 0.9) + 'px 2px rgba(38,198,160,' + ao + ')';
}

// 平均コストを「現在の表示値→目標値」へ0.01刻みでロール（ドゥルル）。
// animate=false なら即時セット（プレビュー・初期描画用）。
let _avgRollRAF = null;
function setAvgVal(to, animate) {
  const el = document.getElementById('avgVal');
  if (!el) return;
  const from = parseFloat(el.textContent);
  const target = (to == null) ? null : +to;
  if (_avgRollRAF) { cancelAnimationFrame(_avgRollRAF); _avgRollRAF = null; el.classList.remove('rolling'); }
  // アニメ不可／無効／対象が数値でない／差が0.01未満なら即時
  if (!animate || target == null || !isFinite(from) || !isFinite(target) || Math.abs(target - from) < 0.005) {
    el.textContent = (target == null) ? '—' : target.toFixed(2);
    el.style.color = '';
    return;
  }
  const up = target > from;                          // 上昇=赤 / 下降=青（ホバーの色分けと統一）
  el.style.color = up ? '#e05050' : '#3a8ef0';
  const steps = Math.abs(target - from) / 0.01;
  const dur = Math.max(170, Math.min(650, steps * 14)); // 0.01あたり~14ms、短すぎ/長すぎ防止
  const start = performance.now();
  el.classList.remove('rolling'); void el.offsetWidth; el.classList.add('rolling'); // バウンス再生
  function frame(now) {
    const t = Math.min(1, (now - start) / dur);
    const eased = 1 - Math.pow(1 - t, 2);            // easeOut
    let v = from + (target - from) * eased;
    v = Math.round(v / 0.01) * 0.01;                 // 0.01刻みに量子化＝ドゥルル
    el.textContent = v.toFixed(2);
    if (t < 1) { _avgRollRAF = requestAnimationFrame(frame); }
    else { el.textContent = target.toFixed(2); el.style.color = ''; el.classList.remove('rolling'); _avgRollRAF = null; }
  }
  _avgRollRAF = requestAnimationFrame(frame);
}

// 平均コスト・枚数・コストバーを指定の8枠配列から表示（プレビューにも使う）
let _previewActive = false;
function showDeckStats(arr, animate) {
  const filled = arr.filter(d => d);
  document.getElementById('deckCount').textContent = filled.length + '/8';
  if (filled.length > 0) {
    const avg = (filled.reduce((s, c) => s + (c.cost || 0), 0) / filled.length);
    setAvgVal(avg, animate);
    document.getElementById('avgSub').textContent = ''; // 「（〇枚）」は廃止＝ドラッグ時の±コスト表示と2段化してガクつくため（2026-06-25）
  } else {
    setAvgVal(null, animate);
    document.getElementById('avgSub').textContent = '';
  }
  const bar = document.getElementById('costBar');
  bar.innerHTML = '';
  if (filled.length > 0) {
    const counts = {};
    filled.forEach(c => counts[c.cost] = (counts[c.cost] || 0) + 1);
    Object.entries(counts).sort((a, b) => +a[0] - +b[0]).forEach(([cost, cnt]) => {
      const seg = document.createElement('div');
      seg.className = 'bar-seg'; seg.style.flex = cnt;
      seg.style.background = COST_COLORS[cost] || '#888';
      seg.title = cost + 'コスト × ' + cnt;
      bar.appendChild(seg);
    });
  }
}
// 自作の増減アイコン（ブランド配色・上昇=赤/下降=青の塗り三角）
const TREND_UP_SVG   = '<svg viewBox="0 0 16 16" width="14" height="14" aria-hidden="true"><path d="M8 2.5 L14.5 13 L1.5 13 Z" fill="currentColor"/></svg>';
const TREND_DOWN_SVG = '<svg viewBox="0 0 16 16" width="14" height="14" aria-hidden="true"><path d="M8 13.5 L1.5 3 L14.5 3 Z" fill="currentColor"/></svg>';
function avgOf(arr) { const f = arr.filter(d => d); return f.length ? f.reduce((s, c) => s + (c.cost || 0), 0) / f.length : 0; }

// ドラッグ中の平均コスト等を仮の構成でプレビュー / 解除で実デッキに戻す
function previewStats(hypArr) {
  const before = avgOf(deck), after = avgOf(hypArr);
  _previewActive = true;
  showDeckStats(hypArr);
  const header = document.querySelector('.deck-header');
  const trend = document.getElementById('avgTrend');
  const val = document.getElementById('avgVal');
  header && header.classList.add('previewing');
  const diff = +(after - before).toFixed(2);
  if (diff > 0) {        // コスト上昇＝赤
    val.style.color = '#e05050';
    trend.style.color = '#e05050';
    trend.innerHTML = TREND_UP_SVG + '<span class="avg-diff">+' + diff.toFixed(2) + '</span>';
  } else if (diff < 0) { // コスト下降＝青
    val.style.color = '#3a8ef0';
    trend.style.color = '#3a8ef0';
    trend.innerHTML = TREND_DOWN_SVG + '<span class="avg-diff">' + diff.toFixed(2) + '</span>';
  } else {               // 変化なし
    val.style.color = '';
    trend.innerHTML = '';
  }
}
function clearPreviewStats() {
  if (!_previewActive) return;
  _previewActive = false;
  showDeckStats(deck);
  const val = document.getElementById('avgVal');
  if (val) val.style.color = '';
  const trend = document.getElementById('avgTrend');
  if (trend) trend.innerHTML = '';
  document.querySelector('.deck-header')?.classList.remove('previewing');
}

// ── 「📋 コピー」: 公式クラロワのデッキリンク(link.clashroyale.com/deck)をクリップボードへ。
//    card-ids.json（dataブランチ・slug→公式数値ID。GASの dumpCardIds が出力）を読んで生成する。
//    まだ card-ids.json が無い／IDが揃わない時はデッキのテキストにフォールバック（壊れない）。
let CARD_IDS = {};
fetch(dataFreshUrl('https://raw.githubusercontent.com/rea-fi-lia/clash-royale-deck/data/card-ids.json'), { cache: 'no-store' })
  .then(r => r.ok ? r.json() : null)
  .then(j => { if (j && j.ids) CARD_IDS = j.ids; })
  .catch(() => {});

// baseカード画像のファイル名 = RoyaleAPIスラッグ（card-ids.json / GASのSLUG2JP と一致）
function cardSlug(card) {
  if (!card || !card.img) return '';
  return card.img.split('/').pop().replace(/\.png.*$/i, '').replace(/-ev1$|-hero$/i, '');
}

// 8枚そろっていて全IDが揃えば公式デッキリンクを返す（足りなければ null）
function clashDeckLink() {
  const cards = deck.filter(Boolean);
  if (cards.length < 8) return null;
  const ids = cards.map(c => CARD_IDS[cardSlug(c)]);
  if (ids.some(id => !id)) return null;
  // ★ゲーム内のデッキ共有と同形式（clashroyale://copyDeck）。これでないとクラロワ内「貼り付け」ボタンが反応しない。
  //   slots=0×8（進化はデッキ順で自動反映）／tt=159000000（デフォルトのタワー兵）。id（共有者タグ）は付けない。
  const l = (document.documentElement.lang || 'en').toLowerCase();
  const CRLOC = { ja:'jp', en:'en', ko:'kr', 'zh-cn':'cn', 'zh-tw':'tw', de:'de', es:'es', fr:'fr', it:'it', nl:'nl', 'pt-br':'pt', ru:'ru', tr:'tr', ar:'ar', th:'th', id:'id', vi:'vi', fa:'fa' };
  const loc = CRLOC[l] || 'en';
  return 'https://link.clashroyale.com/' + loc + '?clashroyale://copyDeck?deck=' + ids.join(';')
    + '&slots=0;0;0;0;0;0;0;0&tt=159000000';
}

function deckAsText() {
  return deck.filter(Boolean).map(c => TR(c.name)).join(', ');
}

async function copyDeckForClash() {
  const link = clashDeckLink();
  const text = link || deckAsText();
  if (!text) { showToast('まずデッキを8枚そろえてね'); return; }
  let ok = true;
  try {
    await navigator.clipboard.writeText(text);
  } catch (e) {
    const ta = document.createElement('textarea');
    ta.value = text; ta.style.position = 'fixed'; ta.style.opacity = '0';
    document.body.appendChild(ta); ta.focus(); ta.select();
    try { ok = document.execCommand('copy'); } catch (e2) { ok = false; }
    ta.remove();
  }
  if (!ok) { showToast('コピーできませんでした'); return; }
  if (link) openClashDeckPopup(link);
  else showToast('✅ デッキをコピー（8枚そろうとクラロワで開けます）');
}

// ★ゲームからペースト：8枚未満の時のボタン。クリップボードのデッキリンクをID逆引きで読み込み→保存スロットを聞く
let _idToCard = null;
function buildIdToCard() {
  _idToCard = {};
  Object.keys(CARD_IDS).forEach(slug => { const card = CARDS.find(c => cardSlug(c) === slug); if (card) _idToCard[String(CARD_IDS[slug])] = card; });
}
async function pasteFromGame() {
  if (!CARD_IDS || !Object.keys(CARD_IDS).length) { showToast('カード情報を読み込み中。少し待ってもう一度'); return; }
  let text = '';
  try { text = await navigator.clipboard.readText(); } catch (e) { text = ''; } // クリップボードを自動確認（貼り付け不要）
  const m = String(text).match(/copyDeck\?deck=([0-9;]+)/);     // ゲーム内コピーの公式形式のみ受理
  const ids = m ? m[1].split(';').filter(Boolean) : [];
  if (ids.length !== 8) { showToast(TR('ゲーム内でデッキのリンクを発行してください。')); return; } // クリップボードに公式デッキリンクが無ければ案内のみ
  if (!_idToCard) buildIdToCard();
  const cards = ids.map(id => _idToCard[String(id)]);
  if (cards.some(c => !c)) { showToast(TR('ゲーム内でデッキのリンクを発行してください。')); return; }
  if (window.CRDeckBridge) window.CRDeckBridge.setDeck(cards);
  else { deck = cards.slice(0, 8); renderDeck(); refreshInDeck(); }
  showToast(TR('✅ デッキを読み込みました'));   // 読み込み成功＝即フィードバック（無言で保存ダイアログだけ出さない）
  try { openSlotSaveDialog(); } catch (e) {}   // ★読み込んだデッキをどのスロットに保存するか聞く
}
// 8枚そろってる→ゲームにコピー／未満→ゲームからペースト
function onCopyOrPaste() {
  if (deck.filter(Boolean).length >= 8) copyDeckForClash();
  else pasteFromGame();
}

// コピー後のポップアップ：「クラロワで開く」＝リンクへ遷移してクラロワが開く。外タップでキャンセル（既存ダイアログと同作法）。
function openClashDeckPopup(link) {
  const name = (window.CRAuth && CRAuth.getDisplayName && CRAuth.getDisplayName()) || '';
  const title = name ? T('copy.copied', { name }) : T('copy.copiedGuest');
  const ov = document.createElement('div');
  ov.className = 'swap-overlay';
  ov.innerHTML = `<div class="swap-box">
    <div class="swap-title">${title}</div>
    <div class="swap-options clash-open-row">
      <a class="btn btn-primary clash-open-btn" rel="noopener">${T('copy.openCR')}</a>
    </div>
    <div class="clash-open-hint">${T('copy.openHint')}</div>
  </div>`;
  const a = ov.querySelector('.clash-open-btn');
  a.href = link;
  // ★押下で閉じない＝クラロワが再ログイン待ち等で開かなかった場合、起動後にもう一度タップできる（外タップで閉じる）。
  ov.onclick = e => { if (e.target === ov) ov.remove(); };
  document.body.appendChild(ov);
}

// 下部ボタンの活性状態を更新
function updateActionButtons() {
  const n = deck.filter(Boolean).length;
  const copyTx = document.querySelector('#copyDeckBtn .da-copy-tx');
  const copyBtnEl = document.getElementById('copyDeckBtn');
  const _isJa = TR('ゲームにコピー') === 'ゲームにコピー'; // 未翻訳=日本語なら2段に分割
  if (copyTx) {
    if (n >= 8) copyTx.innerHTML = _isJa ? '<span class="ln">ゲームに</span><span class="ln">コピー</span>' : TR('ゲームにコピー');
    else        copyTx.innerHTML = _isJa ? '<span class="ln">ゲームから</span><span class="ln">ペースト</span>' : TR('ゲームからペースト'); // 8枚=コピー/未満=ペースト
  }
  if (copyBtnEl) {
    copyBtnEl.title = (n >= 8) ? TR('ゲームにコピー') : TR('ゲームからデッキをペースト');
    copyBtnEl.classList.toggle('is-paste', n < 8); // ペースト時はコピーマークを避けて右へ
  }
  try { localStorage.setItem('cr_workdeck', deck.map(c => c ? c.name : '').join(',')); } catch (e) {} // デッキ復帰用に常時保存
  try { updateSlotLoadBtn(); } catch (e) {} // デッキ変更に応じてSLOTの共有マーク/グローを反映
  const saveBtn = document.getElementById('saveBtn');
  const analyzeBtn = document.getElementById('analyzeBtn');
  if (saveBtn) saveBtn.disabled = false;              // 0枚でも保存OK（空スロットとして保存できる）
  if (analyzeBtn) {
    analyzeBtn.setAttribute('aria-disabled', n < 8 ? 'true' : 'false'); // 8枚で活性
    // ★診断ページへデッキ＋形態（n/e/h×8）を渡す
    if (n === 8) {
      const names = deck.map(c => c.name).join(',');
      const fs = deck.map((c, i) => { const m = slotMode(c, i); return m === 'evolved' ? 'e' : m === 'hero' ? 'h' : 'n'; }).join('');
      analyzeBtn.href = 'strategy.html?deck=' + encodeURIComponent(names) + '&f=' + fs;
    } else {
      analyzeBtn.href = 'strategy.html';
    }
  }
  const cta = document.getElementById('emptyDeckCta'); // 空(0枚)の時だけ「人気デッキから作る」を表示
  if (cta) cta.classList.toggle('show', n === 0);
}

// デッキ保存（5スロット・クラウド）。未ログインならログインを促す
async function openSlotSaveDialog() {
  const filled = deck.filter(Boolean);
  if (!window.CRAuth) { showToast('ログイン機能の読み込み中です'); return; }
  if (!CRAuth.getUser()) {
    if (CRAuth.hasSession && CRAuth.hasSession()) { showToast('ログイン確認中です。少し待ってからもう一度'); return; } // ラグ中は未ログイン扱いにしない
    showToast('保存にはログインが必要です'); CRAuth.signIn(); return;
  }

  let slots = [];
  try { slots = await CRAuth.getSlots(); } catch (e) { showToast('スロットの取得に失敗しました'); return; }

  let selected = currentSlot || null; // 編集中スロットを初期選択
  const ov = document.createElement('div');
  ov.className = 'slot-pop';
  const chips = [1,2,3,4,5].map(i => {
    const s = slots.find(x => x.slot === i);
    const sub = s ? T('cards.n', { n: (s.slots||[]).length }) : '空き';
    const isCur = currentSlot === i;
    const isSel = selected === i;
    return `<div class="slot-chip ${s?'':'empty'}${isCur?' current':''}${isSel?' selected':''}" data-slot="${i}">
      ${isCur ? '<span class="cur-badge">編集中</span>' : ''}
      <span class="num">${i}</span><span class="nm">${sub}</span>
    </div>`;
  }).join('');
  ov.innerHTML = `<div class="slot-pop-box">
    <div class="slot-pop-title">保存するスロットを選んで「保存」<span class="t-num"> (${filled.length})</span></div>
    <div class="slot-grid">${chips}</div>
    <button class="btn btn-primary" id="slotSaveConfirm" style="width:100%;margin-top:4px"${selected?'':' disabled'}>保存</button>
  </div>`;
  ov.onclick = (e) => { if (e.target === ov) ov.remove(); }; // 外側タップでキャンセル
  const confirmBtn = ov.querySelector('#slotSaveConfirm');
  ov.querySelectorAll('.slot-chip').forEach(o => {
    o.onclick = () => {
      selected = +o.dataset.slot;
      ov.querySelectorAll('.slot-chip').forEach(c => c.classList.toggle('selected', +c.dataset.slot === selected));
      confirmBtn.disabled = false;
    };
  });
  confirmBtn.onclick = async () => {
    if (!selected) { showToast('スロットを選んでください'); return; }
    const slot = selected;
    ov.remove();
    try {
      await CRAuth.saveDeckToSlot(slot, 'スロット' + slot, filled);
      currentSlot = slot; _loadedSig = _deckSig(); updateSlotLoadBtn();
      openShareDialog(deck.slice(), 'スロット' + slot);
    } catch (e) { showToast('保存に失敗しました'); }
  };
  document.body.appendChild(ov);
}

// ===== 保存直後のSNS共有 =====
// 共有プレビューをページ内で描画するためのグレード定義（Worker /ogimg の GRADES と同じ見た目）
const REPLICA_GRADES = {
  free:    { b:'rgba(255,255,255,0.12)', g:'',                         l:'',                lb:'',        lf:'' },
  drop:    { b:'#26c6a0', g:'0 0 16px rgba(38,198,160,.6)',  l:'SUPPORTER',        lb:'#26c6a0', lf:'#06231c' },
  bottle:  { b:'#1fc7c7', g:'0 0 16px rgba(31,199,199,.6)',  l:'SUPPORTER',        lb:'#1fc7c7', lf:'#06231c' },
  pump:    { b:'#2e8fe0', g:'0 0 18px rgba(46,143,224,.6)',  l:'BIG SUPPORTER',    lb:'#2e8fe0', lf:'#04141f' },
  drum:    { b:'#5a6cf0', g:'0 0 18px rgba(90,108,240,.6)',  l:'BIG SUPPORTER',    lb:'#5a6cf0', lf:'#fff' },
  tank:    { b:'#8b5cf6', g:'0 0 20px rgba(139,92,246,.6)',  l:'SUPER SUPPORTER',  lb:'#8b5cf6', lf:'#fff' },
  pool:    { b:'#c054d4', g:'0 0 20px rgba(192,84,212,.6)',  l:'SUPER SUPPORTER',  lb:'#c054d4', lf:'#fff' },
  factory: { b:'#d4537e', g:'0 0 22px rgba(212,83,126,.6)',  l:'MEGA SUPPORTER',   lb:'#d4537e', lf:'#fff' },
  dam:     { b:'#e8a020', g:'0 0 24px rgba(232,160,32,.65)', l:'MEGA SUPPORTER',   lb:'#e8a020', lf:'#1a1208' },
  spring:  { b:'#ff7a2f', g:'0 0 26px rgba(255,122,47,.7)',  l:'LEGEND SUPPORTER', lb:'#ff7a2f', lf:'#1a1208' }
};
function shareReplica(deckArr, gradeKey, by) {
  const G = REPLICA_GRADES[gradeKey] || REPLICA_GRADES.free;
  const filled = (deckArr || []).filter(Boolean);
  const avg = filled.length ? (filled.reduce((s, c) => s + (c.cost || 0), 0) / filled.length).toFixed(1) : '';
  const esc = s => String(s).replace(/[<>&"]/g, c => ({ '<':'&lt;','>':'&gt;','&':'&amp;','"':'&quot;' }[c]));
  let cards = '';
  for (let i = 0; i < 8; i++) {
    const c = deckArr[i];
    if (!c) { cards += '<div class="rep-card"></div>'; continue; }
    const pip = COST_COLORS[Math.min(c.cost, 9)] || '#888';
    cards += '<div class="rep-card"><img src="' + slotCardImg(c, i) + '" alt=""><span class="rep-pip" style="background:' + pip + '">' + c.cost + '</span></div>';
  }
  return '<div class="share-rep" style="border-color:' + G.b + ';' + (G.g ? 'box-shadow:inset ' + G.g + ';' : '') + '">'
    + '<div class="rep-top"><div><div class="rep-h1">CR DECK BUILDERS</div><div class="rep-h2">クラロワデッキ作成・診断ツール</div></div>'
    + (G.l ? '<div class="rep-label" style="background:' + G.lb + ';color:' + G.lf + '">' + G.l + '</div>' : '') + '</div>'
    + '<div class="rep-by">' + (by ? 'share by ' + esc(by) : '') + '</div>'
    + '<div class="rep-cards">' + cards + '</div>'
    + '<div class="rep-bottom"><span>' + (avg ? 'AVG ELIXIR ' + avg : '') + '</span><span>crdeckbuilders.com</span></div>'
    + '</div>';
}
function buildDeckShareUrl(deckArr) {
  let names = (deckArr || []).map(c => c ? c.name : '');
  while (names.length && names[names.length - 1] === '') names.pop();
  const base = location.origin + location.pathname; // 例: https://crdeckbuilders.com/index.html
  return base + '?deck=' + encodeURIComponent(names.join(','));
}
function openShareDialog(deckArr, deckName, notSaved) {
  // SNS共有は8枚そろっているときだけ表示（揃ってなければ保存通知のみ）
  if ((deckArr || []).filter(Boolean).length < 8) { showToast('✅ 保存しました'); return; }
  // 共有リンクは Cloudflare Worker の /share（SNSにデッキ画像が展開される）。グレードはログイン中のtier。
  // 共有リンクは短くするため、カードを英字スラッグ(hog-rider等)で渡す（日本語名のURLエンコードは巨大化するため）。
  // Worker側(/share・/ogimg)でスラッグ→日本語に戻す。旧リンク（日本語名）も引き続き動く。
  const slugOf = c => { const m = ((c && c.img) || '').match(/cards\/([a-z0-9-]+)\./); return m ? m[1] : ''; };
  const slugs = (deckArr || []).slice(0, 8).map(c => (c ? slugOf(c) : ''));
  while (slugs.length && slugs[slugs.length - 1] === '') slugs.pop();
  // 【封印中】寄付tierによる共有グレード枠/SUPPORTERラベルは廃止（Supercellポリシー準拠）。
  // ポイント制（rea-fi-liaポイント）実装時に活動グレードで復活予定。コードは消さないこと。
  // const grade = (window.CRAuth && CRAuth.getProfile && CRAuth.getProfile() && CRAuth.getProfile().tier) || 'free';
  const grade = 'free';
  const url = 'https://crdeckbuilders.com/share?deck=' + slugs.join(',') + '&g=' + grade; // スラッグなのでURLエンコード不要＝短い
  const xText = T('share.xText');
  const lineText = T('share.lineText');
  // プレビューは実際のSNS共有画像（Worker /ogimg）をそのまま表示する（SNSに出るのと同じ見た目＝グレード枠込み）
  const ogimgBase = 'https://crdeckbuilders.com/ogimg?deck=' + slugs.join(',') + '&g=' + grade;
  const ogimgFree = 'https://crdeckbuilders.com/ogimg?deck=' + slugs.join(',') + '&g=free'; // 枠無し＝最も軽い。プレビューが出ない時の最終フォールバック

  // ログイン中なら「share by 〇〇」を入れるか選べる（画像にクリエイター名が載る）
  const byName = (window.CRAuth && CRAuth.getDisplayName && CRAuth.getDisplayName()) || '';
  const byNameEsc = byName.replace(/[<>&"]/g, c => ({ '<':'&lt;','>':'&gt;','&':'&amp;','"':'&quot;' }[c]));

  const ov = document.createElement('div');
  ov.className = 'slot-pop';
  const loggedIn = !!(window.CRAuth && CRAuth.getUser && CRAuth.getUser());
  const hasTag = !!(window.CRAuth && CRAuth.getCrTag && CRAuth.getCrTag());
  ov.innerHTML = `<div class="slot-pop-box">
    <div class="slot-pop-title">${(loggedIn && !notSaved) ? '✅ 保存しました！このデッキを共有する？' : 'このデッキを共有する？'}</div>
    <div class="share-deck" id="shRep"></div>
    <div class="share-btns">
      ${byName ? `<button class="share-b sns-byname active" id="shByBtn" aria-pressed="true">${T('share.byBtn', { name: byNameEsc })}${(loggedIn && !hasTag) ? `<span class="byname-idhint">${TR('💡 クラロワID登録でユーザー名を表示')}</span>` : ''}</button>` : ''}
      ${!loggedIn ? `<button class="share-b sns-login" id="shLogin">🔑 ${TR('ログインで保存・名前が入れられます')}</button>` : ''}
      <a class="share-b sns-x" id="shX" target="_blank" rel="noopener">𝕏 でポスト</a>
      <a class="share-b sns-line" id="shLine" target="_blank" rel="noopener">LINEで送る</a>
      <button class="share-b sns-copy" id="shCopy">🔗 リンクをコピー</button>
    </div>
    <div class="share-hint">${byName ? '名前ボタンが光ってると、画像にあなたの名前が入ります。' : ''}閉じるときはこの外側をタップ</div>
  </div>`;
  ov.onclick = (e) => { if (e.target === ov) { ov.remove(); document.body.classList.remove('share-open'); } }; // 外側タップで閉じる

  const shByBtn = ov.querySelector('#shByBtn');
  const byOn = () => shByBtn && shByBtn.classList.contains('active');
  const byParam = () => (byName && byOn() ? '&by=' + encodeURIComponent(byName) : '');
  const finalUrl = () => url + byParam();
  const syncLinks = () => {
    const u = finalUrl();
    ov.querySelector('#shX').href = 'https://twitter.com/intent/tweet?text=' + encodeURIComponent(xText) + '&url=' + encodeURIComponent(u);
    ov.querySelector('#shLine').href = 'https://line.me/R/msg/text/?' + encodeURIComponent(lineText + '\n' + u);
    const rep = ov.querySelector('#shRep'); if (rep) rep.innerHTML = shareReplica(deckArr, grade, (byName && byOn()) ? byName : ''); // プレビューはページ内描画＝軽量・即時・by安定
    if (window.CRI18N) CRI18N.applyTo(ov); // 再同期で作り直した部分（プレビュー等）を再翻訳
  };
  if (shByBtn) shByBtn.onclick = () => {
    shByBtn.classList.toggle('active');
    shByBtn.setAttribute('aria-pressed', shByBtn.classList.contains('active') ? 'true' : 'false');
    syncLinks();
  };
  syncLinks();
  const copyBtn = ov.querySelector('#shCopy');
  copyBtn.onclick = () => { navigator.clipboard.writeText(finalUrl()).then(() => { copyBtn.textContent = TR('✓ コピーしました'); }); };
  const loginBtn = ov.querySelector('#shLogin');
  if (loginBtn) loginBtn.onclick = () => { _pendingLoginShare = true; ov.remove(); document.body.classList.remove('share-open'); if (window.CRAuth) CRAuth.signIn(); };
  document.body.appendChild(ov);
  document.body.classList.add('share-open'); // プレビュー中はデッキ側アニメを停止
}

// ===== 保存デッキの呼び出し（横スクロールで 1〜5 を選ぶ） =====
let currentSlot = null;
let _pendingLoginShare = false; // 未ログイン共有→ログイン直後に「空きスロット保存＋共有」を一度だけ走らせるフラグ
const SHARE_SVG = '<svg width="17" height="17" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><circle cx="18" cy="5" r="2.6"/><circle cx="6" cy="12" r="2.6"/><circle cx="18" cy="19" r="2.6"/><path d="m8.3 13.4 7.4 4.3M15.7 6.3 8.3 10.6"/></svg>';
let _loadedSig = null; // 最後にスロットから読込/保存したデッキ署名。これと違えば「変更あり」
function _deckSig() { return deck.map(c => c ? c.name : '').join(','); }
// 共有マーク＋グロー条件：8枚そろっていて、未ログイン or 読込スロットから変更あり（＝共有したい新デッキ）
function _isShareState() {
  if (deck.filter(Boolean).length < 8) return false;
  const loggedIn = !!(window.CRAuth && CRAuth.getUser && CRAuth.getUser());
  if (!loggedIn) return true;
  return _deckSig() !== _loadedSig;
}
function updateSlotLoadBtn() {
  const el = document.getElementById('slotLoadNum');
  const btn = document.getElementById('slotLoadBtn');
  if (!el) return;
  const loggedIn = window.CRAuth && CRAuth.getUser && CRAuth.getUser();
  const share = _isShareState();
  el.innerHTML = (share || !loggedIn) ? SHARE_SVG : (currentSlot ? currentSlot : '—'); // 共有状態 or 未ログイン＝共有マーク
  if (btn) btn.classList.toggle('share-glow', !!share); // 8枚＋変更時だけさりげなく光る
}

// 空きスロットをタップ＝現デッキをその番号に保存（→保存後の共有へ）
async function saveDeckToSlotNum(slot) {
  const filled = deck.filter(Boolean);
  if (!filled.length) { showToast('デッキが空です'); return; }
  if (!window.CRAuth || !CRAuth.getUser()) { showToast('ログインが必要です'); return; }
  try {
    await CRAuth.saveDeckToSlot(slot, 'スロット' + slot, filled);
    currentSlot = slot; _loadedSig = _deckSig(); updateSlotLoadBtn();
    openShareDialog(deck.slice(), 'スロット' + slot);
  } catch (e) { showToast('保存に失敗しました'); }
}
async function openSlotLoadPicker() {
  if (!window.CRAuth) { showToast('ログイン機能の読み込み中です'); return; }
  if (!CRAuth.getUser()) {
    if (CRAuth.hasSession && CRAuth.hasSession()) { showToast('ログイン確認中です。少し待ってからもう一度'); return; }
    showToast('呼び出しにはログインが必要です'); CRAuth.signIn(); return;
  }
  let slots = [];
  try { slots = await CRAuth.getSlots(); } catch (e) { showToast('スロットの取得に失敗しました'); return; }
  if (!slots.length) { showToast('保存済みデッキがありません'); return; }

  const ov = document.createElement('div');
  ov.className = 'slot-pop';
  const chips = [1,2,3,4,5].map(i => {
    const s = slots.find(x => x.slot === i);
    const nm = s ? T('cards.n', { n: (s.slots || []).length }) : '空き'; // デッキ名ではなく枚数表示
    const cur = currentSlot === i ? ' current' : '';
    return `<div class="slot-chip ${s?'':'empty'}${cur}" data-slot="${i}" ${s?'':'data-empty="1"'}>
      <span class="num">${i}</span><span class="nm">${nm}</span>
    </div>`;
  }).join('');
  ov.innerHTML = `<div class="slot-pop-box">
    <div class="slot-pop-title">呼び出すデッキを選ぶ（横スクロール）</div>
    <div class="slot-strip">${chips}</div>
    <button class="btn btn-ghost" style="width:100%;margin-top:6px" id="slotLoadCancel">閉じる</button>
  </div>`;
  ov.querySelector('#slotLoadCancel').onclick = () => ov.remove();
  ov.onclick = (e) => { if (e.target === ov) ov.remove(); };
  ov.querySelectorAll('.slot-chip').forEach(o => {
    o.onclick = () => {
      if (o.dataset.empty) { showToast('このスロットは空です'); return; }
      const slot = +o.dataset.slot;
      const s = slots.find(x => x.slot === slot);
      if (!s) return;
      const cards = (s.slots || []).map(n => CARDS.find(c => c.name === n) || null);
      _loadedSig = cards.map(c => c ? c.name : '').join(',');
      window.CRDeckBridge ? window.CRDeckBridge.setDeck(cards) : null;
      currentSlot = slot; updateSlotLoadBtn();
      ov.remove();
    };
  });
  document.body.appendChild(ov);
  // 現在スロットを中央にスクロール
  const cur = ov.querySelector('.slot-chip.current');
  if (cur) cur.scrollIntoView({ inline: 'center', block: 'nearest' });
}

// ===== SLOT操作：タップでバー表示／スロットタップで移動／左右スライドでも移動 =====
function initSlotScrub() {
  const btn = document.getElementById('slotLoadBtn');
  if (!btn) return;
  let segSlots = [], bar = null, hint = null;
  let barOpen = false, isDown = false, dragging = false;
  let baseIdx = 0, lastIdx = -1, startX = 0, downX = 0, lastPointerX = 0, stepPx = 38;

  function loadSlotByIndex(idx) {
    const s = segSlots[idx]; if (!s) return;
    if (!s.empty) { // 保存済み＝ロード（プレビュー）。空き＝選択だけ動かす（デッキは変えない＝消えない）
      const cards = (s.slots || []).map(name => CARDS.find(c => c.name === name) || null);
      _loadedSig = cards.map(c => c ? c.name : '').join(','); // 読込デッキ＝この署名の間は「変更なし」
      if (window.CRDeckBridge) window.CRDeckBridge.setDeck(cards, { silent: true });
    }
    currentSlot = s.slot; updateSlotLoadBtn();
    bar && bar.querySelectorAll('.scrub-seg').forEach((e, i) => e.classList.toggle('on', i === idx));
    lastIdx = idx;
  }

  function closeBar() {
    barOpen = false; dragging = false;
    if (bar) { bar.remove(); bar = null; }
    if (hint) { hint.remove(); hint = null; }
  }

  async function openBar() {
    if (!window.CRAuth) { showToast('ログイン機能の読み込み中です'); return; }
    // 共有状態（8枚＝共有の意思）＝スロットを出すとスクラブで未保存デッキが消えるので、バーは出さず即SNS共有へ
    if (_isShareState()) { openShareDialog(deck.slice(), '', true); return; }
    if (!CRAuth.getUser()) {
      if (CRAuth.hasSession && CRAuth.hasSession()) { showToast('ログイン確認中です。少し待ってからもう一度'); return; }
      // 未ログイン：8枚そろっていれば共有モーダル、未満は誘導トーストのみ
      if (deck.filter(Boolean).length >= 8) openShareDialog(deck.slice(), '');
      else showToast('8枚そろえてデッキを共有しよう');
      return;
    }
    let slots = [];
    try { slots = await CRAuth.getSlots(); } catch (e) { showToast('スロットの取得に失敗しました'); return; }
    // 5スロット全表示（空きは保存用）。保存ゼロでも出す。
    segSlots = [1,2,3,4,5].map(i => slots.find(s => s.slot === i) || { slot: i, slots: null, empty: true });
    baseIdx = segSlots.findIndex(s => s.slot === currentSlot);
    if (baseIdx < 0) baseIdx = 0;
    lastIdx = baseIdx; startX = downX;

    bar = document.createElement('div');
    bar.className = 'scrub-bar';
    bar.innerHTML = segSlots.map((s, i) =>
      `<div class="scrub-seg${i === baseIdx ? ' on' : ''}${s.empty ? ' empty' : ''}" data-i="${i}"><span class="sn">${s.slot}</span><span class="snm">${s.empty ? TR('空き') : T('cards.n', { n: (s.slots||[]).length }, (s.slots||[]).length + '枚')}</span></div>`
    ).join('');
    // 保存済み＝タップでロード／空き＝タップで現デッキを保存
    bar.querySelectorAll('.scrub-seg').forEach(seg => {
      seg.addEventListener('click', () => {
        // タップは選択だけ（空き=選択のみ／保存済み=ロード）。保存は「保存」ボタンを押した時だけ。
        loadSlotByIndex(+seg.dataset.i); closeBar();
      });
    });
    hint = document.createElement('div');
    hint.className = 'scrub-hint';
    hint.textContent = TR('指を離さず左右になぞってデッキ切替');
    document.body.appendChild(bar);
    document.body.appendChild(hint);
    const r = btn.getBoundingClientRect();
    const barH = bar.offsetHeight || 62;
    const seg0 = bar.querySelector('.scrub-seg');
    stepPx = seg0 ? Math.round((seg0.offsetWidth + 8) * 0.7) : 38;
    bar.style.left = Math.round(r.left + r.width / 2) + 'px';
    bar.style.bottom = Math.round(window.innerHeight - r.top + 8) + 'px';
    hint.style.left = Math.round(r.left + r.width / 2) + 'px';
    hint.style.bottom = Math.round(window.innerHeight - r.top + 8 + barH + 6) + 'px';
    barOpen = true;
  }

  const updateScrub = (clientX) => {
    if (!barOpen || !bar) return;
    const step = Math.round((clientX - startX) / stepPx);
    let idx = Math.max(0, Math.min(segSlots.length - 1, baseIdx + step));
    if (idx === lastIdx) return;
    loadSlotByIndex(idx);
  };

  btn.addEventListener('pointerdown', (e) => {
    if (barOpen) { closeBar(); return; } // 開いてたら閉じる（トグル）
    isDown = true; dragging = false;
    lastPointerX = downX = e.clientX;
    openBar();
  });
  document.addEventListener('pointermove', (e) => {
    lastPointerX = e.clientX;
    if (!isDown) return;
    if (!dragging && Math.abs(e.clientX - downX) > 6) dragging = true;
    if (dragging && barOpen) { e.preventDefault(); updateScrub(e.clientX); }
  }, { passive: false });
  document.addEventListener('pointerup', () => {
    if (!isDown) return;
    isDown = false;
    if (dragging) closeBar();   // スライドして離したら確定して閉じる
    // タップ（動かさず）の場合はバーを開いたまま（スロットをタップ or 外側タップで閉じる）
  });
  // バーの外をタップしたら閉じる（SLOTボタン自身は上のtoggleで処理）
  document.addEventListener('pointerdown', (e) => {
    if (barOpen && !e.target.closest('.scrub-bar') && !e.target.closest('#slotLoadBtn')) closeBar();
  });
  document.addEventListener('pointercancel', () => { isDown = false; if (dragging) closeBar(); });
}

// デッキ名入力（プレースホルダ表示・打つと消える）。OK=文字列 / キャンセル=null
function promptDeckName(placeholder) {
  return new Promise(resolve => {
    const ov = document.createElement('div');
    ov.className = 'swap-overlay';
    ov.innerHTML = `<div class="swap-box">
      <div class="swap-title">デッキ名を入力</div>
      <input id="deckNameInput" type="text" placeholder="${placeholder}"
        style="width:100%;margin:12px 0;padding:11px;border-radius:8px;border:1px solid var(--border);background:var(--surface2);color:var(--text);font-size:16px;outline:none">
      <div style="display:flex;gap:8px">
        <button class="btn btn-ghost" id="dnCancel" style="flex:1">キャンセル</button>
        <button class="btn btn-primary" id="dnOk" style="flex:1">保存</button>
      </div>
    </div>`;
    const close = (val) => { ov.remove(); resolve(val); };
    ov.onclick = (e) => { if (e.target === ov) close(null); };
    ov.querySelector('#dnCancel').onclick = () => close(null);
    const inp = ov.querySelector('#deckNameInput');
    ov.querySelector('#dnOk').onclick = () => close(inp.value.trim());
    inp.addEventListener('keydown', e => { if (e.key === 'Enter') close(inp.value.trim()); });
    document.body.appendChild(ov);
    setTimeout(() => inp.focus(), 30);
  });
}

let _toastTimer = null;
function showToast(msg, ms) {
  const t = document.getElementById('toast');
  t.textContent = (window.CRI18N ? CRI18N.tr(msg) : msg); t.classList.add('show'); // 固定文は自動翻訳（動的文はT()で翻訳済み＝素通り）
  clearTimeout(_toastTimer);
  _toastTimer = setTimeout(() => t.classList.remove('show'), ms || 2200);
}

init();

// 【全解放】以前は寄付額→points(オーナーのみ)で限定していた演出を、全ユーザーへ無料解放。
// 「使ってもらってなんぼ」方針。無料開放＝寄付課金ではないのでSupercellポリシー上も問題なし。演出コードは全保持。
document.body.classList.add('perk-drop', 'perk-bottle'); // 枠の光/8枚シャキーン/ドラッグ軌跡/お気に入り線・アニメを全員に
(function hookPerks() {
  if (!window.CRAuth) { setTimeout(hookPerks, 100); return; }
  CRAuth.onChange(() => {
    document.body.classList.add('perk-drop', 'perk-bottle'); // 状態変化後も解放を維持
    try { updateDeckGlow(deck.filter(Boolean).length); } catch (e) {} // 状態が変わったらグローを反映
    try { updateSlotLoadBtn(); } catch (e) {} // SLOTボタンのアイコン（未ログイン=共有マーク）を反映
  });
})();

// お気に入りをログイン状態で切り分け（auth.jsは後から読み込まれるのでCRAuth待ち）
(function hookFavorites() {
  if (!window.CRAuth) { setTimeout(hookFavorites, 100); return; }
  CRAuth.onChange((user) => {
    if (user) {
      // ログイン：アカウント(クラウド)のお気に入りに切り替え
      favorites = (CRAuth.getCloudFavorites() || []).slice();
      try { localStorage.removeItem('cr_favorites'); } catch(e) {} // 旧・共有キーは廃止（ログアウト後の漏れ防止）
    } else {
      // ログアウト：匿名ローカルのお気に入りに戻す（前アカウントのお気に入りは持ち越さない）
      favorites = JSON.parse(localStorage.getItem('cr_favorites_anon') || '[]');
    }
    render();
  });
})();

// ログイン状態が変わったら、アカウント保存の好みプロフィールをアシストへ反映
(function hookPersona() {
  if (!window.CRAuth) { setTimeout(hookPersona, 100); return; }
  CRAuth.onChange(() => { try { if (assistMode) updateAssistPanel(); } catch (e) {} });
})();
// 好みプロフィール保存イベント（別タブ/別経路の更新にも追従）
window.addEventListener('cr-deck-persona', () => { try { if (assistMode) updateAssistPanel(); } catch (e) {} });

// 未ログイン共有の「ログインで保存・名前が入れられます」からログインした直後：空きスロット最小番号に保存＋SNS共有(by名前)を再表示。初回のみ（_pendingLoginShareフラグ）。
(function hookLoginShare() {
  if (!window.CRAuth) { setTimeout(hookLoginShare, 100); return; }
  CRAuth.onChange(async (user) => {
    if (!user || !_pendingLoginShare) return;
    _pendingLoginShare = false;
    try {
      const slots = await CRAuth.getSlots();
      const used = new Set((slots || []).map(s => s.slot));
      let empty = 0; for (let i = 1; i <= 5; i++) { if (!used.has(i)) { empty = i; break; } }
      await saveDeckToSlotNum(empty || 1); // 保存＋SNS共有（ログイン済＝share by 名前あり）
    } catch (e) {}
  });
})();

// ===== クラロワID連携：所持カードをサイトのカード名に突き合わせる =====
// API返却名（英語slug / 日本語 / ヨミ）をサイトのCARDS名へ解決する
let ownedSiteCards = null; // 解決済みの所持カード名Set（未取得はnull）
// APIがカタカナで返した場合の別名保険（サイト名とズレるもの）
const OWNED_ALIAS = {
  'ヴァルキリー':'バルキリー','エグゼキューショナー':'執行人ファルチェ','処刑人':'執行人ファルチェ',
  'ナイトウィッチ':'ダークネクロ','ヴォイド':'ボイド','虚無':'ボイド','サスピシャスブッシュ':'ステルスブッシュ',
  '怪しい茂み':'ステルスブッシュ','ボスバンディット':'ボスアサシン','ボス盗賊':'ボスアサシン','ザ・ログ':'ローリングウッド',
  'ロイヤルリクルート':'見習い親衛隊','ロイヤル新兵':'見習い親衛隊','ロイヤルホッグ':'ロイヤルホグ','ダートゴブリン':'吹き矢ゴブリン',
  'マザーウィッチ':'マザーネクロマンサー','バルーン':'エアバルーン','キャノン':'大砲','キャノンカート':'60式ムート',
  'モルタル':'迫撃砲','アローズ':'矢の雨','マイナー':'ディガー','コウモリ':'コウモリの群れ','ミニオンホード':'ガーゴイルの群れ',
  'メガミニオン':'メガガーゴイル','ミニオン':'ガーゴイル','スピアゴブリン':'槍ゴブリン','バーバリアンハット':'バーバリアンの小屋',
  '炉':'オーブン','フライングマシン':'ホバリング砲','ゴブリンデモリッシャー':'ダイナマイトゴブリン','ホッグライダー':'ホグライダー',
  'バンディット':'アサシン ユーノ','エレクトロドラゴン':'ライトニングドラゴン','マイティマイナー':'マイティディガー',
  'ゴールデンナイト':'ゴールドナイト','ベイビードラゴン':'ベビードラゴン','ロイヤルデリバリー':'ロイヤルデリバリー'
};
function _buildOwnedMaps() {
  const slugMap = {}, nameMap = {};
  CARDS.forEach(c => {
    const m = (c.img || '').match(/cards\/([a-z0-9-]+)\.png/i);
    if (m) slugMap[m[1].toLowerCase()] = c.name;          // 英語slug → カード名
    nameMap[toKatakana(c.name.toLowerCase())] = c.name;   // 正式名
    (c.yomi || '').split(/\s+/).forEach(y => { if (y) nameMap[toKatakana(y.toLowerCase())] = c.name; }); // ヨミも対象
  });
  Object.entries(OWNED_ALIAS).forEach(([k, v]) => { nameMap[toKatakana(k.toLowerCase())] = v; }); // 別名保険
  return { slugMap, nameMap };
}
function resolveOwnedCards(rawNames) {
  const { slugMap, nameMap } = _buildOwnedMaps();
  const out = new Set();
  const unmatched = [];
  (rawNames || []).forEach(raw => {
    const s = String(raw);
    const slug = s.toLowerCase().replace(/[.　]/g, '').replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '');
    if (slug && slugMap[slug]) { out.add(slugMap[slug]); return; }   // 英語名→slug一致
    const k = toKatakana(s.toLowerCase().replace(/\s|　/g, ''));
    if (nameMap[k]) { out.add(nameMap[k]); return; }                 // 日本語名/ヨミ一致
    unmatched.push(raw);
  });
  if (unmatched.length) console.info('[owned] 未マッチ:', unmatched);
  return out;
}
function applyOwned(raw) {
  ownedSiteCards = resolveOwnedCards(raw);
  console.info('[owned] 所持カード解決:', ownedSiteCards.size + '/' + (raw ? raw.length : 0) + '枚マッチ');
  // ここで今後「組めるデッキだけ表示」などに利用していく
  window.ownedSiteCards = ownedSiteCards;
}
window.addEventListener('cr-owned-cards', (e) => applyOwned(e.detail));
// 既にログイン済みでキャッシュがあれば即反映
(function pollOwned(){
  if (!window.CRAuth) { setTimeout(pollOwned, 150); return; }
  const cached = CRAuth.getOwnedCards && CRAuth.getOwnedCards();
  if (cached) applyOwned(cached);
})();

// URLパラメータ ?deck=カード名,カード名,... でデッキを読み込む（攻略ページからのワンタップ用）
function loadDeckFromQuery() {
  let p = new URLSearchParams(location.search).get('deck');
  const fromUrl = !!p;
  if (!p) { try { p = localStorage.getItem('cr_workdeck') || ''; } catch (e) {} } // ?deck=無し（戻る/Safari戻り）→保存済みデッキを復帰
  if (!p) return;
  // 順番＝スロット位置（0=進化, 1=ヒーロー/チャンピオン, 2=ワイルド, 3-7=通常）でそのまま配置。
  // 空文字＝空スロットとして位置を維持（フォームはスロット位置で決まるので、これで形態ごと復元される）。
  const names = p.split(',').map(s => s.trim());
  const next = [null,null,null,null,null,null,null,null];
  let placed = 0;
  names.slice(0,8).forEach((n, i) => {
    if (!n) return;
    const c = CARDS.find(x => x.name === n);
    if (c) { next[i] = c; placed++; }
  });
  if (!placed) return;
  deck = next;
  renderDeck(); refreshInDeck();
  if (fromUrl) showToast('デッキを読み込みました'); // 静かな復帰時はトーストを出さない
}
loadDeckFromQuery();

// フッターの署名を指でなぞる/マウスで触ると少しキラキラ
(function initSignatureSparkle() {
  const name = document.querySelector('.footer-signature .creator-name');
  if (!name) return;
  let last = 0;
  function spawn(x, y) {
    const now = Date.now();
    if (now - last < 45) return; // 出しすぎ防止
    last = now;
    const s = document.createElement('div');
    s.className = 'sig-sparkle';
    s.style.left = (x + (Math.random() * 16 - 8)) + 'px';
    s.style.top  = (y + (Math.random() * 10 - 5)) + 'px';
    document.body.appendChild(s);
    setTimeout(() => s.remove(), 700);
  }
  function on()  { name.classList.add('glow'); }
  function off() { setTimeout(() => name.classList.remove('glow'), 400); }
  name.addEventListener('touchstart', on, { passive: true });
  name.addEventListener('touchmove', e => {
    const t = e.touches[0];
    if (t) spawn(t.clientX, t.clientY);
  }, { passive: true });
  name.addEventListener('touchend', off, { passive: true });
  name.addEventListener('touchcancel', off, { passive: true });
  name.addEventListener('mousemove', e => { on(); spawn(e.clientX, e.clientY); });
  name.addEventListener('mouseleave', off);
})();

// iOS対策：ページ自体がパンして上部（平均コスト）が隠れたら即座に戻す
if (window.matchMedia('(max-width: 720px)').matches) {
  window.addEventListener('scroll', () => {
    if (window.scrollY !== 0 || window.scrollX !== 0) window.scrollTo(0, 0);
  }, { passive: true });
  window.addEventListener('pageshow', () => window.scrollTo(0, 0));
}

// ログイン機能（auth.js）に現在のデッキを橋渡しする
window.CRDeckBridge = {
  getDeck: () => deck.slice(),
  setDeck: (slots, opts) => {
    deck = [null,null,null,null,null,null,null,null];
    (slots || []).slice(0,8).forEach((c, i) => { deck[i] = c || null; });
    renderDeck(); refreshInDeck();
    if (!(opts && opts.silent)) showToast('デッキを読み込みました');
  },
  cards: CARDS
};
