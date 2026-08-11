/* =============================================================
 *  UXガード（全ページ共通・2026-08-11）
 *  ★「ダブルタップで拡大させない」「横スクロールさせない」の実行側の正本。
 *    CSSだけでは塞げない分をここで見る。auth.js に入っていた
 *    preventDoubleTapZoom はここへ集約した（auth.js は一部ページしか
 *    読まれていなかったため、ガードとしては穴があった）。
 *
 *  新しいページを作ったら css/guard.css と このファイルを必ず読み込む。
 *  読み込み漏れは tools/check-card-images.js の [1d] が検出して落とす。
 * ============================================================= */
(function () {
  'use strict';

  /* ── ダブルタップ拡大の防止（ピンチ拡大は残す） ── */
  var lastTouchEnd = 0;
  document.addEventListener('touchend', function (e) {
    var now = Date.now();
    if (now - lastTouchEnd <= 350) {
      var t = e.target;
      // 入力欄など、文字選択やカーソル移動が要る要素は素の挙動を残す
      if (t && t.closest && t.closest('input, textarea, select, [contenteditable]')) { lastTouchEnd = now; return; }
      e.preventDefault();
    }
    lastTouchEnd = now;
  }, { passive: false });
  // iOS Safari のダブルタップ由来の gesture 拡大も抑える（ピンチは別イベントなので残る）
  document.addEventListener('gesturestart', function (e) {
    if (e.scale && Math.abs(e.scale - 1) < 0.1) e.preventDefault();
  });

  /* ── 横スクロールの監視（?uxdebug=1 のときだけ犯人を報告） ──
     CSSで隠すのは対症療法なので、開発時ははみ出している要素そのものを特定できるようにする。 */
  if (/[?&]uxdebug=1/.test(location.search)) {
    var check = function () {
      var vw = document.documentElement.clientWidth;
      var bad = [];
      document.querySelectorAll('body *').forEach(function (el) {
        var r = el.getBoundingClientRect();
        if (r.width === 0) return;
        if (r.right > vw + 1 || r.left < -1) {
          if (el.closest('.scroll-x')) return;                       // 意図的な横スクロールは除外
          var cs = getComputedStyle(el);
          if (cs.overflowX === 'auto' || cs.overflowX === 'scroll') return;
          bad.push({ el: el, tag: el.tagName + '.' + String(el.className || '').split(' ')[0], right: Math.round(r.right), vw: vw });
        }
      });
      if (bad.length) { console.warn('[ux-guard] 横にはみ出している要素 ' + bad.length + '件', bad.slice(0, 10)); bad.slice(0, 5).forEach(function (b) { b.el.style.outline = '2px solid magenta'; }); }
      else console.log('[ux-guard] 横のはみ出しなし（幅' + vw + '）');
    };
    if (document.readyState === 'complete') setTimeout(check, 300);
    else window.addEventListener('load', function () { setTimeout(check, 300); });
    window.addEventListener('resize', function () { clearTimeout(window.__uxT); window.__uxT = setTimeout(check, 300); });
  }
})();
