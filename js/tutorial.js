import { mergeProgress, pendingSteps } from './experience-core.mjs?v=260813';

// Add steps with a new stable ID. Existing IDs must never be repurposed.
export const TUTORIAL_STEPS = [
  { id: 'desktop_slots_v1', target: '#slotLoadBtn', ja: ['デッキの保存・切り替えはここ', 'SLOTから保存したデッキを呼び出せます。ログインすると、最大5つのスロットを端末をまたいで使えます。'], en: ['Your saved decks live here', 'Use SLOT to switch decks. Sign in to save up to five decks and access them on other devices.'] },
  { id: 'desktop_pin_v1', target: '.dp-pin', ja: ['デッキを見ながらカード選び', '「デッキを固定」をオンにすると、スクロール中もデッキが上に残ります。もう一度押すと固定を解除できます。'], en: ['Keep your deck in view', 'Turn on Pin deck to keep your cards visible while scrolling. Click again to unpin.'] },
  { id: 'desktop_assist_v1', target: '#assistToggle', ja: ['次の1枚に迷ったらアシスト', 'アシストをオンにすると、今のデッキに合わせた候補が出ます。自分で選ぶモードには、いつでも戻せます。'], en: ['Find your next card with Assist', 'Turn on Assist for suggestions that fit your deck. You can switch back to manual selection at any time.'] }
];

export function installTutorial(auth) {
  if (!document.getElementById('deckSlots')) return;
  const mq = matchMedia('(min-width: 1024px)');
  const prefix = 'cr_tutorial_v1:';
  const read = key => { try { return mergeProgress(JSON.parse(localStorage.getItem(prefix + key) || '{}')); } catch { return {}; } };
  const write = (key, value) => { try { localStorage.setItem(prefix + key, JSON.stringify(value)); } catch {} };
  let identity = null, progress = {}, tour = null, syncRunning = false, revision = 0, syncedRevision = -1;
  let attempted = new Set(), replay = new URLSearchParams(location.search).get('tour') === '1';
  let domReady = document.readyState !== 'loading';
  const isJa = () => (window.CRI18N?.lang || document.documentElement.lang || 'ja').startsWith('ja');
  const label = (ja, en) => isJa() ? ja : en;
  // Capture identity for each write. An old account's in-flight request cannot target the next one.
  async function flush() {
    if (syncRunning || !identity?.startsWith('account:') || syncedRevision === revision) return;
    const key = identity, uid = key.slice(8), savedRevision = revision, payload = mergeProgress(progress);
    syncRunning = true;
    try {
      if (await auth.saveTutorialProgress(uid, payload)) {
        if (identity === key) syncedRevision = savedRevision;
      }
    } catch { console.warn('[CRDB tutorial] Account sync pending; progress is kept on this device.'); }
    finally { syncRunning = false; }
    if (identity !== key || savedRevision !== revision) void flush();
  }
  function record(id, field) {
    progress = mergeProgress(progress, { [id]: { [field]: Date.now() } });
    write(identity, progress); revision++; void flush();
  }
  function close() {
    if (!tour) return;
    const old = tour; tour = null;
    old.cleanup(); old.overlay.remove();
    window.scrollTo({ top: old.scroll, behavior: 'instant' });
    old.focus?.focus({ preventScroll: true });
  }
  function start(steps) {
    if (!steps.length || tour || !mq.matches) return;
    const overlay = document.createElement('div');
    overlay.className = 'cr-tour'; overlay.dataset.noI18n = '';
    overlay.innerHTML = '<div class="cr-tour-shade"></div>'.repeat(4)
      + '<div class="cr-tour-focus"></div><section class="cr-tour-panel" role="dialog" aria-modal="true" aria-labelledby="crTourTitle" aria-describedby="crTourText">'
      + '<div class="cr-tour-top"><span id="crTourCount"></span><button type="button" class="cr-tour-skip"></button></div>'
      + '<h2 id="crTourTitle"></h2><p id="crTourText"></p><div class="cr-tour-actions"><button type="button" class="cr-tour-prev"></button><button type="button" class="cr-tour-next"></button></div></section>';
    document.body.append(overlay);
    const panel = overlay.querySelector('.cr-tour-panel'), ring = overlay.querySelector('.cr-tour-focus');
    const shades = [...overlay.querySelectorAll('.cr-tour-shade')];
    const next = overlay.querySelector('.cr-tour-next'), prev = overlay.querySelector('.cr-tour-prev'), skip = overlay.querySelector('.cr-tour-skip');
    let index = 0, target, raf = 0;
    const rect = (el, x, y, w, h) => Object.assign(el.style, { left: x + 'px', top: y + 'px', width: Math.max(0, w) + 'px', height: Math.max(0, h) + 'px' });
    function position() {
      if (!target?.isConnected) { close(); return; }
      const r = target.getBoundingClientRect(), W = innerWidth, H = innerHeight, p = 7;
      const x = Math.max(0, r.left - p), y = Math.max(0, r.top - p), right = Math.min(W, r.right + p), bottom = Math.min(H, r.bottom + p);
      rect(ring, x, y, right - x, bottom - y);
      rect(shades[0], 0, 0, W, y); rect(shades[1], 0, bottom, W, H - bottom);
      rect(shades[2], 0, y, x, bottom - y); rect(shades[3], right, y, W - right, bottom - y);
      const h = panel.getBoundingClientRect().height, w = panel.getBoundingClientRect().width;
      panel.style.left = Math.max(16, Math.min(W - w - 16, x)) + 'px';
      panel.style.top = Math.max(16, Math.min(H - h - 16, bottom + h + 18 < H ? bottom + 18 : y - h - 18)) + 'px';
    }
    const schedule = () => { cancelAnimationFrame(raf); raf = requestAnimationFrame(position); };
    function show() {
      const step = steps[index]; target = document.querySelector(step.target);
      if (!target) { close(); return; }
      const copy = isJa() ? step.ja : step.en;
      overlay.querySelector('#crTourTitle').textContent = copy[0]; overlay.querySelector('#crTourText').textContent = copy[1];
      overlay.querySelector('#crTourCount').textContent = label('新しい使い方', 'QUICK TOUR') + ' · ' + (index + 1) + ' / ' + steps.length;
      skip.textContent = label('スキップ', 'Skip'); prev.textContent = label('戻る', 'Back'); prev.hidden = index === 0;
      next.textContent = index === steps.length - 1 ? label('はじめよう', 'Done') : label('次へ', 'Next');
      target.scrollIntoView({ block: 'center', behavior: 'instant' });
      position(); schedule(); next.focus({ preventScroll: true });
      record(step.id, 'shownAt');
    }
    const finish = () => { steps.slice(index).forEach(step => record(step.id, 'skippedAt')); close(); };
    function keys(e) {
      if (e.key === 'Escape') { e.preventDefault(); finish(); }
      if (e.key !== 'Tab') return;
      const buttons = [skip, prev, next].filter(b => !b.hidden);
      const i = buttons.indexOf(document.activeElement);
      e.preventDefault(); buttons[(i + (e.shiftKey ? -1 : 1) + buttons.length) % buttons.length].focus();
    }
    const observer = new ResizeObserver(schedule); observer.observe(panel);
    tour = { overlay, scroll: scrollY, focus: document.activeElement, cleanup() { observer.disconnect(); cancelAnimationFrame(raf); window.removeEventListener('scroll', schedule, true); window.removeEventListener('resize', schedule); document.removeEventListener('keydown', keys, true); } };
    window.addEventListener('scroll', schedule, true); window.addEventListener('resize', schedule); document.addEventListener('keydown', keys, true);
    skip.onclick = finish;
    prev.onclick = () => { index--; show(); };
    next.onclick = () => { record(steps[index].id, 'completedAt'); if (++index === steps.length) close(); else show(); };
    show();
  }
  function maybeStart() {
    if (!domReady || !identity || !mq.matches || !document.querySelector('.dp-pin') || attempted.has(identity)) return;
    if (document.querySelector('.cr-login-overlay,.slot-pop,.swap-overlay')) return;
    attempted.add(identity);
    const steps = replay ? TUTORIAL_STEPS : pendingSteps(TUTORIAL_STEPS, progress);
    if (replay) {
      const url = new URL(location.href); url.searchParams.delete('tour'); history.replaceState(history.state, '', url); replay = false;
    }
    start(steps);
  }
  function connect(user, profile) {
    if (user && !profile) return; // Never overwrite an account with guest state on profile failure.
    const key = user ? 'account:' + user.uid : 'guest';
    if (identity !== key) close();
    identity = key;
    progress = mergeProgress(read(key), profile?.tutorialProgress);
    // Guest progress is consumed once by the first account, never copied to a second account.
    if (user) {
      progress = mergeProgress(progress, read('guest'));
      write(key, progress);
      try { localStorage.removeItem(prefix + 'guest'); } catch {}
    }
    revision++; syncedRevision = -1; void flush(); maybeStart();
  }
  auth.onChange(connect);
  if (!domReady) document.addEventListener('DOMContentLoaded', () => { domReady = true; maybeStart(); }, { once: true });
  mq.addEventListener('change', () => { if (!mq.matches) close(); else maybeStart(); });
  window.addEventListener('online', () => { void flush(); });
  window.addEventListener('pagehide', close);
  // If the SDK is unavailable, known accounts wait; anonymous visitors can still use the guide.
  setTimeout(() => { if (!identity && !auth.hasSession()) connect(null, null); }, 4000);
}
