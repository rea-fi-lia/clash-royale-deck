/* =============================================================
 *  マイページ（/me.html）— 2026-08-11
 *  docs/monetization.md が設計の正本。
 *
 *  - 入口はタグ登録のみ（ログイン不要）。localStorage 'cr_my_tag' はキャッシュで、
 *    データの正本はサーバー（/api/me/sync が R2 に全期間保存）。
 *  - ログイン済みで profile.crTag があればそれを自動で使う（Firebase紐付け）。
 *  - ★既存ユーザーの引き継ぎ：これまで「あなたの環境」はカードページを開くたびに
 *    localStorage(cr_me_{TAG}) へ最新400戦を貯めていた。マイページ初回起動時に
 *    その端末内の歴史を /api/me/import で一度だけサーバーへ移す。
 *  - 課金まわりの表示はまだ出さない（jo指示・2026-08-11）。
 *  - カード画像は cardImgTag()（規約は crdb-single-source-rules）。
 * ============================================================= */
(function () {
  'use strict';
  const $ = id => document.getElementById(id);
  const esc = s => String(s == null ? '' : s).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');
  const TAG_KEY = 'cr_my_tag';

  const CACHE_KEY = t => 'cr_my_cache_' + t;      // 直近の /api/me/sync 結果（即描画用）
  const RANGE_KEY = 'cr_my_range';
  let STATE = { data: null, meta: null, days: 30 };

  function localTag() { try { return (localStorage.getItem(TAG_KEY) || '').trim() || null; } catch (e) { return null; } }
  function readCache(t) { try { return JSON.parse(localStorage.getItem(CACHE_KEY(t)) || 'null'); } catch (e) { return null; } }
  function writeCache(t, d) { try { localStorage.setItem(CACHE_KEY(t), JSON.stringify(d)); } catch (e) {} }
  function readRange() { try { const v = +localStorage.getItem(RANGE_KEY); return [1, 7, 30, 365].includes(v) ? v : 30; } catch (e) { return 30; } }
  function saveLocalTag(t) { try { localStorage.setItem(TAG_KEY, t); } catch (e) {} }
  function cleanTag(raw) { return String(raw || '').trim().toUpperCase().replace(/^#/, '').replace(/[^A-Z0-9]/g, ''); }

  /* 勝ち筋の分類（decks.js の ME_ARCH_WINCONS と同じ表・順序） */
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
  // df/of は文字列8桁（新）と配列（初期の保存分）の両対応
  const fAt = (f, i) => !f ? 'n' : (typeof f === 'string' ? (f.charAt(i) || 'n') : (f[i] || 'n'));
  const chip = (name, form) => '<span class="me-chip">' + cardImgTag(name, form || 'n', { alt: name }) + '</span>';
  const parseT = t => { const m = String(t || '').match(/^(\d{4})(\d{2})(\d{2})T(\d{2})(\d{2})/); return m ? new Date(Date.UTC(+m[1], +m[2] - 1, +m[3], +m[4], +m[5])) : null; };
  const fmtDate = d => d ? (d.getMonth() + 1) + '/' + d.getDate() : '';

  /* ---- 描画 ---- */
  // 期間で絞る（days=0/未指定なら全部）。battles は新しい順。
  function inRange(list, days) {
    if (!days) return list;
    const cut = new Date(Date.now() - days * 864e5);
    const cutStr = cut.toISOString().replace(/[-:]/g, '').slice(0, 15);
    return list.filter(b => String(b.t) >= cutStr);
  }
  function rerender() { if (STATE.data) renderAll(STATE.data, STATE.meta); }

  function renderAll(data, meta) {
    const ALL = data.battles || [];
    const B = inRange(ALL, STATE.days);
    $('meTagSetup').hidden = true;
    $('meBody').hidden = false;

    /* ヘッダ（課金まわりの文言はまだ出さない） */
    const latest = B.find(b => typeof b.tr === 'number');
    const tr = latest ? latest.tr : null;
    const band = bandOf(tr);
    let name = null; try { name = localStorage.getItem('cr_name_' + data.tag) || null; } catch (e) {}
    $('meHeader').innerHTML =
      '<div class="me-head">'
      + '<div class="me-head-id"><b>' + esc(name || ('#' + data.tag)) + '</b>'
      + (name ? '<span class="me-tag">#' + esc(data.tag) + '</span>' : '') + '</div>'
      + (tr != null ? '<div class="me-head-band">🏆 ' + tr.toLocaleString() + '<span>帯 ' + band + '–' + (band + 299) + '</span></div>' : '')
      + '<div class="me-head-total">' + B.length + '戦<small>／全' + ALL.length + '戦</small></div>'
      + '</div>'
      // ★説明文はトロフィーのすぐ下に置く（上部を占領しないため・jo指示2026-08-11）
      + '<p class="me-lead">あなたの戦績と、あなたのトロフィー帯のいま。</p>';

    /* 成績サマリ */
    const w = B.filter(b => b.win).length, l = B.length - w;
    const wr = B.length ? Math.round(w / B.length * 1000) / 10 : null;
    const cB = B.filter(b => typeof b.tc === 'number' && typeof b.oc === 'number');
    const crownF = cB.reduce((a, b) => a + b.tc, 0), crownA = cB.reduce((a, b) => a + b.oc, 0);
    $('meRecordBody').innerHTML = B.length === 0
      ? '<p class="note">' + (ALL.length ? 'この期間の記録がありません。上の期間を広げてみてください。' : 'まだ試合の記録がありません。ランク戦（1v1）を遊ぶと、開くたびにここへ貯まっていきます。') + '</p>'
      : '<div class="me-stats">'
      + '<div class="me-stat"><b>' + wr + '%</b><span>勝率</span></div>'
      + '<div class="me-stat"><b>' + w + '勝' + l + '敗</b><span>' + B.length + '戦</span></div>'
      + (cB.length ? '<div class="me-stat"><b>' + (crownF - crownA >= 0 ? '+' : '') + (Math.round((crownF - crownA) / cB.length * 100) / 100) + '</b><span>クラウン差/戦'
        + (cB.length < B.length ? '<i>' + cB.length + '戦分</i>' : '') + '</span></div>' : '')
      + '</div>'
      + crownQualityHtml(cB);

    /* 使用デッキ別（全体データとの突合つき） */
    renderDecks(B, meta);

    /* あなたの環境（対面の勝ち筋分布＋苦手カード） */
    const arch = {};
    B.forEach(b => archsOf(b.opp).forEach(k => { const e = arch[k] || (arch[k] = { g: 0, w: 0 }); e.g++; if (b.win) e.w++; }));
    const archRows = Object.entries(arch).map(([k, v]) => ({ k, share: Math.round(v.g / Math.max(1, B.length) * 1000) / 10, g: v.g, wr: Math.round(v.w / v.g * 1000) / 10 }))
      .sort((a, b) => b.g - a.g).slice(0, 10);
    const oppCard = {};
    B.forEach(b => (b.opp || []).forEach(n => { const bn = cardBaseName(n); const e = oppCard[bn] || (oppCard[bn] = { g: 0, w: 0 }); e.g++; if (b.win) e.w++; }));
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

    /* あなたの帯のいま＋最優先の対策（帯の流行 × あなたの苦手） */
    renderBand(B, meta, tr, oppCard);

    /* トロフィー推移（時間軸つき） */
    renderTrend(B);

    if (window.CRI18N) CRI18N.apply();
  }

  /* 勝ち方・負け方（クラウン対の内訳。decksの「三冠の質」の個人版）
   * 全体実測では 1:0 が勝ちの76.6%を占める＝「どう勝ち切っているか」は個人の型がよく出る */
  function crownQualityHtml(cB) {
    if (cB.length < 5) return '';
    const wins = [0, 0, 0, 0, 0, 0], losses = [0, 0, 0, 0, 0, 0];   // [3:0,3:1,3:2,2:0,2:1,1:0]
    const bucket = (hi, lo) => hi === 3 ? (lo === 0 ? 0 : lo === 1 ? 1 : 2) : hi === 2 ? (lo === 0 ? 3 : 4) : 5;
    cB.forEach(b => {
      const hi = Math.max(b.tc, b.oc), lo = Math.min(b.tc, b.oc);
      if (hi === lo || hi === 0) return;
      (b.win ? wins : losses)[bucket(hi, lo)]++;
    });
    const LBL = ['3-0', '3-1', '3-2', '2-0', '2-1', '1-0'];
    const wTot = wins.reduce((a, b) => a + b, 0), lTot = losses.reduce((a, b) => a + b, 0);
    if (!wTot && !lTot) return '';
    const row = (label, arr, tot, cls) => '<div class="me-cq-row"><span class="me-cq-label">' + label + '</span>'
      + arr.map((v, i) => '<span class="me-cq-cell' + (v ? ' ' + cls : '') + '" style="opacity:' + (v ? Math.max(.35, v / Math.max(1, Math.max(...arr))) : .15) + '">'
        + '<b>' + v + '</b><small>' + LBL[i] + '</small></span>').join('') + '</div>';
    // 押し切り度：三冠勝ちのうち3-0の割合（全体基準は約70%）
    const tri = wins[0] + wins[1] + wins[2];
    const note = tri >= 5
      ? '<p class="note">三冠勝ち' + tri + '戦のうち3-0が' + Math.round(wins[0] / tri * 100) + '%（全体の平均はおよそ70%。高いほど押し切って勝てています）</p>' : '';
    return '<h3>勝ち方・負け方（クラウン内訳）<small>' + cB.length + '戦分</small></h3><div class="me-cq">'
      + row('勝ち', wins, wTot, 'win') + row('負け', losses, lTot, 'lose') + '</div>' + note;
  }

  /* 使用デッキ別（全体統計に同じ8枚があれば「みんなの勝率」を併記＝伸びしろが見える） */
  function renderDecks(B, meta) {
    const byDeck = {};
    B.forEach(b => {
      if (!b.deck || b.deck.length !== 8) return;
      const key = b.deck.slice().sort().join('|');
      const e = byDeck[key] || (byDeck[key] = { deck: b.deck, df: b.df, g: 0, w: 0, key });
      e.g++; if (b.win) e.w++;
    });
    const globalBySig = {};
    const d = meta && meta.decks;
    [(d && d.decks) || [], (d && d.winDecks) || []].forEach(list => list.forEach(x => {
      if (!x.slots || x.winRate == null) return;
      const k = x.slots.map(n => cardBaseName(n)).sort().join('|');
      const cur = globalBySig[k];
      if (!cur || (x.games || 0) > (cur.games || 0)) globalBySig[k] = { winRate: x.winRate, games: x.games || 0 };
    }));
    const decks = Object.values(byDeck).sort((a, b) => b.g - a.g).slice(0, 5);
    const covered = Object.values(byDeck).reduce((a, d) => a + d.g, 0);
    const deckNote = (covered && covered < B.length)
      ? '<p class="note">自分のデッキが記録されている' + covered + '戦が対象です（これから貯まる分にはすべて記録されます）。</p>' : '';
    $('meDecksBody').innerHTML = decks.length === 0 ? '<p class="note">記録が貯まると表示されます。</p>'
      : decks.map(dk => {
        const wrd = Math.round(dk.w / dk.g * 1000) / 10;
        const g = globalBySig[dk.key];
        const cmp = g ? ('<small class="me-deck-global">みんなの勝率 ' + g.winRate + '%'
          + (g.winRate - wrd >= 8 ? '（伸びしろあり）' : wrd - g.winRate >= 8 ? '（あなたが上）' : '') + '</small>') : '';
        return '<div class="me-deck"><div class="me-deck-cards">'
          + dk.deck.map((n, i) => chip(n, fAt(dk.df, i))).join('')
          + '</div><div class="me-deck-stat"><b>' + wrd + '%</b><span>' + dk.w + '勝' + (dk.g - dk.w) + '敗</span>' + cmp + '</div></div>';
      }).join('') + deckNote;
  }

  /* あなたの帯のいま＋「最優先の対策」（帯で流行 × あなたが苦手 の交差＝このサイトにしか出せない掛け算） */
  function renderBand(B, meta, tr, oppCard) {
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
      // ★いつのデータかを出す（jo指示・2026-08-11）。帯統計は7日窓の単一集計なので、
      //   実際の窓と最終更新をそのまま書く（デッキ側の1h/1日/3日とは別物なので混同させない）。
      const wd = tb.windowDays || 7;
      const upd = tb.updated ? new Date(tb.updated) : null;
      const hrs = upd ? Math.max(0, Math.round((Date.now() - upd) / 36e5)) : null;
      const whenEl = $('meBandWhen');
      if (whenEl) whenEl.textContent = '直近' + wd + '日の集計'
        + (hrs != null ? '・' + (hrs < 1 ? 'たった今' : hrs < 24 ? hrs + '時間前' : Math.round(hrs / 24) + '日前') + '更新' : '');
      if (best) {
        const rows = Object.entries(best.cards).map(([n, v]) => ({ n, g: v.games || 0, wr: v.wr }))
          .sort((a, b) => b.g - a.g);
        // 最優先の対策：帯の流行上位20 × あなたの対面勝率50%未満（3戦以上）
        const mine = n => oppCard[n];
        const priority = rows.slice(0, 20)
          .map(r => ({ ...r, me: mine(r.n) }))
          .filter(r => r.me && r.me.g >= 3 && (r.me.w / r.me.g) < 0.5)
          .slice(0, 6);
        const prio = priority.length
          ? '<h3>最優先の対策（あなたの帯で流行していて、あなたが苦手）</h3><div class="me-weak">'
            + priority.map(r => '<span class="me-weak-card prio">' + chip(r.n)
              + '<b>' + Math.round(r.me.w / r.me.g * 100) + '%</b><small>帯で' + r.g + '戦</small></span>').join('')
            + '</div><p class="note">対策の仕方はカード名タップ→カードページの「どの呪文で落ちるか」「よく一緒に使われるカード」が手がかりになります。</p>'
          : (B.length >= 10 ? '<p class="note">いまのところ、帯の流行とあなたの苦手は重なっていません。良い状態です。</p>' : '');
        bandHtml = prio + '<h3>帯 ' + bestKey + ' でよく使われているカード</h3><div class="me-weak">'
          + rows.slice(0, 10).map(x => '<span class="me-weak-card">' + chip(x.n) + '<b>' + (x.wr != null ? x.wr + '%' : '—') + '</b><small>' + x.g + '戦</small></span>').join('')
          + '</div>';
      }
    }
    $('meBandBody').innerHTML = bandHtml;
  }

  /* トロフィー推移（2026-08-11 刷新）
   * 上部の主役として見せる：面グラフ＋現在値＋増減バッジ。時間軸は実時刻で配置する。 */
  function renderTrend(B) {
    const el = $('meTrendBody');
    const seq = B.filter(b => typeof b.tr === 'number' && parseT(b.t)).slice().reverse();  // 古→新
    if (seq.length < 2) { el.innerHTML = '<p class="note">記録が2戦以上たまるとトロフィーの推移が出ます。</p>'; return; }
    const pts = seq.map(b => b.tr);
    const t0 = parseT(seq[0].t), t1 = parseT(seq[seq.length - 1].t);
    const span = Math.max(1, t1 - t0);
    const rawMin = Math.min(...pts), rawMax = Math.max(...pts);
    const pad = Math.max(30, Math.round((rawMax - rawMin) * 0.18));
    const min = rawMin - pad, max = rawMax + pad, vspan = Math.max(1, max - min);
    const W = 640, H = 168, L = 8, R = 8, T = 14, Bm = 26;
    const X = i => L + (parseT(seq[i].t) - t0) / span * (W - L - R);
    const Y = v => (H - Bm) - (v - min) / vspan * (H - T - Bm);
    const line = pts.map((v, i) => (i ? 'L' : 'M') + X(i).toFixed(1) + ',' + Y(v).toFixed(1)).join(' ');
    const area = line + ' L' + X(pts.length - 1).toFixed(1) + ',' + (H - Bm) + ' L' + X(0).toFixed(1) + ',' + (H - Bm) + ' Z';
    const grid = [rawMax, rawMin].map(v =>
      '<line x1="' + L + '" x2="' + (W - R) + '" y1="' + Y(v).toFixed(1) + '" y2="' + Y(v).toFixed(1) + '" class="me-grid"/>'
      + '<text x="' + (L + 2) + '" y="' + (Y(v) - 4).toFixed(1) + '" class="me-ax">' + v.toLocaleString() + '</text>').join('');
    const last = pts[pts.length - 1], first = pts[0], diff = last - first;
    const dots = seq.map((b, i) => '<circle cx="' + X(i).toFixed(1) + '" cy="' + Y(b.tr).toFixed(1) + '" r="2.2" class="'
      + (b.win ? 'me-dot-w' : 'me-dot-l') + '"><title>' + fmtDate(parseT(b.t)) + ' ' + b.tr.toLocaleString()
      + (b.win ? ' 勝ち' : ' 負け') + '</title></circle>').join('');
    el.innerHTML =
      '<div class="me-trend-head">'
      + '<div class="me-trend-now"><b>' + last.toLocaleString() + '</b><span>トロフィー</span></div>'
      + '<div class="me-trend-diff ' + (diff >= 0 ? 'up' : 'down') + '">' + (diff >= 0 ? '+' : '') + diff.toLocaleString() + '</div>'
      + '<div class="me-trend-span">' + fmtDate(t0) + '〜' + fmtDate(t1) + '・' + seq.length + '戦</div>'
      + '</div>'
      + '<svg viewBox="0 0 ' + W + ' ' + H + '" class="me-trend" role="img" aria-label="トロフィー推移">'
      + '<defs><linearGradient id="meGrad" x1="0" y1="0" x2="0" y2="1">'
      + '<stop offset="0%" stop-color="var(--accent)" stop-opacity=".38"/>'
      + '<stop offset="100%" stop-color="var(--accent)" stop-opacity="0"/></linearGradient></defs>'
      + grid
      + '<path d="' + area + '" fill="url(#meGrad)"/>'
      + '<path d="' + line + '" fill="none" stroke="var(--accent)" stroke-width="2.2" stroke-linejoin="round" stroke-linecap="round"/>'
      + dots
      + '<text x="' + L + '" y="' + (H - 8) + '" class="me-ax">' + fmtDate(t0) + '</text>'
      + '<text x="' + (W - R) + '" y="' + (H - 8) + '" class="me-ax" text-anchor="end">' + fmtDate(t1) + '</text>'
      + '</svg>';
  }

  /* ---- 既存の端末内蓄積（カードページ時代の cr_me_{TAG}）を一度だけサーバーへ移す ---- */
  async function importLegacy(tag) {
    let flagKey = 'cr_me_imported_' + tag;
    try { if (localStorage.getItem(flagKey)) return; } catch (e) { return; }
    let legacy = null;
    try { legacy = JSON.parse(localStorage.getItem('cr_me_' + tag) || 'null'); } catch (e) {}
    if (!Array.isArray(legacy) || !legacy.length) { try { localStorage.setItem(flagKey, '1'); } catch (e) {} return; }
    try {
      const r = await fetch('/api/me/import', {
        method: 'POST', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ tag, battles: legacy })
      });
      const j = await r.json();
      if (r.ok && !j.error) { try { localStorage.setItem(flagKey, '1'); } catch (e) {} }
      return j;
    } catch (e) { return null; }
  }

  /* ---- 同期 ---- */
  /* ★体感速度：待たせない。
   *   1) 端末キャッシュがあれば即描画（0ms）＋ meta も並行で取る
   *   2) サーバー同期と /api/meta は同時に投げる（直列にしない）
   *   3) 返ってきたら差し替え。初回だけはスケルトンを出して「読み込んでいる」と分かるように */
  function skeleton() {
    $('meTagSetup').hidden = true; $('meBody').hidden = false;
    $('meHeader').innerHTML = '<div class="me-skel me-skel-head"></div>';
    ['meRecordBody', 'meDecksBody', 'meEnvBody', 'meBandBody', 'meTrendBody']
      .forEach(id => { const e = $(id); if (e) e.innerHTML = '<div class="me-skel"></div>'; });
  }
  async function sync(tag) {
    const err = $('meTagError');
    err.hidden = true;
    const cached = readCache(tag);
    if (cached && cached.battles) { STATE.data = cached; renderAll(cached, STATE.meta); }   // 即描画
    else skeleton();

    // meta は毎回同じなのでセッション内で使い回す（2回目以降はネットワークに行かない）
    const metaP = STATE.meta ? Promise.resolve(STATE.meta)
      : fetch('/api/meta', { cache: 'default' }).then(x => x.ok ? x.json() : null).catch(() => null);
    const syncP = (async () => {
      await importLegacy(tag);
      const r = await fetch('/api/me/sync?tag=' + encodeURIComponent(tag), { cache: 'no-store' });
      const j = await r.json();
      if (!r.ok || j.error) throw new Error(j.error || ('HTTP ' + r.status));
      return j;
    })();

    try {
      const [j, meta] = await Promise.all([syncP, metaP]);   // 並行
      STATE.meta = meta || STATE.meta;
      STATE.data = j;
      saveLocalTag(tag); writeCache(tag, j);
      renderAll(j, STATE.meta);
    } catch (e) {
      if (cached && cached.battles) return;                  // キャッシュが出ているなら黙って諦める
      err.textContent = '取得できませんでした：' + (e && e.message || e) + '（タグをもう一度確認してください）';
      err.hidden = false;
      $('meBody').hidden = true;
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
      curTag = null;
      try { localStorage.removeItem(TAG_KEY); } catch (e) {}
      // ログイン中はアカウント側のタグが正なので、その旨を出す（勝手に戻って混乱しないように）
      const p = window.CRAuth && CRAuth.getProfile && CRAuth.getProfile();
      const err = $('meTagError');
      if (p && p.crTag) {
        err.textContent = 'ログイン中のアカウントには #' + cleanTag(p.crTag) + ' が登録されています。別のタグを入れるとこの端末でだけ切り替わります。';
        err.hidden = false;
      }
    });

    // 期間の切り替え（再取得はしない＝手元のデータを絞るだけなので一瞬）
    STATE.days = readRange();
    const rangeEl = $('meRange');
    if (rangeEl) {
      rangeEl.querySelectorAll('button').forEach(b => {
        b.classList.toggle('on', +b.dataset.days === STATE.days);
        b.addEventListener('click', () => {
          STATE.days = +b.dataset.days;
          try { localStorage.setItem(RANGE_KEY, String(STATE.days)); } catch (e) {}
          rangeEl.querySelectorAll('button').forEach(x => x.classList.toggle('on', x === b));
          rerender();
        });
      });
    }

    /* タグの決定：ローカルがあれば即開始（待たない）。
       ログインの crTag が後から来て、それが違うタグなら差し替える。
       ＝ログイン済みユーザーは何もしなくてもアカウント側のタグが最終的に勝つ。 */
    let curTag = null;
    const startWith = (t, force) => {
      if (!t || (t === curTag && !force)) return;
      curTag = t; $('meTagInput').value = '#' + t; sync(t);
    };
    startWith(localTag());                       // 0ms で開始（キャッシュがあれば描画も0ms）
    if (window.CRAuth && CRAuth.onChange) {
      CRAuth.onChange((user, profile) => {
        const t = profile && profile.crTag ? cleanTag(profile.crTag) : null;
        if (t) { saveLocalTag(t); startWith(t); }   // アカウントのタグを正とする
      });
    }
  });
})();
