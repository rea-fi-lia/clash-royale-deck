/* =============================================================
 * neo3d.js — 3Dデッキメーカー（新体験版）
 * 依存: js/cards-data.js（CARDS）
 * 互換: builder.js と同じ直列化
 *   - localStorage 'cr_workdeck'（位置つきカンマ区切り日本語名）
 *   - ?deck= 位置つき日本語名 / strategy.html?deck=&f=(n/e/h×8)
 *   - ゲームにコピー: card-ids.json（slug→Supercell ID）
 * ============================================================= */
(function () {
'use strict';

/* ---------- 定数・状態 ---------- */
var SLOT_TYPE = ['evolved', 'hero', 'wild', 'normal', 'normal', 'normal', 'normal', 'normal'];
var deck = [null, null, null, null, null, null, null, null];
var slot2Mode = {};            // カード名 -> 'evolved' | 'hero'（ワイルド枠の表示形態）
var CARD_IDS = {};
var completeShown = false;     // 完成演出は「満杯になった瞬間」ごとに1回
var RM = false;                // prefers-reduced-motion
try { RM = window.matchMedia('(prefers-reduced-motion: reduce)').matches; } catch (e) {}

var $ = function (s) { return document.querySelector(s); };
var stageArc = $('#stageArc');
var dgrid = $('#dgrid');
var toastEl = $('#toast');

/* ---------- builder.js と同じ意味論 ---------- */
function cardSlug(card) {
  if (!card || !card.img) return '';
  return card.img.split('/').pop().replace(/\.png.*$/i, '').replace(/-ev1$|-hero$/i, '');
}
function slotMode(card, slotIdx) {
  var st = SLOT_TYPE[slotIdx];
  if (st === 'evolved' && card.evolved) return 'evolved';
  if (st === 'hero' && card.hero) return 'hero';
  if (st === 'wild') {
    if (card.evolved && card.hero) return slot2Mode[card.name] || 'evolved';
    if (card.evolved) return 'evolved';
    if (card.hero) return 'hero';
  }
  return 'normal';
}
function slotCardImg(card, idx) {
  var m = slotMode(card, idx);
  if (m === 'evolved' && card.imgEvolved) return card.imgEvolved;
  if (m === 'hero' && card.imgHero) return card.imgHero;
  return card.img;
}
function championCount() {
  return deck.filter(function (c) { return c && c.champion; }).length;
}

/* ---------- 配置先の決定（タップ追加） ---------- */
function bestSlotFor(card) {
  var i;
  if (card.champion) {
    if (championCount() >= 2) return { err: 'チャンピオンは2枚までです' };
    if (!deck[1]) return { idx: 1 };
    if (!deck[2]) return { idx: 2 };
    return { err: 'チャンピオンはヒーロー枠かワイルド枠に入ります' };
  }
  // 特殊形態が活きる枠を優先
  if (card.evolved && !deck[0]) return { idx: 0 };
  if (card.hero && !deck[1]) return { idx: 1 };
  if ((card.evolved || card.hero) && !deck[2]) return { idx: 2 };
  for (i = 3; i < 8; i++) if (!deck[i]) return { idx: i };
  for (i = 0; i < 3; i++) if (!deck[i]) return { idx: i };
  return { err: 'デッキは8枚そろっています' };
}

/* ---------- スロットDOM ---------- */
var slotEls = [];
(function buildSlots() {
  var icons = { evolved: '⚡', hero: '👑', wild: '⚡👑', normal: '' };
  var labels = { evolved: '進化', hero: 'ヒーロー', wild: 'ワイルド', normal: '' };
  for (var i = 0; i < 8; i++) {
    var st = SLOT_TYPE[i];
    var el = document.createElement('div');
    el.className = 'nslot';
    el.dataset.i = i;
    el.dataset.st = st;
    el.style.setProperty('--i', i);
    el.style.setProperty('--col', i % 4);
    el.innerHTML =
      '<div class="nslot-inner">' +
        '<div class="nslot-frame"></div>' +
        '<div class="nslot-type">' + (icons[st] ? '<span>' + icons[st] + '</span>' : '') +
          (labels[st] ? '<small>' + labels[st] + '</small>' : '<small>SLOT ' + (i + 1) + '</small>') + '</div>' +
        '<img class="nslot-art" alt="" width="150" height="180" decoding="async">' +
        '<span class="nslot-glare"></span>' +
        '<button class="nslot-form" type="button" title="形態を切り替え">⚡</button>' +
      '</div>';
    stageArc.appendChild(el);
    slotEls.push(el);
    (function (idx, node) {
      node.querySelector('.nslot-inner').addEventListener('click', function (e) {
        if (e.target.classList.contains('nslot-form')) return;
        if (deck[idx]) removeCard(idx);
      });
      node.querySelector('.nslot-form').addEventListener('click', function (e) {
        e.stopPropagation();
        var c = deck[idx];
        if (!c) return;
        slot2Mode[c.name] = (slot2Mode[c.name] === 'hero') ? 'evolved' : 'hero';
        renderSlot(idx);
        updateHUD(); // 分析リンクの f= に形態を反映
        narrate(slot2Mode[c.name] === 'hero' ? 'ヒーローの姿にしました。' : '進化の姿にしました。');
      });
    })(i, el);
  }
})();

function renderSlot(i) {
  var el = slotEls[i];
  var c = deck[i];
  var art = el.querySelector('.nslot-art');
  el.classList.toggle('filled', !!c);
  el.classList.toggle('has-form', !!(c && SLOT_TYPE[i] === 'wild' && c.evolved && c.hero));
  if (c) {
    var src = slotCardImg(c, i);
    if (art.getAttribute('src') !== src) art.src = src;
    art.alt = c.name;
    var fb = el.querySelector('.nslot-form');
    fb.textContent = slotMode(c, i) === 'hero' ? '👑' : '⚡';
  } else {
    art.removeAttribute('src');
    art.alt = '';
  }
}

/* ---------- ライブラリDOM ---------- */
var cardEls = {};   // name -> element
(function buildLibrary() {
  var frag = document.createDocumentFragment();
  CARDS.forEach(function (c) {
    var b = document.createElement('button');
    b.type = 'button';
    b.className = 'ncard';
    b.dataset.name = c.name;
    var badges = (c.evolved ? '⚡' : '') + (c.hero ? '👑' : '') + (c.champion ? '🏆' : '');
    b.innerHTML =
      '<div class="ncard-inner">' +
        '<img class="ncard-art" src="' + c.img + '" alt="" loading="lazy" decoding="async" width="150" height="180">' +
        '<span class="ncard-cost">' + c.cost + '</span>' +
        (badges ? '<span class="ncard-badges">' + badges + '</span>' : '') +
        '<span class="ncard-name">' + c.name + '</span>' +
        '<span class="ncard-glare"></span>' +
      '</div>';
    b.addEventListener('click', function () { addCard(c, { sourceEl: b }); });
    frag.appendChild(b);
    cardEls[c.name] = b;
  });
  dgrid.appendChild(frag);
})();

function refreshInDeck() {
  var inDeck = {};
  deck.forEach(function (c) { if (c) inDeck[c.name] = 1; });
  CARDS.forEach(function (c) {
    cardEls[c.name].classList.toggle('in-deck', !!inDeck[c.name]);
  });
}

/* ---------- 追加・削除 ----------
   状態（deck配列）はタップの瞬間に確定し、演出だけ着地まで遅らせる。
   （連打・クリア・貼り付け・ルーレットとの競合で札が消えるのを防ぐ） */
function addCard(card, opts) {
  opts = opts || {};
  if (deck.some(function (c) { return c && c.name === card.name; })) {
    showToast('このカードはもうデッキにいます');
    return null;
  }
  var r = bestSlotFor(card);
  if (r.err) { showToast(r.err); return null; }
  var idx = r.idx;
  deck[idx] = card;
  afterChange();
  var reveal = function () {
    if (deck[idx] !== card) { renderSlot(idx); return; } // 飛行中に外された・組み替えられた
    renderSlot(idx);
    landFx(idx);
    if (!opts.quiet) narrateOnAdd(card);
    maybeComplete();
  };
  var fromRect = opts.fromRect || (opts.sourceEl && opts.sourceEl.getBoundingClientRect());
  if (RM || !fromRect) { reveal(); return idx; }
  var toRect = slotEls[idx].getBoundingClientRect();
  flyCard(slotCardImg(card, idx), fromRect, toRect, reveal);
  return idx;
}

function removeCard(idx) {
  var c = deck[idx];
  if (!c) return;
  deck[idx] = null;
  completeShown = false;
  clearTimeout(completeTimer);
  renderSlot(idx);
  afterChange();
  narrate(pick(['なるほど、組み替えですね。', '別の形を試しましょう。', 'ここは考えどころですね。']));
}

function clearDeck() {
  if (!deck.some(Boolean)) return;
  deck = [null, null, null, null, null, null, null, null];
  completeShown = false;
  clearTimeout(completeTimer);
  for (var i = 0; i < 8; i++) renderSlot(i);
  afterChange();
  narrate('まっさらな盤面から。私はこの瞬間も好きです。');
}

/* ---------- 変更後の共通処理 ---------- */
function afterChange() {
  refreshInDeck();
  updateHUD();
  saveWork();
}
var completeTimer = 0;
function maybeComplete() {
  if (deck.filter(Boolean).length === 8 && !completeShown) {
    completeShown = true;
    clearTimeout(completeTimer);
    completeTimer = setTimeout(completeFx, 420);
  }
}

function updateHUD() {
  var filled = deck.filter(Boolean);
  var n = filled.length;
  $('#deckCountNum').textContent = n;
  var avgEl = $('#avgVal');
  var ring = $('#exringFg');
  if (n) {
    var avg = filled.reduce(function (s, c) { return s + (c.cost || 0); }, 0) / n;
    avgEl.textContent = (Math.round(avg * 10) / 10).toFixed(1);
    ring.style.strokeDashoffset = 163.36 * (1 - Math.min(avg, 10) / 10);
    var ex = $('#exring');
    ex.classList.remove('pop'); void ex.offsetWidth; ex.classList.add('pop');
  } else {
    avgEl.textContent = '—';
    ring.style.strokeDashoffset = 163.36;
  }
  // 分析リンク・コピー表記
  var analyze = $('#analyzeBtn');
  if (n === 8) {
    var names = deck.map(function (c) { return c.name; }).join(',');
    var fs = deck.map(function (c, i) {
      var m = slotMode(c, i);
      return m === 'evolved' ? 'e' : m === 'hero' ? 'h' : 'n';
    }).join('');
    analyze.href = 'strategy.html?deck=' + encodeURIComponent(names) + '&f=' + fs;
    analyze.removeAttribute('aria-disabled');
  } else {
    analyze.href = 'strategy.html';
    analyze.setAttribute('aria-disabled', 'true');
  }
  $('#copyBtn').textContent = n >= 8 ? 'ゲームにコピー' : 'ゲームから貼り付け';
}

function saveWork() {
  try {
    localStorage.setItem('cr_workdeck', deck.map(function (c) { return c ? c.name : ''; }).join(','));
  } catch (e) {}
}

/* ---------- 起動時の読み込み（?deck= → cr_workdeck） ---------- */
(function loadInitial() {
  var p = null;
  try { p = new URLSearchParams(location.search).get('deck'); } catch (e) {}
  if (!p) { try { p = localStorage.getItem('cr_workdeck') || ''; } catch (e) {} }
  if (!p) return;
  var names = p.split(',').map(function (s) { return s.trim(); });
  var placed = 0;
  names.slice(0, 8).forEach(function (n, i) {
    if (!n) return;
    var c = null;
    for (var k = 0; k < CARDS.length; k++) if (CARDS[k].name === n) { c = CARDS[k]; break; }
    if (c) { deck[i] = c; placed++; }
  });
  if (placed === 8) completeShown = true;  // 復元時は完成演出を出さない
  if (placed) {
    // 本家と同じく、URLから開いたデッキも作業デッキとして即保存する
    try { localStorage.setItem('cr_workdeck', deck.map(function (c) { return c ? c.name : ''; }).join(',')); } catch (e) {}
  }
})();

/* ---------- フィルタ・検索 ---------- */
var curType = 'all', curCost = 0, curQ = '';
function kata(s) {
  return (s || '').replace(/[ぁ-ん]/g, function (ch) {
    return String.fromCharCode(ch.charCodeAt(0) + 0x60);
  }).toLowerCase();
}
function applyFilters() {
  var q = kata(curQ);
  CARDS.forEach(function (c) {
    var el = cardEls[c.name];
    var ok = true;
    if (curType === 'troop' || curType === 'spell' || curType === 'building') ok = (c.type === curType);
    else if (curType === 'evolved') ok = !!c.evolved;
    else if (curType === 'hero') ok = !!c.hero;
    else if (curType === 'champion') ok = !!c.champion;
    if (ok && curCost) ok = (curCost === 6) ? (c.cost >= 6) : (c.cost === curCost);
    if (ok && q) ok = kata(c.name).indexOf(q) >= 0 || kata(c.yomi).indexOf(q) >= 0;
    el.classList.toggle('hide', !ok);
  });
}
$('#typeChips').addEventListener('click', function (e) {
  var b = e.target.closest('.chip'); if (!b) return;
  this.querySelectorAll('.chip').forEach(function (x) { x.classList.remove('active'); });
  b.classList.add('active');
  curType = b.dataset.type;
  applyFilters();
});
$('#costChips').addEventListener('click', function (e) {
  var b = e.target.closest('.chip'); if (!b) return;
  this.querySelectorAll('.chip').forEach(function (x) { x.classList.remove('active'); });
  b.classList.add('active');
  curCost = parseInt(b.dataset.cost, 10) || 0;
  applyFilters();
});
var searchEl = $('#search');
searchEl.addEventListener('input', function () {
  curQ = this.value.trim();
  $('#searchClear').parentNode.classList.toggle('hasq', !!curQ);
  applyFilters();
});
$('#searchClear').addEventListener('click', function () {
  searchEl.value = ''; curQ = '';
  this.parentNode.classList.remove('hasq');
  applyFilters(); searchEl.focus();
});

/* ---------- ホロ・チルト（ポインタ追従） ---------- */
var tiltRaf = 0, tiltTarget = null, tiltEvent = null;
function onTiltMove(e) {
  if (e.pointerType && e.pointerType !== 'mouse') return; // タッチはチルトなし（軽量化）
  var t = e.target.closest ? e.target.closest('.ncard-inner, .nslot-inner') : null;
  if (tiltTarget && tiltTarget !== t) resetTilt(tiltTarget);
  tiltTarget = t; tiltEvent = e;
  if (t && !tiltRaf) tiltRaf = requestAnimationFrame(applyTilt);
}
function applyTilt() {
  tiltRaf = 0;
  var t = tiltTarget, e = tiltEvent;
  if (!t || !e) return;
  var r = t.getBoundingClientRect();
  var px = Math.max(0, Math.min(1, (e.clientX - r.left) / r.width));
  var py = Math.max(0, Math.min(1, (e.clientY - r.top) / r.height));
  t.style.setProperty('--ry', ((px - 0.5) * 16).toFixed(2) + 'deg');
  t.style.setProperty('--rx', ((0.5 - py) * 14).toFixed(2) + 'deg');
  t.style.setProperty('--tz', '10px');
  t.style.setProperty('--gx', (px * 100).toFixed(1) + '%');
  t.style.setProperty('--gy', (py * 100).toFixed(1) + '%');
  t.style.setProperty('--ga', ((px - 0.5) * 40).toFixed(1) + 'deg');
  t.classList.add('tilting');
}
function resetTilt(t) {
  if (!t) return;
  t.style.setProperty('--rx', '0deg');
  t.style.setProperty('--ry', '0deg');
  t.style.setProperty('--tz', '0px');
  t.classList.remove('tilting');
}
if (!RM) {
  document.addEventListener('pointermove', onTiltMove, { passive: true });
  document.addEventListener('pointerleave', function () { resetTilt(tiltTarget); tiltTarget = null; }, { passive: true });
}

/* ---------- 背景視差（マウス） ---------- */
var paraRaf = 0, paraX = 0, paraY = 0;
if (!RM) {
  window.addEventListener('pointermove', function (e) {
    if (e.pointerType && e.pointerType !== 'mouse') return;
    paraX = (e.clientX / window.innerWidth - 0.5) * 2;
    paraY = (e.clientY / window.innerHeight - 0.5) * 2;
    if (!paraRaf) paraRaf = requestAnimationFrame(function () {
      paraRaf = 0;
      document.documentElement.style.setProperty('--px', paraX.toFixed(3));
      document.documentElement.style.setProperty('--py', paraY.toFixed(3));
    });
  }, { passive: true });
}

/* ---------- ジャイロ（端末の傾き） ---------- */
var gyroBtn = $('#gyroBtn');
var gyroOn = false, gyroBase = null, gyroRaf = 0, gyroB = 0, gyroG = 0;
function gyroSupported() {
  return typeof DeviceOrientationEvent !== 'undefined' && 'ontouchstart' in window;
}
if (gyroSupported() && !RM) gyroBtn.hidden = false;
function onGyro(e) {
  if (e.beta == null || e.gamma == null) return;
  if (!gyroBase) gyroBase = { b: e.beta, g: e.gamma };
  gyroB = Math.max(-14, Math.min(14, e.beta - gyroBase.b));
  gyroG = Math.max(-14, Math.min(14, e.gamma - gyroBase.g));
  if (!gyroRaf) gyroRaf = requestAnimationFrame(function () {
    gyroRaf = 0;
    var root = document.documentElement.style;
    root.setProperty('--gyx', (-gyroB * 0.35).toFixed(2) + 'deg');
    root.setProperty('--gyy', (gyroG * 0.45).toFixed(2) + 'deg');
    root.setProperty('--px', (gyroG / 14).toFixed(3));
    root.setProperty('--py', (gyroB / 14).toFixed(3));
  });
}
gyroBtn.addEventListener('click', function () {
  if (gyroOn) {
    window.removeEventListener('deviceorientation', onGyro);
    gyroOn = false; gyroBase = null;
    if (gyroRaf) { cancelAnimationFrame(gyroRaf); gyroRaf = 0; } // 保留中の1フレームが傾きを書き戻すのを防ぐ
    gyroBtn.setAttribute('aria-pressed', 'false');
    var root = document.documentElement.style;
    root.setProperty('--gyx', '0deg'); root.setProperty('--gyy', '0deg');
    root.setProperty('--px', '0'); root.setProperty('--py', '0');
    return;
  }
  var enable = function () {
    window.addEventListener('deviceorientation', onGyro, { passive: true });
    gyroOn = true;
    gyroBtn.setAttribute('aria-pressed', 'true');
    showToast('端末を傾けると、カードが光を受けます');
  };
  if (typeof DeviceOrientationEvent.requestPermission === 'function') {
    DeviceOrientationEvent.requestPermission().then(function (s) {
      if (s === 'granted') enable(); else showToast('傾きセンサーは使えない設定のようです');
    }).catch(function () { showToast('傾きセンサーは使えない設定のようです'); });
  } else enable();
});

/* ---------- アニメ完了の確実な受け取り ----------
   onfinish はタブ非表示などで発火しないことがあるため、タイムアウトと併用して一度だけ呼ぶ */
function afterAnim(anim, ms, cb) {
  var called = false;
  var fire = function () { if (called) return; called = true; cb(); };
  try {
    anim.onfinish = fire;
    anim.oncancel = fire;
  } catch (e) {}
  setTimeout(fire, ms + 80);
}

/* ---------- 射出フライト（FLIP + WAAPI） ---------- */
function flyCard(src, fromRect, toRect, done) {
  var fly = document.createElement('div');
  fly.className = 'flycard';
  fly.style.left = fromRect.left + 'px';
  fly.style.top = fromRect.top + 'px';
  fly.style.width = fromRect.width + 'px';
  fly.style.height = fromRect.height + 'px';
  fly.innerHTML = '<img src="' + src + '" alt="">';
  document.body.appendChild(fly);
  var dx = toRect.left + toRect.width / 2 - (fromRect.left + fromRect.width / 2);
  var dy = toRect.top + toRect.height / 2 - (fromRect.top + fromRect.height / 2);
  var sc = toRect.width / fromRect.width;
  var anim = fly.animate([
    { transform: 'translate(0,0) scale(1) rotateY(0deg)' },
    { transform: 'translate(' + (dx * 0.5) + 'px,' + (dy * 0.5 - 46) + 'px) scale(' + ((1 + sc) / 2) + ') rotateY(160deg)', offset: 0.55 },
    { transform: 'translate(' + dx + 'px,' + dy + 'px) scale(' + sc + ') rotateY(360deg)' }
  ], { duration: 480, easing: 'cubic-bezier(.2,.75,.25,1.05)' });
  afterAnim(anim, 480, function () { if (fly.parentNode) fly.remove(); done(); });
}

/* ---------- 着地エフェクト（波紋＋雫バースト） ---------- */
function landFx(idx) {
  var el = slotEls[idx];
  el.classList.remove('landed'); void el.offsetWidth; el.classList.add('landed');
  if (RM) return;
  var r = el.getBoundingClientRect();
  burst(r.left + r.width / 2, r.top + r.height / 2, 8);
  if (navigator.vibrate) { try { navigator.vibrate(8); } catch (e) {} }
}

/* 雫パーティクルのプール */
var dropPool = [];
(function initDrops() {
  for (var i = 0; i < 24; i++) {
    var d = document.createElement('span');
    d.className = 'fx-drop';
    document.body.appendChild(d);
    dropPool.push(d);
  }
})();
var dropCursor = 0;
function burst(x, y, n) {
  if (RM) return;
  for (var i = 0; i < n; i++) {
    var d = dropPool[dropCursor];
    dropCursor = (dropCursor + 1) % dropPool.length;
    d.style.left = x + 'px';
    d.style.top = y + 'px';
    var ang = Math.random() * Math.PI * 2;
    var dist = 34 + Math.random() * 44;
    d.animate([
      { opacity: 1, transform: 'translate(-50%,-50%) scale(1)' },
      { opacity: 0, transform: 'translate(calc(-50% + ' + (Math.cos(ang) * dist).toFixed(0) + 'px), calc(-50% + ' + (Math.sin(ang) * dist - 18).toFixed(0) + 'px)) scale(.3)' }
    ], { duration: 420 + Math.random() * 220, easing: 'cubic-bezier(.2,.7,.3,1)' });
  }
}

/* ---------- 軍師の「読み」（タイプ演出） ---------- */
var readTx = $('#hudReadTx');
var typeTimer = 0, lastLine = '';
function narrate(line) {
  if (!line || line === lastLine) return;
  lastLine = line;
  clearInterval(typeTimer);
  var sr = document.getElementById('hudReadSr');
  if (sr) sr.textContent = line; // スクリーンリーダーには全文を一度だけ
  if (RM) { readTx.textContent = line; return; }
  var i = 0;
  readTx.textContent = '';
  typeTimer = setInterval(function () {
    i++;
    readTx.textContent = line.slice(0, i);
    if (i >= line.length) clearInterval(typeTimer);
  }, 26);
}
function pick(arr) { return arr[Math.floor(Math.random() * arr.length)]; }

function deckRead() {
  var filled = deck.filter(Boolean);
  var n = filled.length;
  var air = filled.filter(function (c) { return /対空/.test(c.role); }).length;
  var spells = filled.filter(function (c) { return c.type === 'spell'; }).length;
  var buildings = filled.filter(function (c) { return c.type === 'building'; }).length;
  var wincon = filled.filter(function (c) { return /建物狙い|超長射程建物|爆撃|地中/.test(c.role); }).length;
  var splash = filled.filter(function (c) { return /範囲|スプラッシュ|全体/.test(c.role); }).length;
  var avg = n ? filled.reduce(function (s, c) { return s + c.cost; }, 0) / n : 0;
  return { n: n, air: air, spells: spells, buildings: buildings, wincon: wincon, splash: splash, avg: avg };
}

function narrateOnAdd(card) {
  var d = deckRead();
  if (d.n === 1) { narrate(card.name + 'から始めるんですね。楽しみです。'); return; }
  if (d.n === 8) return; // 完成時は completeFx 側で語る
  var gaps = [];
  if (d.n >= 4 && d.air < 2) gaps.push('空からの攻めには、少し慌てやすいかもしれません。');
  if (d.n >= 4 && d.spells === 0) gaps.push('呪文がまだ無いので、細かい相手に手を焼きやすいかもしれません。');
  if (d.n >= 5 && d.wincon === 0) gaps.push('タワーへの決め手が、まだ見えにくい並びです。');
  if (d.n >= 5 && d.splash === 0) gaps.push('群れで来られると、少し忙しくなりやすいかもしれません。');
  if (gaps.length) { narrate(pick(gaps)); return; }
  if (d.n <= 3) {
    narrate(pick([
      '少しずつ、形が見えてきますね。',
      d.wincon ? '攻めの入り口が見えてきた気がします。' : 'まだ何色にも染まっていない手札です。',
      'この並び、私は嫌いじゃないです。'
    ]));
    return;
  }
  if (d.avg >= 4.2) { narrate('重厚な並びです。序盤は我慢の展開になりやすそうです。'); return; }
  if (d.avg <= 2.9) { narrate('軽快に回りそうです。手数で押す形が似合いそうです。'); return; }
  narrate(pick([
    'いい流れです。あとは仕上げですね。',
    'バランスよくまとまりつつあります。',
    '残りの枠で、色づけをしていきましょう。'
  ]));
}

function finalRead() {
  var d = deckRead();
  var head;
  if (d.avg <= 3.0) head = '軽く回して手数で圧をかける形になりやすいと思います。';
  else if (d.avg >= 4.0) head = 'どっしり構えて、大きな攻めを作る形になりやすいと思います。';
  else if (d.wincon >= 2) head = '攻めの入り口が複数ある、揺さぶりの利く形だと思います。';
  else if (d.buildings >= 1 && d.spells >= 2) head = '守りから流れを作る形になりやすいと思います。';
  else head = '攻守の切り替えで戦う、素直な形だと思います。';
  return head + ' 私はこのデッキ、戦える形だと思います。';
}

/* ---------- 完成演出 ---------- */
function completeFx() {
  narrate(finalRead());
  if (RM) return;
  var ov = $('#complete');
  ov.hidden = false;
  // カードのウェーブ・フリップ
  slotEls.forEach(function (el, i) {
    var inner = el.querySelector('.nslot-inner');
    inner.animate([
      { transform: 'rotateY(0deg)' },
      { transform: 'rotateY(360deg)' }
    ], { duration: 700, delay: i * 70, easing: 'cubic-bezier(.34,1.2,.5,1)' });
  });
  // 火花
  var frag = document.createDocumentFragment();
  for (var i = 0; i < 16; i++) {
    var s = document.createElement('span');
    s.className = 'spark';
    var ang = Math.random() * Math.PI * 2;
    var dist = 90 + Math.random() * 150;
    s.style.setProperty('--sx', (Math.cos(ang) * dist).toFixed(0) + 'px');
    s.style.setProperty('--sy', (Math.sin(ang) * dist).toFixed(0) + 'px');
    s.style.animationDelay = (Math.random() * 0.25) + 's';
    frag.appendChild(s);
  }
  ov.appendChild(frag);
  var close = function () {
    ov.hidden = true;
    ov.querySelectorAll('.spark').forEach(function (s) { s.remove(); });
    document.removeEventListener('pointerdown', close);
  };
  document.addEventListener('pointerdown', close);
  setTimeout(close, 1700);
}

/* ---------- 運命の1枚（3Dルーレット） ---------- */
function fateCandidates() {
  var d = deckRead();
  var inDeck = {};
  deck.forEach(function (c) { if (c) inDeck[c.name] = 1; });
  var pool = CARDS.filter(function (c) {
    if (inDeck[c.name]) return false;
    if (c.champion && (championCount() >= 2 || (deck[1] && deck[2]))) return false;
    return true;
  });
  var pref;
  if (d.wincon === 0) pref = pool.filter(function (c) { return /建物狙い|超長射程建物|爆撃|地中/.test(c.role); });
  else if (d.air < 2) pref = pool.filter(function (c) { return /対空/.test(c.role); });
  else if (d.spells === 0) pref = pool.filter(function (c) { return c.type === 'spell'; });
  else if (d.avg >= 3.9) pref = pool.filter(function (c) { return c.cost <= 3; });
  else if (d.avg <= 2.8 && d.avg > 0) pref = pool.filter(function (c) { return c.cost >= 4; });
  else pref = pool;
  if (pref.length < 6) pref = pool;
  // シャッフルして12枚
  var a = pref.slice();
  for (var i = a.length - 1; i > 0; i--) {
    var j = Math.floor(Math.random() * (i + 1));
    var t = a[i]; a[i] = a[j]; a[j] = t;
  }
  return a.slice(0, 12);
}

var fateRunning = false;
function runFate() {
  if (fateRunning) return;
  if (!deck.some(function (c) { return !c; })) { showToast('デッキは8枚そろっています'); return; }
  var cands = fateCandidates();
  if (!cands.length) return;
  var winner = cands[Math.floor(Math.random() * cands.length)];
  if (RM) {
    if (addCard(winner, { quiet: true }) != null) narrate('運命の1枚、来ました。');
    return;
  }
  fateRunning = true;
  var ov = $('#fate'), ring = $('#fateRing');
  ring.innerHTML = '';
  var n = cands.length, winIdx = cands.indexOf(winner);
  var R = Math.min(260, Math.max(190, window.innerWidth * 0.3));
  cands.forEach(function (c, i) {
    var d = document.createElement('div');
    d.className = 'fate-card';
    d.style.transform = 'rotateY(' + (i * 360 / n) + 'deg) translateZ(' + R + 'px)';
    d.innerHTML = '<img src="' + c.img + '" alt="' + c.name + '">';
    ring.appendChild(d);
  });
  ov.hidden = false;
  // 当たりが正面（0deg）で止まるよう回転
  var target = -(winIdx * 360 / n) - 720;
  var spin = ring.animate([
    { transform: 'rotateY(0deg)' },
    { transform: 'rotateY(' + target + 'deg)' }
  ], { duration: 2300, easing: 'cubic-bezier(.15,.75,.2,1)', fill: 'forwards' });
  afterAnim(spin, 2300, function () {
    var cardsEls = ring.querySelectorAll('.fate-card');
    cardsEls.forEach(function (el, i) { if (i !== winIdx) el.style.opacity = 0.18; });
    var winEl = cardsEls[winIdx];
    winEl.animate([{ transform: winEl.style.transform + ' scale(1)' }, { transform: winEl.style.transform + ' scale(1.18)' }],
      { duration: 300, easing: 'cubic-bezier(.34,1.56,.64,1)', fill: 'forwards' });
    setTimeout(function () {
      var fromRect = winEl.getBoundingClientRect();
      ov.hidden = true;
      // 状態はaddCard内で即確定するので、確定後に再クリック可へ戻す
      var idx = addCard(winner, { fromRect: fromRect, quiet: true });
      fateRunning = false;
      if (idx == null) return;
      stageShake();
      narrate('運命の1枚、来ました。');
    }, 480);
  });
  // 途中タップでスキップ
  ov.addEventListener('pointerdown', function skip(e) {
    e.stopPropagation();
    try { spin.finish(); } catch (err) {}
  }, { once: true });
}
function stageShake() {
  if (RM) return;
  // .stage 自体はCSS transformを持たないので上書きしても安全
  $('.stage').animate([
    { transform: 'translate(0,0)' },
    { transform: 'translate(3px,1px)' },
    { transform: 'translate(-3px,-1px)' },
    { transform: 'translate(0,0)' }
  ], { duration: 220, easing: 'linear' });
}

/* ---------- ゲームにコピー／貼り付け ---------- */
var idsLoading = false;
function loadIds() {
  if (idsLoading || Object.keys(CARD_IDS).length) return;
  idsLoading = true;
  fetch('https://raw.githubusercontent.com/rea-fi-lia/clash-royale-deck/data/card-ids.json?cb=' + Date.now(), { cache: 'no-store' })
    .then(function (r) { return r.ok ? r.json() : null; })
    .then(function (j) { if (j && j.ids) CARD_IDS = j.ids; idsLoading = false; })
    .catch(function () { idsLoading = false; }); // 失敗時はボタン操作時に再試行される
}
loadIds();
function clashDeckLink() {
  var cards = deck.filter(Boolean);
  if (cards.length < 8) return null;
  var ids = cards.map(function (c) { return CARD_IDS[cardSlug(c)]; });
  if (ids.some(function (id) { return !id; })) return null;
  return 'https://link.clashroyale.com/jp?clashroyale://copyDeck?deck=' + ids.join(';') +
    '&slots=0;0;0;0;0;0;0;0&tt=159000000';
}
function copyText(t) {
  if (navigator.clipboard && navigator.clipboard.writeText) return navigator.clipboard.writeText(t);
  return new Promise(function (res, rej) {
    var ta = document.createElement('textarea');
    ta.value = t; ta.style.position = 'fixed'; ta.style.opacity = '0';
    document.body.appendChild(ta); ta.select();
    try { document.execCommand('copy'); res(); } catch (e) { rej(e); }
    ta.remove();
  });
}
$('#copyBtn').addEventListener('click', function () {
  var n = deck.filter(Boolean).length;
  if (n >= 8) {
    var link = clashDeckLink();
    if (!link) loadIds(); // 読み込み失敗時の再試行（次回はリンクでコピーできるように）
    // 本家と同じ「壊れない」挙動: リンクが作れなくてもカード一覧テキストをコピーする
    var text = link || deck.filter(Boolean).map(function (c) { return c.name; }).join(', ');
    copyText(text).then(function () {
      showToast(link ? 'コピーしました。クラロワで開くとデッキが入ります' : 'カードの一覧をコピーしました');
    }).catch(function () { showToast('コピーできませんでした'); });
  } else {
    // ゲームからの貼り付け
    if (!Object.keys(CARD_IDS).length) { loadIds(); showToast('カード情報を読み込み中です。少し待ってもう一度どうぞ'); return; }
    if (!navigator.clipboard || !navigator.clipboard.readText) { showToast('この環境では貼り付けを読めません'); return; }
    navigator.clipboard.readText().then(function (text) {
      var m = String(text).match(/copyDeck\?deck=([0-9;]+)/);
      var ids = m ? m[1].split(';').filter(Boolean) : [];
      if (ids.length !== 8) { showToast('ゲーム内でデッキのリンクをコピーしてから、もう一度どうぞ'); return; }
      var idToCard = {};
      CARDS.forEach(function (c) { var id = CARD_IDS[cardSlug(c)]; if (id) idToCard[String(id)] = c; });
      var cards = ids.map(function (id) { return idToCard[String(id)]; });
      if (cards.some(function (c) { return !c; })) { showToast('ゲーム内でデッキのリンクをコピーしてから、もう一度どうぞ'); return; }
      deck = cards.slice(0, 8);
      completeShown = true;
      clearTimeout(completeTimer);
      for (var i = 0; i < 8; i++) renderSlot(i);
      afterChange();
      narrate('ゲームからデッキを受け取りました。ここから磨いていきましょう。');
    }).catch(function () { showToast('貼り付けを読めませんでした'); });
  }
});

/* ---------- 共有・クリア・運命 ---------- */
$('#shareBtn').addEventListener('click', function () {
  var names = deck.map(function (c) { return c ? c.name : ''; });
  while (names.length && names[names.length - 1] === '') names.pop();
  if (!names.length) { showToast('まずはカードを選んでみてください'); return; }
  var url = location.origin + location.pathname + '?deck=' + encodeURIComponent(names.join(','));
  copyText(url).then(function () { showToast('このデッキへのリンクをコピーしました'); })
    .catch(function () { showToast('コピーできませんでした'); });
});
$('#clearBtn').addEventListener('click', clearDeck);
$('#fateBtn').addEventListener('click', runFate);
$('#analyzeBtn').addEventListener('click', function (e) {
  // キーボード操作はCSSのpointer-events:noneでは止まらないため、ここでも守る
  if (deck.filter(Boolean).length < 8) {
    e.preventDefault();
    showToast('8枚そろうと分析できます');
  }
});

/* ---------- トースト ---------- */
var toastTimer = 0;
function showToast(msg) {
  toastEl.textContent = msg;
  toastEl.classList.add('show');
  clearTimeout(toastTimer);
  toastTimer = setTimeout(function () { toastEl.classList.remove('show'); }, 2400);
}

/* ---------- 背景の光の粒 ---------- */
(function initMotes() {
  if (RM) return;
  var wrap = $('#motes');
  for (var i = 0; i < 14; i++) {
    var s = document.createElement('span');
    s.style.left = (4 + Math.random() * 92) + '%';
    s.style.setProperty('--dur', (9 + Math.random() * 9).toFixed(1) + 's');
    s.style.setProperty('--delay', (-Math.random() * 14).toFixed(1) + 's');
    s.style.setProperty('--drift', ((Math.random() - 0.5) * 90).toFixed(0) + 'px');
    wrap.appendChild(s);
  }
})();

/* ---------- 初期描画 ---------- */
for (var i = 0; i < 8; i++) renderSlot(i);
refreshInDeck();
updateHUD();
narrate(deck.some(Boolean)
  ? 'おかえりなさい。続きから仕上げていきましょう。'
  : '8枚で、あなたの戦い方をかたちにしましょう。');

})();
