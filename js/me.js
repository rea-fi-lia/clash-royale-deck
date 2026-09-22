import '../auth.js?v=260813';
import { normalizeTag, bindTagInput, inPeriod, availablePeriod, trophyEfficiency } from './experience-core.mjs?v=260813';
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
  let STATE = { data: null, meta: null, days: 1 };

  function localTag() { try { return (localStorage.getItem(TAG_KEY) || '').trim() || null; } catch (e) { return null; } }
  function readCache(t) { try { return JSON.parse(localStorage.getItem(CACHE_KEY(t)) || 'null'); } catch (e) { return null; } }
  function writeCache(t, d) { try { localStorage.setItem(CACHE_KEY(t), JSON.stringify(d)); } catch (e) {} }
  function saveLocalTag(t) { try { localStorage.setItem(TAG_KEY, t); } catch (e) {} }
  const cleanTag = normalizeTag;

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
  const inRange = inPeriod;
  function updateRange(all) {
    const result = availablePeriod(all, STATE.days);
    STATE.days = result.days;
    document.querySelectorAll('#meRange button').forEach(button => {
      const days = Number(button.dataset.days), hasData = days ? result.available.includes(days) : all.length > 0;
      button.disabled = !hasData;
      if (days === 0) button.hidden = inRange(all, 365).length === all.length;
      button.classList.toggle('on', days === STATE.days);
      button.setAttribute('aria-pressed', String(days === STATE.days));
      button.title = hasData ? '' : 'この期間の記録はありません';
    });
  }
  function rerender() { if (STATE.data) renderAll(STATE.data, STATE.meta); }

  function renderAll(data, meta) {
    const ALL = data.battles || [];
    updateRange(ALL);
    const B = inRange(ALL, STATE.days);
    $('meTagSetup').hidden = true;
    $('meBody').hidden = false;

    const latest = ALL.find(b => Number.isFinite(b.tr) && b.tr > 0);
    const tr = latest ? latest.tr : null, band = bandOf(tr);
    const w = B.filter(b => b.win).length, l = B.length - w;
    const wr = B.length ? Math.round(w / B.length * 1000) / 10 : null;
    const cB = B.filter(b => Number.isFinite(b.tc) && Number.isFinite(b.oc));
    const crownDiff = cB.reduce((sum, b) => sum + b.tc - b.oc, 0);
    const crownAverage = cB.length ? crownDiff / cB.length : null;
    const signed = n => (n >= 0 ? '+' : '') + Number(n.toFixed(2));
    let name = null; try { name = localStorage.getItem('cr_name_' + data.tag) || null; } catch (e) {}
    const summary = '<div class="me-stats" aria-label="選択期間の戦績">'
      + '<div class="me-stat"><span>勝率</span><b>' + (wr == null ? '—' : wr + '<small>%</small>') + '</b></div>'
      + '<div class="me-stat"><span>勝敗</span><b>' + w + '<small>勝</small> ' + l + '<small>敗</small></b></div>'
      + '<div class="me-stat"><span>クラウン差 / 戦</span><b>' + (crownAverage == null ? '—' : signed(crownAverage)) + '</b>'
      + (cB.length && cB.length < B.length ? '<small>' + cB.length + '戦分</small>' : '') + '</div></div>';
    $('meHeader').innerHTML = '<div class="me-head"><div class="me-identity">'
      + '<span class="me-eyebrow">PLAYER PROFILE</span><div class="me-head-id"><b>' + esc(name || ('#' + data.tag)) + '</b>'
      + (name ? '<span class="me-tag">#' + esc(data.tag) + '</span>' : '') + '</div>'
      + (tr != null ? '<div class="me-head-band">🏆 ' + tr.toLocaleString() + '<span>帯 ' + band + '–' + (band + 299) + '</span></div>' : '')
      + '</div>' + summary + '</div>'
      + '<div class="me-head-bottom"><p class="me-lead">あなたの戦績と、あなたのトロフィー帯のいま。</p><span class="me-head-total">選択期間 ' + B.length + '戦 <small>／ 全' + ALL.length + '戦</small></span></div>';
    $('meRecordBody').innerHTML = B.length
      ? '<div class="me-result-line"><span><b>' + B.length + '</b> 戦の記録</span><span>' + w + '勝 · ' + l + '敗</span></div>'
        + '<div class="me-result-bar" role="img" aria-label="勝率 ' + wr + '%"><span style="width:' + wr + '%"></span></div>'
      : '<p class="note">まだ試合の記録がありません。1対1の試合を遊ぶと、開くたびにここへ貯まっていきます。</p>';

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
    const seq = B.filter(b => Number.isFinite(b.tr) && b.tr > 0 && parseT(b.t)).slice().sort((a,b) => parseT(a.t) - parseT(b.t));  // 古→新
    const efficiency = efficiencyHtml(B);
    if (seq.length < 2) { el.innerHTML = '<p class="note">トロフィーの記録が2戦以上たまると推移を表示します。</p>' + efficiency; return; }
    const pts = seq.map(b => b.tr);
    const t0 = parseT(seq[0].t), t1 = parseT(seq[seq.length - 1].t);
    const span = Math.max(1, t1 - t0);
    const tick = d => fmtDate(d) + (span < 864e5 ? ' ' + String(d.getHours()).padStart(2,'0') + ':' + String(d.getMinutes()).padStart(2,'0') : '');
    const rawMin = Math.min(...pts), rawMax = Math.max(...pts);
    const pad = Math.max(30, Math.round((rawMax - rawMin) * 0.18));
    const min = rawMin - pad, max = rawMax + pad, vspan = Math.max(1, max - min);
    const W = Math.max(300, Math.round(el.clientWidth || 900));
    const H = Math.max(210, Math.min(290, W * .29)), L = 56, R = 20, T = 20, Bm = 36;
    const X = i => L + (parseT(seq[i].t) - t0) / span * (W - L - R);
    const Y = v => (H - Bm) - (v - min) / vspan * (H - T - Bm);
    const line = pts.map((v, i) => (i && parseT(seq[i].t) - parseT(seq[i-1].t) <= 864e5 && Math.abs(v - pts[i-1]) <= 60 ? 'L' : 'M') + X(i).toFixed(1) + ',' + Y(v).toFixed(1)).join(' ');
    const area = line.split('M').filter(Boolean).map(part => { const coords = part.trim().split(/[ L]+/); return 'M' + part + ' L' + coords.at(-1).split(',')[0] + ',' + (H - Bm) + ' L' + coords[0].split(',')[0] + ',' + (H - Bm) + ' Z'; }).join(' ');
    const grid = [...new Set([rawMax, Math.round((rawMax + rawMin) / 2), rawMin])].map(v =>
      '<line x1="' + L + '" x2="' + (W - R) + '" y1="' + Y(v).toFixed(1) + '" y2="' + Y(v).toFixed(1) + '" class="me-grid"/>'
      + '<text x="' + (L - 12) + '" y="' + (Y(v) + 4).toFixed(1) + '" text-anchor="end" class="me-ax">' + v.toLocaleString() + '</text>').join('');
    const last = pts[pts.length - 1], first = pts[0], diff = last - first;
    const dots = seq.map((b, i) => '<circle cx="' + X(i).toFixed(1) + '" cy="' + Y(b.tr).toFixed(1) + '" r="3" class="'
      + (b.win ? 'me-dot-w' : 'me-dot-l') + '"><title>' + fmtDate(parseT(b.t)) + ' ' + b.tr.toLocaleString()
      + (b.win ? ' 勝ち' : ' 負け') + '</title></circle>').join('');
    el.innerHTML =
      '<div class="me-trend-head">'
      + '<div class="me-trend-now"><span>トロフィー推移</span><b>' + last.toLocaleString() + '</b><small>最終記録・試合前</small></div>'
      + '<div class="me-trend-diff ' + (diff >= 0 ? 'up' : 'down') + '">' + (diff >= 0 ? '+' : '') + diff.toLocaleString() + '</div>'
      + '<div class="me-trend-span">' + fmtDate(t0) + '〜' + fmtDate(t1) + '・' + seq.length + '戦</div>'
      + '</div>'
      + '<div class="me-chart-scroll"><svg viewBox="0 0 ' + W + ' ' + H + '" class="me-trend" role="img" aria-label="トロフィー推移">'
      + '<defs><linearGradient id="meGrad" x1="0" y1="0" x2="0" y2="1">'
      + '<stop offset="0%" stop-color="var(--accent)" stop-opacity=".38"/>'
      + '<stop offset="100%" stop-color="var(--accent)" stop-opacity="0"/></linearGradient></defs>'
      + grid
      + '<path d="' + area + '" fill="url(#meGrad)"/>'
      + '<path d="' + line + '" fill="none" stroke="var(--accent)" stroke-width="2.8" stroke-linejoin="round" stroke-linecap="round"/>'
      + dots
      + '<text x="' + L + '" y="' + (H - 8) + '" class="me-ax">' + tick(t0) + '</text>'
      + '<text x="' + (W - R) + '" y="' + (H - 8) + '" class="me-ax" text-anchor="end">' + tick(t1) + '</text>'
      + '</svg></div><p class="me-chart-caption"><span>● 勝ち</span><span>● 負け</span>各点は試合開始時のトロフィー。空白期間には未記録の試合が含まれる場合があります。</p>' + efficiency;
  }

  function efficiencyHtml(battles) {
    const e = trophyEfficiency(battles);
    const value = e.percent == null ? '—' : Math.round(e.percent) + '<small>%</small>';
    return '<div class="me-efficiency"><div class="me-eff-title"><span>推定トロフィー効率</span><b>' + value + '</b></div>'
      + '<div class="me-eff-detail"><div><span class="me-positive">獲得 +' + e.gain + '</span><span class="me-negative">減少 −' + e.loss + '</span><span>純増 ' + (e.net >= 0 ? '+' : '') + e.net + '</span></div>'
      + '<p>獲得量 ÷（獲得量＋減少量）。30分以内の連続記録 ' + e.intervals + '区間から推定。50%を超えると獲得が減少を上回ります。長い空白・リセットと思われる変動・結果と矛盾する変動は除外。最新試合の増減はまだ含みません。</p>'
      + (e.percent == null ? '<p>比較できる増減がたまると算出します。</p>' : '') + '</div></div>';
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
  let syncRevision = 0;
  async function sync(tag) {
    const revision = ++syncRevision;
    STATE.data = null; STATE.days = 1;
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
      if (revision !== syncRevision) return;
      STATE.meta = meta || STATE.meta;
      STATE.data = j;
      saveLocalTag(tag); writeCache(tag, j);
      renderAll(j, STATE.meta);
    } catch (e) {
      if (revision !== syncRevision) return;
      if (cached && cached.battles) return;                  // キャッシュが出ているなら黙って諦める
      err.textContent = '取得できませんでした：' + (e && e.message || e) + '（タグをもう一度確認してください）';
      err.hidden = false;
      $('meBody').hidden = true;
      $('meTagSetup').hidden = false;
    }
  }

  /* ---- 初期化 ---- */
  function initMe() {
    bindTagInput($('meTagInput'));
    $('meTagSave').addEventListener('click', async () => {
      const t = cleanTag($('meTagInput').value);
      if (t.length < 3) { $('meTagError').textContent = 'タグが短すぎます'; $('meTagError').hidden = false; return; }
      try {
        if (window.CRAuth?.getUser()) await CRAuth.setCrTag(t);
        saveLocalTag(t); startWith(t, true);
      } catch { $('meTagError').textContent = 'タグを保存できませんでした。接続を確認して、もう一度お試しください。'; $('meTagError').hidden = false; }
    });
    $('meTagInput').addEventListener('keydown', e => { if (e.key === 'Enter' && !e.isComposing && e.keyCode !== 229) $('meTagSave').click(); });
    $('meTagChange').addEventListener('click', () => {
      $('meBody').hidden = true; $('meTagSetup').hidden = false; $('meTagInput').value = '';
      curTag = null; syncRevision++; STATE.data = null;
      try { localStorage.removeItem(TAG_KEY); } catch (e) {}
      // ログイン中はアカウント側のタグが正なので、その旨を出す（勝手に戻って混乱しないように）
      const p = window.CRAuth && CRAuth.getProfile && CRAuth.getProfile();
      const err = $('meTagError');
      if (p && p.crTag) {
        err.textContent = 'ログイン中のアカウントには #' + cleanTag(p.crTag) + ' が登録されています。ここで保存すると登録タグも更新されます。';
        err.hidden = false;
      }
    });

    // 期間の切り替え（再取得はしない＝手元のデータを絞るだけなので一瞬）
    STATE.days = 1;
    const rangeEl = $('meRange');
    if (rangeEl) {
      rangeEl.querySelectorAll('button').forEach(b => {
        b.classList.toggle('on', +b.dataset.days === STATE.days);
        b.addEventListener('click', () => {
          STATE.days = +b.dataset.days;
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
      curTag = cleanTag(t); $('meTagInput').value = curTag; sync(curTag);
    };
    if (!window.CRAuth?.hasSession()) startWith(localTag());                       // 0ms で開始（キャッシュがあれば描画も0ms）
    if (window.CRAuth && CRAuth.onChange) {
      CRAuth.onChange((user, profile) => {
        const t = profile && profile.crTag ? cleanTag(profile.crTag) : null;
        if (t) { saveLocalTag(t); startWith(t); }
        else if (!user) startWith(localTag());   // アカウントのタグを正とする
      });
    }
    window.addEventListener('cr-owned-cards', rerender);
    let resizeTimer;
    window.addEventListener('resize', () => { clearTimeout(resizeTimer); resizeTimer = setTimeout(rerender, 150); });
  }
  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', initMe, { once: true });
  else initMe();
})();
