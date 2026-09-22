// Shared, side-effect-free rules for player input, history and onboarding.
export function normalizeTag(raw) {
  return String(raw ?? '').normalize('NFKC').toUpperCase().replace(/[^A-Z0-9]/g, '');
}

export function bindTagInput(input) {
  if (!input || input.dataset.tagBound) return;
  input.dataset.tagBound = 'true';
  input.setAttribute('autocapitalize', 'characters');
  input.setAttribute('autocorrect', 'off');
  input.setAttribute('spellcheck', 'false');
  input.setAttribute('inputmode', 'url');
  let composing = false;
  const normalize = () => {
    const cursor = normalizeTag(input.value.slice(0, input.selectionStart ?? input.value.length)).length;
    input.value = normalizeTag(input.value);
    input.setSelectionRange(cursor, cursor);
  };
  input.addEventListener('compositionstart', () => { composing = true; });
  input.addEventListener('compositionend', () => { composing = false; normalize(); });
  input.addEventListener('input', e => { if (!composing && !e.isComposing) normalize(); });
  input.addEventListener('blur', () => { composing = false; normalize(); });
}

export const PERIODS = [1, 7, 30, 365];
export function battleTime(value) {
  const m = String(value || '').match(/^(\d{4})(\d{2})(\d{2})T(\d{2})(\d{2})(\d{2})/);
  return m ? Date.UTC(+m[1], +m[2] - 1, +m[3], +m[4], +m[5], +m[6]) : NaN;
}
export function inPeriod(battles, days, now = Date.now()) {
  if (!days) return battles;
  return battles.filter(b => battleTime(b.t) >= now - days * 864e5 && battleTime(b.t) <= now);
}
export function availablePeriod(battles, requested, now = Date.now()) {
  const available = PERIODS.filter(days => inPeriod(battles, days, now).length);
  // Records older than a year still remain accessible via an All tab.
  if (requested === 0 && battles.length) return { days: 0, available };
  return { days: available.includes(requested) ? requested : (available[0] ?? (battles.length ? 0 : 1)), available };
}

export function trophyEfficiency(battles) {
  const seq = battles.slice().sort((a, b) => battleTime(a.t) - battleTime(b.t));
  let gain = 0, loss = 0, intervals = 0;
  for (let i = 1; i < seq.length; i++) {
    const a = seq[i - 1], b = seq[i];
    const elapsed = battleTime(b.t) - battleTime(a.t), delta = b.tr - a.tr;
    // Avoid bridging missing trophies, long gaps, resets or incompatible results.
    if (!Number.isFinite(a.tr) || !Number.isFinite(b.tr) || a.tr <= 0 || b.tr <= 0
      || !(elapsed > 0 && elapsed <= 30 * 60e3) || Math.abs(delta) > 60
      || (delta > 0 && !a.win) || (delta < 0 && a.win)) continue;
    intervals++;
    gain += Math.max(0, delta); loss += Math.max(0, -delta);
  }
  return { gain, loss, intervals, net: gain - loss, percent: gain + loss ? gain / (gain + loss) * 100 : null };
}

// Stable IDs include a revision. Append a new ID when an explanation changes.
export function mergeProgress(...sources) {
  const out = {};
  for (const source of sources) for (const [id, entry] of Object.entries(source || {})) {
    if (['__proto__', 'constructor', 'prototype'].includes(id) || !/^[a-z0-9_-]{1,80}$/.test(id) || !entry || typeof entry !== 'object') continue;
    const next = out[id] || (out[id] = {});
    for (const key of ['shownAt', 'completedAt', 'skippedAt']) {
      if (Number.isFinite(entry[key]) && entry[key] > 0) next[key] = Math.min(next[key] || Infinity, entry[key]);
    }
  }
  return out;
}
export function pendingSteps(steps, progress) {
  return steps.filter(step => !progress[step.id]?.shownAt && !progress[step.id]?.skippedAt && !progress[step.id]?.completedAt);
}
