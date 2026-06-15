/**
 * Donation Machine (Elixir Tank)
 * 月間￥100,000 MAX
 * データ: Firestore `donationMachine/{ YYYY-MM }` の 1 ドキュメント
 * 見た目だけの累計表示。ログイン不要。
 */
(() => {
  'use strict';

  const MAX_YEN = 100_000;
  let currentMonthKey = monthKeyJST();
  let unsub = null;

  function monthKeyJST() {
    const d = new Date(Date.now() + 9 * 60 * 60 * 1000);
    return `${d.getUTCFullYear()}-${String(d.getUTCMonth()+1).padStart(2,'0')}`;
  }

  function mount() {
    const root = document.getElementById('donation-machine');
    if (!root) return;
    root.innerHTML = `
      <div class="machine-bg" aria-hidden="true"></div>
      <div class="machine" id="machine">
        <div class="elixir-tank" id="elixirTank" role="img"
             aria-label="エリクサータンク（今月の累計寄付）">
          <div class="elixir-liquid" id="liquid">
            <span class="bubble"></span><span class="bubble"></span><span class="bubble"></span>
          </div>
          <div class="tank-rail">
            <div class="tank-rail-fill" id="railFill"></div>
            <div class="tank-rail-knob" id="railKnob"></div>
          </div>
        </div>
        <div class="machine-title">支援装置</div>
        <div class="machine-sub">今月の累計 ¥ がタンクに溜まります</div>
        <div class="machine-amount" id="amountText">¥ 0</div>
        <div class="machine-max">MAX ¥${MAX_YEN.toLocaleString()}</div>
      </div>
    `;
    startStream(root);
    startMonthGuard(root);
  }

  function startStream(root) {
    if (!window.CR_APP?.firebase) return;
    const db = window.CR_APP.firebase.firestore?.();
    if (!db) return;
    const ref = db.collection('donationMachine').doc(currentMonthKey);
    unsub = ref.onSnapshot(
      snap => {
        const d = snap.data() || {};
        renderYen(Math.max(0, Number(d.totalYen || 0)));
      },
      err => console.warn('donation-machine:', err)
    );
  }

  function renderYen(yen) {
    const pct = Math.min(100, (yen / MAX_YEN) * 100);
    const liquid = document.getElementById('liquid');
    const railFill = document.getElementById('railFill');
    const railKnob = document.getElementById('railKnob');
    const amountText = document.getElementById('amountText');
    if (liquid) liquid.style.height = `${pct}%`;
    if (railFill) railFill.style.height = `${pct}%`;
    if (railKnob) railKnob.style.bottom = `${pct}%`;
    if (amountText) amountText.textContent = `¥ ${yen.toLocaleString()}`;
  }

  function startMonthGuard(root) {
    setInterval(() => {
      const next = monthKeyJST();
      if (next !== currentMonthKey) {
        currentMonthKey = next;
        if (typeof unsub === 'function') { try { unsub(); } catch {} }
        renderYen(0);
        startStream(root);
      }
    }, 30_000);
  }

  if (document.readyState === 'loading')
    document.addEventListener('DOMContentLoaded', mount);
  else mount();
})();
