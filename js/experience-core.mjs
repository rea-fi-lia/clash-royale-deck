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
export function graphBattles(battles) {
  const times = new Set();
  return battles.filter(b => {
    const t = battleTime(b.t);
    if (!Number.isFinite(t) || !Number.isFinite(b.tr) || b.tr <= 0 || times.has(t)) return false;
    times.add(t); return true;
  }).sort((a, b) => battleTime(a.t) - battleTime(b.t));
}
export function availablePeriod(battles, requested, now = Date.now()) {
  const available = PERIODS.filter(days => graphBattles(inPeriod(battles, days, now)).length >= 2);
  // Records older than a year still remain accessible via an All tab.
  if (requested === 0 && battles.length) return { days: 0, available };
  const fallback = PERIODS.find(days => inPeriod(battles, days, now).length) ?? (battles.length ? 0 : 1);
  return { days: available.includes(requested) ? requested : (available[0] ?? fallback), available };
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

// Presentation fallback only: never invent ranked rating points from road trophies.
export function selectTrophySeries(data) {
  const all=data.battles||[],ranked=all.filter(b=>b.competition==='ranked');
  const requested=data.competitions?.default==='ranked';
  const awaitingRanked=requested&&!ranked.some(b=>Number.isFinite(b.tr)&&b.tr>0);
  const kind=requested&&!awaitingRanked?'ranked':'trophy';
  return {kind,awaitingRanked,rows:kind==='ranked'?ranked:all.filter(b=>!b.competition||b.competition==='trophy'||b.competition==='unknown')};
}
