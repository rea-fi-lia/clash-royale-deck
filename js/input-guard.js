/* Keep native IME composition intact. Do not blur on the Enter that commits Japanese text. */
(function (root) {
  'use strict';
  function bindSearch(input, change, submit) {
    let composing = false, ended = -Infinity, last;
    const publish = () => { last = input.value; change?.(); };
    input.addEventListener('compositionstart', () => { composing = true; });
    input.addEventListener('compositionend', () => { composing = false; ended = Date.now(); publish(); });
    input.addEventListener('input', e => { if (!composing && !e.isComposing && !(Date.now() - ended < 80 && last === input.value)) publish(); });
    const commit = e => {
      if (composing || e.isComposing || e.keyCode === 229 || Date.now() - ended < 80) return;
      e.preventDefault(); (submit || (() => input.blur()))();
    };
    input.addEventListener('keydown', e => { if (e.key === 'Enter') commit(e); });
    input.addEventListener('search', commit);
  }
  root.CRInputGuard = { bindSearch };
})(globalThis);
