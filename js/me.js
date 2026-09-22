import '../auth.js?v=260817';
import { normalizeTag, bindTagInput, inPeriod, availablePeriod, graphBattles, battleTime, selectTrophySeries } from './experience-core.mjs?v=260817';
import { mountChart } from './me-chart.mjs?v=260817';
import { showBattle, showDeck, prefetchDeck, cardBuildLink, deckBuildLink } from './me-details.mjs?v=260817';
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
  let STATE = { data: null, meta: null, days: 1, requestedDays: null, competition: null };
  let disposeChart = () => {};
  const chartViews = new Map();

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
  const chip = (name, form, link=true) => '<span class="me-chip">' + (link ? cardBuildLink(name,form||'n') : cardImgTag(name,form||'n',{alt:name})) + '</span>';
  const parseT = t => { const m = String(t || '').match(/^(\d{4})(\d{2})(\d{2})T(\d{2})(\d{2})/); return m ? new Date(Date.UTC(+m[1], +m[2] - 1, +m[3], +m[4], +m[5])) : null; };
  const fmtDate = d => d ? (d.getMonth() + 1) + '/' + d.getDate() : '';

  /* ---- 描画 ---- */
  // 期間で絞る（days=0/未指定なら全部）。battles は新しい順。
  const inRange = inPeriod;
  function updateRange(all) {
    const result = availablePeriod(all, STATE.requestedDays);
    STATE.days = result.days;
    document.querySelectorAll('#meRange button').forEach(button => {
      const days = Number(button.dataset.days), hasData = days ? result.available.includes(days) : all.length > 0;
      button.disabled = !hasData && days !== STATE.days;
      if (days === 0) button.hidden = inRange(all, 365).length === all.length;
      button.classList.toggle('on', days === STATE.days);
      button.setAttribute('aria-pressed', String(days === STATE.days));
      button.title = hasData ? '' : 'グラフには異なる日時のトロフィー記録が2件以上必要です';
    });
  }
  function rerender() { if (STATE.data) renderAll(STATE.data, STATE.meta); }

  function renderAll(data, meta) {
    const series=selectTrophySeries(data);
    STATE.competition=series.kind;
    const ALL = data.battles || [];
    const chartHistory = series.rows;
    updateRange(chartHistory);
    const B = inRange(ALL, STATE.days);
    $('meTagSetup').hidden = true;
    $('meBody').hidden = false;

    const latest = chartHistory.find(b => Number.isFinite(b.tr) && b.tr > 0);
    const tr = latest ? latest.tr : null, band = bandOf(tr);
    const w = B.filter(b => b.win).length, draws = B.filter(b => b.draw).length, l = B.length - w - draws;
    const wr = B.length ? Math.round(w / B.length * 1000) / 10 : null;
    const cB = B.filter(b => Number.isFinite(b.tc) && Number.isFinite(b.oc));
    const crownDiff = cB.reduce((sum, b) => sum + b.tc - b.oc, 0);
    const crownAverage = cB.length ? crownDiff / cB.length : null;
    const signed = n => (n >= 0 ? '+' : '') + Number(n.toFixed(2));
    let name = null; try { name = localStorage.getItem('cr_name_' + data.tag) || null; } catch (e) {}
    const summary = '<div class="me-stats" aria-label="選択期間の戦績">'
      + '<div class="me-stat"><span>勝率</span><b>' + (wr == null ? '—' : wr + '<small>%</small>') + '</b></div>'
      + '<div class="me-stat"><span>勝敗</span><b>' + w + '<small>勝</small> ' + l + '<small>敗</small>'+(draws?' '+draws+'<small>分</small>':'')+'</b></div>'
      + '<div class="me-stat"><span>クラウン差 / 戦</span><b>' + (crownAverage == null ? '—' : signed(crownAverage)) + '</b>'
      + (cB.length && cB.length < B.length ? '<small>' + cB.length + '戦分</small>' : '') + '</div></div>';
    $('meHeader').innerHTML = '<div class="me-head"><div class="me-identity">'
      + '<span class="me-eyebrow">PLAYER PROFILE</span><div class="me-head-id"><b>' + esc(name || ('#' + data.tag)) + '</b>'
      + (name ? '<span class="me-tag">#' + esc(data.tag) + '</span>' : '') + '</div>'
      + (tr != null ? '<div class="me-head-band">🏆 ' + tr.toLocaleString() + '<span>'+ (STATE.competition==='ranked' ? 'ランク戦トロフィー' : STATE.competition==='trophy' ? 'トロフィーロード · 帯 '+band+'–'+(band+299) : '種別別の試合前記録') + '</span></div>' : '')
      + '</div>' + summary + '</div>'
      + '<div class="me-head-bottom"><p class="me-lead">'+(series.awaitingRanked ? 'ランク戦の参加実績はありますが推移は未取得です。取得済みのトロフィーロードを表示しています。' : data.history?.state === 'indexing' ? '保存済みの過去試合を照合中。見つかり次第、自動で反映します。' : data.history?.state === 'error' ? '過去分の照合を再試行しています。取得済みの記録を表示中。' : '登録前も含む、収集できた全履歴。')+'</p><span class="me-head-total">選択期間 ' + B.length + '戦 <small>／ 全' + ALL.length + '戦</small></span></div>';
    $('meRecordBody').innerHTML = B.length
      ? '<div class="me-result-line"><span><b>' + B.length + '</b> 戦の記録</span><span>' + w + '勝 · ' + l + '敗'+(draws?' · '+draws+'分':'')+'</span></div>'
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
        + '<span class="me-bar"><span class="me-bar-label">'+esc(r.k)+' <small>'+r.g+'戦</small></span><i style="width:' + r.share + '%"></i></span>'
        + '<span class="me-bar-num">' + r.share + '%<small>対面勝率 ' + r.wr + '%</small></span></div>').join('')
      + '</div><p class="note">複数の勝ち筋を持つ相手は、それぞれに数えています。</p>'
      + (weak.length ? '<h3>相手カード別の対面勝率（低い順）</h3><div class="me-weak">'
        + weak.map(x => '<span class="me-weak-card">' + chip(x.n) + '<span class="me-card-name">'+esc(x.n)+'</span><b>' + x.wr + '%</b><small>' + x.g + '戦</small></span>').join('') + '</div>' : '');

    /* あなたの帯のいま＋最優先の対策（帯の流行 × あなたの苦手） */
    renderBand(B, meta, tr, oppCard);

    /* トロフィー推移（時間軸つき） */
    renderTrend(inRange(chartHistory, STATE.days));

    if (window.CRI18N) CRI18N.apply();
  }

  function renderDecks(B, meta) {
    const decks = STATE.data?.periods?.[STATE.days]?.decks || [];
    $('meDecksBody').innerHTML = decks.length ? '<p class="note">デッキを選ぶと対戦詳細へ。カードを選ぶと、そのカードを軸にデッキを組めます。8枚が記録されている '+decks.reduce((n,d)=>n+d.games,0)+' / '+B.length+'戦が対象です。</p>'
      + decks.map((dk, i) => '<div class="me-deck-item"><button type="button" class="me-deck me-deck-open" data-deck="'+i+'" aria-label="デッキ '+(i+1)+' の対戦詳細">'
      + '<div class="me-deck-cards">'+dk.deck.map((n,j)=>chip(n,fAt(dk.forms,j),false)).join('')+'</div>'
      + '<div class="me-deck-stat"><b>'+dk.winRate+'%</b><span>'+dk.wins+'勝 '+dk.losses+'敗'+(dk.draws?' '+dk.draws+'分':'')+'</span><small>'+dk.games+'戦 · 対戦詳細 ↗</small></div></button>'+deckBuildLink(dk.deck,dk.forms)+'</div>').join('')
      : '<p class="note">自分のデッキが記録されている試合を読み込むと表示します。</p>';
    $('meDecksBody').querySelectorAll('[data-deck]').forEach(button=>{
      const args=()=>[decks[+button.dataset.deck],STATE.data.tag,STATE.days];
      button.addEventListener('click',()=>showDeck(...args()));
      for(const event of ['pointerenter','focus'])button.addEventListener(event,()=>prefetchDeck(...args()).catch(()=>{}),{once:true});
    });
  }

  /* あなたの帯のいま＋「最優先の対策」（帯で流行 × あなたが苦手 の交差＝このサイトにしか出せない掛け算） */
  function renderBand(B, meta, tr, oppCard) {
    const ranked = STATE.competition==='ranked';
    $('meBand').querySelector('h2').textContent = ranked ? 'ランク戦全体のいま' : STATE.competition==='trophy' ? 'あなたの帯のいま' : '対戦種別の記録';
    $('meBandWhen').textContent = '';
    if (STATE.competition !== 'trophy') {
      const stats=ranked&&meta?.polCardIntel, rows=Object.entries(stats?.byOpponentCard||{}).sort((a,b)=>b[1].games-a[1].games).slice(0,10);
      $('meBandBody').innerHTML=rows.length ? '<h3>収集したランク戦でよく対面するカード</h3><div class="me-weak">'+rows.map(([n,v])=>'<span class="me-weak-card">'+chip(n)+'<span class="me-card-name">'+esc(n)+'</span><b>'+v.games.toLocaleString()+'戦</b></span>').join('')+'</div><p class="note">CRDBが収集したランク戦全体の対面件数です。通常トロフィー帯の統計は混ぜていません。</p>' : '<p class="note">対応する種別の全体統計はありません。左側には実際に対面した相手を表示しています。</p>';
      if(stats)$('meBandWhen').textContent='直近'+stats.windowDays+'日の集計';
      return;
    }
    let bandHtml = '<p class="note">帯のデータを読み込めませんでした。</p>';
    const tb = meta && meta.trophyBandIntel;
    if (tb && tb.byBand && tr != null) {
      let best = null, bestKey = null;
      Object.keys(tb.byBand).forEach(k => {
        const m = k.match(/^(\d+)-(\d+)$/); if (!m) return;
        if (tr >= (+m[1]) && tr <= (+m[2])) {
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
          ? '<h3>対策候補 · 帯の流行と低い対面勝率が重なるカード</h3><div class="me-weak">'
            + priority.map(r => '<span class="me-weak-card prio">' + chip(r.n)
              + '<b>' + Math.round(r.me.w / r.me.g * 100) + '%</b><small>帯で' + r.g + '戦</small></span>').join('')
            + '</div><p class="note">対策の仕方はカード名タップ→カードページの「どの呪文で落ちるか」「よく一緒に使われるカード」が手がかりになります。</p>'
          : (B.length >= 10 ? '<p class="note">今の収集範囲では、流行上位と低い対面勝率が重なるカードはありません。</p>' : '');
        bandHtml = prio + '<h3>帯 ' + bestKey + ' でよく使われているカード</h3><div class="me-weak">'
          + rows.slice(0, 10).map(x => '<span class="me-weak-card">' + chip(x.n) + '<b>' + (x.wr != null ? x.wr + '%' : '—') + '</b><small>' + x.g + '戦</small></span>').join('')
          + '</div>';
      }
    }
    $('meBandBody').innerHTML = bandHtml;
  }

  function renderTrend(B) {
    disposeChart();
    const el = $('meTrendBody'), seq = graphBattles(B), last=seq.at(-1), first=seq[0];
    const diff=seq.length>=2?last.tr-first.tr:null;
    el.innerHTML='<div class="me-trend-head"><div class="me-trend-now"><span>'+ (STATE.competition==='ranked'?'ランク戦トロフィー推移':'トロフィー推移') +'</span><b>'+(last?last.tr.toLocaleString():'—')+'</b><small>最終記録・試合前</small></div>'
      +(diff!=null?'<div class="me-trend-diff '+(diff>=0?'up':'down')+'">'+(diff>=0?'+':'')+diff.toLocaleString()+'</div>':'')
      +'<div class="me-trend-span">'+(first?fmtDate(new Date(battleTime(first.t)))+'〜'+fmtDate(new Date(battleTime(last.t)))+' · '+seq.length+'件':'')+'</div></div><div id="meChart"></div>'+efficiencyHtml();
    const key=STATE.data.tag+':'+STATE.competition+':'+STATE.days;
    if(!chartViews.has(key))chartViews.set(key,{});
    disposeChart=mountChart($('meChart'),B,chartViews.get(key),showBattle);
  }
  function efficiencyHtml() {
    const e=(STATE.data?.competitions?.groups?.find(g=>g.id===STATE.competition)?.periods || STATE.data?.periods)?.[STATE.days]?.efficiency;
    if(!e)return '<p class="note">トロフィー効率を確認中…</p>';
    const signed=n=>n==null?'—':(n>=0?'+':'')+Number(n.toFixed(1)).toLocaleString();
    return '<div class="me-efficiency"><div class="me-eff-item"><span>記録期間の純増</span><b>'+signed(e.net)+'<small>🏆</small></b><small>'+(e.elapsedDays<1?(e.elapsedDays*1440<1?'1分未満':Math.round(e.elapsedDays*1440)+'分'):Number(e.elapsedDays.toFixed(1))+'日間')+'の始点 → 終点</small></div>'
      +'<div class="me-eff-item"><span>暦日あたり</span><b>'+signed(e.perDay)+'<small>🏆 / 日</small></b><small>'+(e.elapsedDays<1?'1日未満の記録を24時間に換算':'記録期間の純増 ÷ 経過日数')+'</small></div>'
      +'<div class="me-eff-item"><span>1試合あたりの実増減</span><b>'+signed(e.perMatch)+'<small>🏆 / 戦</small></b><small>増減を取得できた '+e.exactMatches+' / '+e.totalMatches+'戦</small></div></div>'
      +'<p class="me-eff-note">暦日には遊んでいない日も含み、空白期間の未収集試合やシーズンリセットの影響を含む場合があります。1戦あたりは取得した実増減のみ。勝率や試合間隔をプレイ時間に換算していません。'+(e.perPlayHour!=null?'実時間を取得できた'+e.timedMatches+'戦では '+signed(e.perPlayHour)+' 🏆 / プレイ時間1時間。':'')+'</p>';
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
    STATE.data = null; STATE.days = 1; STATE.requestedDays = null; STATE.competition = null; STATE.requestedCompetition = null;
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
      if(j.history?.state === 'indexing' || j.history?.state === 'error') scheduleHistoryRefresh(tag,revision);
    } catch (e) {
      if (revision !== syncRevision) return;
      if (cached && cached.battles) return;                  // キャッシュが出ているなら黙って諦める
      err.textContent = '取得できませんでした：' + (e && e.message || e) + '（タグをもう一度確認してください）';
      err.hidden = false;
      $('meBody').hidden = true;
      $('meTagSetup').hidden = false;
    }
  }

  let historyTimer;
  function scheduleHistoryRefresh(tag, revision) {
    clearTimeout(historyTimer);
    historyTimer=setTimeout(async()=>{
      if(revision!==syncRevision || document.hidden){ if(revision===syncRevision)scheduleHistoryRefresh(tag,revision); return; }
      try {
        const r=await fetch('/api/me/sync?tag='+encodeURIComponent(tag),{cache:'no-store'});
        if(!r.ok)throw new Error('sync');const j=await r.json();if(revision!==syncRevision)return;
        const changed=JSON.stringify(j.battles)!==JSON.stringify(STATE.data?.battles);
        STATE.data=j;writeCache(tag,j);if(changed)renderAll(j,STATE.meta);
        else if(j.history?.state==='complete')renderAll(j,STATE.meta);
        if(j.history?.state!=='complete')scheduleHistoryRefresh(tag,revision);
      } catch { if(revision===syncRevision)scheduleHistoryRefresh(tag,revision); }
    },15000);
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
          STATE.days = +b.dataset.days; STATE.requestedDays = STATE.days;
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

  }
  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', initMe, { once: true });
  else initMe();
})();
