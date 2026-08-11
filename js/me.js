/* =============================================================
 *  マイページ（/me.html）— 2026-08-11
 *  docs/monetization.md が設計の正本。
 *
 *  - 入口はタグ登録のみ（ログイン不要）。localStorage 'cr_my_tag' はキャッシュで、
 *    データの正本はサーバー（/api/me/sync が R2 に全期間保存）。
 *    別端末・プライベートブラウズでもタグを再設定すれば同じデータが戻る。
 *  - ログイン済みで profile.crTag があればそれを自動で使う（Firebase紐付け）。
 *  - 無料の表示窓はサーバー側で90日に絞られて返る。total（全期間の件数）が
 *    表示件数より多いときは「歴史はここに保存されている」ことを一言出す（課金導線の種）。
 *  - カード画像は cardImgTag()、検索照合は使わない（規約は crdb-single-source-rules）。
 * ============================================================= */
(function () {
  'use strict';
  const $ = id => document.getElementById(id);
  const esc = s => String(s == null ? '' : s).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');
  const TAG_KEY = 'cr_my_tag';

  /* ---- タグの取得優先順位：ログインのcrTag ＞ localStorage ---- */
  function localTag() { try { return (localStorage.getItem(TAG_KEY) || '').trim() || null; } catch (e) { return null; } }
  function saveLocalTag(t) { try { localStorage.setItem(TAG_KEY, t); } catch (e) {} }
  function cleanTag(raw) { return String(raw || '').trim().toUpperCase().replace(/^#/, '').replace(/[^A-Z0-9]/g, ''); }

  /* ---- 勝ち筋の分類（decks.js の ME_ARCH_WINCONS と同じ表・順序） ---- */
  const WINCONS = ['ラヴァハウンド', 'ゴーレム', 'エレクトロジャイアント', 'エリクサーゴーレム', '三銃士',
    'ゴブジャイアント', 'ジャイアント', '巨大スケルトン', 'スパーキー', '見習い親衛隊', 'ペッカ', 'メガナイト',
    'ボスアサシン', 'ロイヤルジャイアント', '巨大クロスボウ', '迫撃砲', 'エアバルーン', 'スケルトンバレル',
    'ホグライダー', 'ロイヤルホグ', 'ラムライダー', '攻城バーバリアン', 'エリートバーバリアン', 'プリンス',
    'ゴブリンマシン', 'ゴブリンシュタイン', 'モンク', 'アーチャークイーン', 'ゴールドナイト', 'スケルトンラッシュ',
    'ゴブリンバレル', 'ゴブリンドリル', 'ウォールブレイカー', 'マイティディガー', 'ディガー', 'ロケット'];
  function archsOf(names) {
    const base = (names || []).map(n => cardBaseName(n));
    const out = [];
    for (const w of WINCONS) if (base.includes(w)) out.push(w);
    return out.length ? out : ['その他'];
  }

  const bandOf = tr => (typeof tr === 'number' && tr >= 0) ? Math.floor(tr / 300) * 300 : null;
  const fmMark = f => f === 'e' ? '⚡' : f === 'h' ? '👑' : '';
  const chip = (name, form) => '<span class="me-chip">' + cardImgTag(name, form || 'n', { alt: name }) + '</span>';

  /* ---- 描画 ---- */
  function renderAll(data, meta) {
    const B = data.battles || [];
    $('meTagSetup').hidden = true;
    $('meBody').hidden = false;

    /* ヘッダ */
    const latest = B.find(b => typeof b.tr === 'number');
    const tr = latest ? latest.tr : null;
    const band = bandOf(tr);
    let name = null; try { name = localStorage.getItem('cr_name_' + data.tag) || null; } catch (e) {}
    const hidden = data.total - B.length;
    $('meHeader').innerHTML =
      '<div class="me-head">'
      + '<div class="me-head-id"><b>' + esc(name || ('#' + data.tag)) + '</b>'
      + (name ? '<span class="me-tag">#' + esc(data.tag) + '</span>' : '') + '</div>'
      + (tr != null ? '<div class="me-head-band">🏆 ' + tr.toLocaleString() + '<span>帯 ' + band + '–' + (band + 299) + '</span></div>' : '')
      + '<div class="me-head-total">記録 ' + data.total + '戦'
      + (hidden > 0 ? '<span class="me-locked">（全歴史を保存中。表示は直近' + Math.round(data.windowDays / 30) + 'ヶ月の' + B.length + '戦）</span>' : '')
      + '</div></div>';

    /* 成績サマリ */
    const w = B.filter(b => b.win).length, l = B.length - w;
    const wr = B.length ? Math.round(w / B.length * 1000) / 10 : null;
    const crownF = B.reduce((a, b) => a + (b.tc || 0), 0), crownA = B.reduce((a, b) => a + (b.oc || 0), 0);
    $('meRecordBody').innerHTML = B.length === 0
      ? '<p class="note">まだ試合の記録がありません。ランク戦（1v1）を遊ぶと、開くたびにここへ貯まっていきます。</p>'
      : '<div class="me-stats">'
      + '<div class="me-stat"><b>' + wr + '%</b><span>勝率</span></div>'
      + '<div class="me-stat"><b>' + w + '勝' + l + '敗</b><span>直近' + B.length + '戦</span></div>'
      + '<div class="me-stat"><b>' + (B.length ? '+' + Math.round((crownF - crownA) / B.length * 100) / 100 : '—') + '</b><span>クラウン差/戦</span></div>'
      + '</div>';

    /* 使用デッキ別 */
    const byDeck = {};
    B.forEach(b => {
      if (!b.deck || b.deck.length !== 8) return;
      const key = b.deck.map((n, i) => n + (b.df ? b.df[i] : 'n')).sort().join('|');
      const e = byDeck[key] || (byDeck[key] = { deck: b.deck, df: b.df, g: 0, w: 0 });
      e.g++; if (b.win) e.w++;
    });
    const decks = Object.values(byDeck).sort((a, b) => b.g - a.g).slice(0, 5);
    $('meDecksBody').innerHTML = decks.length === 0 ? '<p class="note">記録が貯まると表示されます。</p>'
      : decks.map(d => {
        const wrd = Math.round(d.w / d.g * 1000) / 10;
        return '<div class="me-deck"><div class="me-deck-cards">'
          + d.deck.map((n, i) => chip(n, d.df ? d.df[i] : 'n')).join('')
          + '</div><div class="me-deck-stat"><b>' + wrd + '%</b><span>' + d.w + '勝' + (d.g - d.w) + '敗</span></div></div>';
      }).join('');

    /* あなたの環境（対面の勝ち筋分布＋苦手カード） */
    const arch = {};
    B.forEach(b => archsOf(b.opp).forEach(k => { const e = arch[k] || (arch[k] = { g: 0, w: 0 }); e.g++; if (b.win) e.w++; }));
    const archRows = Object.entries(arch).map(([k, v]) => ({ k, share: Math.round(v.g / Math.max(1, B.length) * 1000) / 10, g: v.g, wr: Math.round(v.w / v.g * 1000) / 10 }))
      .sort((a, b) => b.g - a.g).slice(0, 10);
    const oppCard = {};
    B.forEach(b => (b.opp || []).forEach(n => { const e = oppCard[n] || (oppCard[n] = { g: 0, w: 0 }); e.g++; if (b.win) e.w++; }));
    const weak = Object.entries(oppCard).map(([n, v]) => ({ n, g: v.g, wr: Math.round(v.w / v.g * 1000) / 10 }))
      .filter(x => x.g >= 3).sort((a, b) => a.wr - b.wr).slice(0, 8);
    $('meEnvBody').innerHTML = B.length === 0 ? '<p class="note">記録が貯まると表示されます。</p>'
      : '<h3>相手の勝ち筋分布</h3><div class="me-bars">'
      + archRows.map(r => '<div class="me-bar-row">' + chip(r.k)
        + '<span class="me-bar"><i style="width:' + Math.min(100, r.share * 2) + '%"></i></span>'
        + '<span class="me-bar-num">' + r.share + '%<small>あなた' + r.wr + '%勝</small></span></div>').join('')
      + '</div>'
      + (weak.length ? '<h3>苦手な相手カード（対面勝率が低い順）</h3><div class="me-weak">'
        + weak.map(x => '<span class="me-weak-card">' + chip(x.n) + '<b>' + x.wr + '%</b><small>' + x.g + '戦</small></span>').join('') + '</div>' : '');

    /* あなたの帯のいま（全帯統計から切り出し） */
    let bandHtml = '<p class="note">帯のデータを読み込めませんでした。</p>';
    const tb = meta && meta.trophyBandIntel;
    if (tb && tb.byBand && tr != null) {
      let best = null, bestKey = null;
      Object.keys(tb.byBand).forEach(k => {
        const m = k.match(/^(\d+)-(\d+)$/); if (!m) return;
        if (tr >= (+m[1]) - 150 && tr <= (+m[2]) + 150) {
          const cards = tb.byBand[k].cards || {};
          const g = Object.values(cards).reduce((a, c) => a + (c.games || 0), 0);
          if (!best || g > best.g) { best = { cards, g }; bestKey = k; }
        }
      });
      if (best) {
        const rows = Object.entries(best.cards).map(([n, v]) => ({ n, g: v.games || 0, wr: v.wr }))
          .sort((a, b) => b.g - a.g).slice(0, 10);
        bandHtml = '<p class="note">帯 ' + bestKey + ' のランク戦データ</p><div class="me-weak">'
          + rows.map(x => '<span class="me-weak-card">' + chip(x.n) + '<b>' + (x.wr != null ? x.wr + '%' : '—') + '</b><small>' + x.g + '戦</small></span>').join('')
          + '</div>';
      }
    }
    $('meBandBody').innerHTML = bandHtml;

    /* トロフィー推移（軽いSVG折れ線。battlesは新しい順→時系列へ反転） */
    const pts = B.filter(b => typeof b.tr === 'number').map(b => b.tr).reverse();
    if (pts.length >= 2) {
      const min = Math.min(...pts), max = Math.max(...pts), span = Math.max(1, max - min);
      const W = 600, H = 120, pad = 6;
      const path = pts.map((v, i) => (i ? 'L' : 'M')
        + (pad + i / (pts.length - 1) * (W - 2 * pad)).toFixed(1) + ','
        + (H - pad - (v - min) / span * (H - 2 * pad)).toFixed(1)).join(' ');
      $('meTrendBody').innerHTML =
        '<svg viewBox="0 0 ' + W + ' ' + H + '" class="me-spark" role="img" aria-label="トロフィー推移">'
        + '<path d="' + path + '" fill="none" stroke="var(--accent)" stroke-width="2.5" stroke-linejoin="round"/></svg>'
        + '<p class="note">' + min.toLocaleString() + ' 〜 ' + max.toLocaleString() + '（表示中の' + pts.length + '戦）</p>';
    } else {
      $('meTrendBody').innerHTML = '<p class="note">記録が貯まると表示されます。</p>';
    }

    if (window.CRI18N) CRI18N.apply();
  }

  /* ---- 同期 ---- */
  async function sync(tag) {
    const err = $('meTagError');
    err.hidden = true;
    try {
      const r = await fetch('/api/me/sync?tag=' + encodeURIComponent(tag), { cache: 'no-store' });
      const j = await r.json();
      if (!r.ok || j.error) throw new Error(j.error || ('HTTP ' + r.status));
      saveLocalTag(tag);
      let meta = null;
      try { meta = await fetch('/api/meta?cb=' + Date.now(), { cache: 'no-store' }).then(x => x.ok ? x.json() : null); } catch (e) {}
      renderAll(j, meta);
    } catch (e) {
      err.textContent = '取得できませんでした：' + (e && e.message || e) + '（タグをもう一度確認してください）';
      err.hidden = false;
      $('meTagSetup').hidden = false;
    }
  }

  /* ---- 初期化 ---- */
  document.addEventListener('DOMContentLoaded', () => {
    $('meTagSave').addEventListener('click', () => {
      const t = cleanTag($('meTagInput').value);
      if (t.length < 3) { $('meTagError').textContent = 'タグが短すぎます'; $('meTagError').hidden = false; return; }
      sync(t);
    });
    $('meTagInput').addEventListener('keydown', e => { if (e.key === 'Enter') $('meTagSave').click(); });
    $('meTagChange').addEventListener('click', () => {
      $('meBody').hidden = true; $('meTagSetup').hidden = false; $('meTagInput').value = '';
      try { localStorage.removeItem(TAG_KEY); } catch (e) {}
    });

    // ログインの crTag を最優先（Firebase紐付け＝端末をまたぐ）。無ければ localStorage。
    let started = false;
    const startWith = t => { if (!started && t) { started = true; $('meTagInput').value = '#' + t; sync(t); } };
    if (window.CRAuth && CRAuth.onChange) {
      CRAuth.onChange((user, profile) => { if (profile && profile.crTag) startWith(cleanTag(profile.crTag)); });
    }
    setTimeout(() => startWith(localTag()), 400);   // ログイン確認を少し待ってからローカルへフォールバック
  });
})();
