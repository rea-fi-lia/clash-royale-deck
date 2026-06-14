/* =============================================================
 *  デッキ診断 v2（§8.11 D1 + アンチシナジー + 初手事故率）
 *  - 構造: 大枠（総評・事故率・警告）→ <details>で詳細チェック
 *  - 材料: card-stats.json / card-tags.json / card-potential.json（素出し適性solo）
 *  - β運用: しきい値・文言は随時調整
 *  ★WINCONS は GASのARCH_WINCONS / decks.jsのME_ARCH_WINCONS と同一に保つこと（3箇所同期）
 * ============================================================= */
const WINCONS = ['ラヴァハウンド', 'ゴーレム', 'エレクトロジャイアント', 'エリクサーゴーレム', '三銃士',
  'ゴブジャイアント', 'ジャイアント', '巨大スケルトン', 'スパーキー', '見習い親衛隊', 'ペッカ', 'メガナイト',
  'ボスアサシン', 'ロイヤルジャイアント', '巨大クロスボウ', '迫撃砲', 'エアバルーン', 'スケルトンバレル',
  'ホグライダー', 'ロイヤルホグ', 'ラムライダー', '攻城バーバリアン', 'エリートバーバリアン', 'プリンス',
  'ゴブリンマシン', 'ゴブリンシュタイン', 'モンク', 'アーチャークイーン', 'ゴールドナイト', 'スケルトンラッシュ',
  'ゴブリンバレル', 'ゴブリンドリル', 'ウォールブレイカー', 'マイティディガー', 'ディガー', 'ロケット'];

const RAW = 'https://raw.githubusercontent.com/rea-fi-lia/clash-royale-deck/data/';
const SPELL_ZONES = ['ログ圏内', 'ザップ圏内', '矢の雨圏内', 'ファイボ圏内', 'ポイズン圏内', 'ライトニング圏内', 'ロケット圏内'];
function _t(k, v) { return window.CRI18N ? CRI18N.t(k, v) : k; }
function _tr(s) { return window.CRI18N ? CRI18N.tr(s) : s; }

let STATS = null, TAGS = null, POT = null, WEIGHTS = null, DECK = null, META = null, MATCH = null;

function parseDeck() {
  const q = new URLSearchParams(location.search);
  const names = (q.get('deck') || '').split(',').map(s => s.trim()).filter(Boolean);
  const f = (q.get('f') || '').split('');
  if (names.length !== 8) return null;
  const deck = [];
  for (let i = 0; i < 8; i++) {
    const info = CARD_INFO[names[i]];
    if (!info) return null;
    const fm = (f[i] === 'e' && info.iv) ? 'e' : (f[i] === 'h' && info.ih) ? 'h' : 'n';
    deck.push({ name: names[i], f: fm, info });
  }
  return deck;
}
function mark(c) { return c.f === 'e' ? '⚡' : c.f === 'h' ? '👑' : ''; }
function tagsOf(c) { if (!TAGS) return []; const e = TAGS[c.name + mark(c)] || TAGS[c.name]; return (e && e.tags) || []; }
function potOf(c) { if (!POT) return null; return POT[c.name + mark(c)] || POT[c.name] || null; }
function statOf(c) { return (STATS && STATS[c.name]) || null; }
function has(c, key) { return tagsOf(c).indexOf(key) >= 0; }
function inZone(c, z) { const s = statOf(c); return s && (s.tags || []).indexOf(z) >= 0; }
function isSpell(c) { const s = statOf(c); return s && s.n && s.n.type === 'Spell'; }
function chip(c) {
  const img = c.f === 'e' ? c.info.iv : c.f === 'h' ? c.info.ih : c.info.i;
  return '<span class="dg-chip"><img src="' + img + '" alt="' + c.name + '"><span>' + c.name + '</span>' + mark(c) + '</span>';
}
function C(n, k) { if (k > n) return 0; let r = 1; for (let i = 0; i < k; i++) r = r * (n - i) / (i + 1); return Math.round(r); }

function buildChecks(deck) {
  const units = deck.filter(c => !isSpell(c));
  const spells = deck.filter(c => isSpell(c));
  const checks = [];
  function add(grade, title, detail, cards) { checks.push({ grade, title, detail, cards: cards || [] }); }

  const wins = deck.filter(c => WINCONS.indexOf(c.name) >= 0);
  add(wins.length ? 'ok' : 'bad', _tr('勝ち筋'),
    wins.length ? _t('diag.winconN', { n: wins.length }) : _tr('タワーへの明確なダメージ源がありません'), wins);

  const airU = units.filter(c => has(c, 'air') || (statOf(c) && statOf(c).n && statOf(c).n.air));
  add(airU.length >= 3 ? 'good' : airU.length === 2 ? 'ok' : airU.length === 1 ? 'warn' : 'bad',
    _tr('対空'), _t('diag.airN', { n: airU.length }), airU);

  const splashU = units.filter(c => has(c, 'splash') || (statOf(c) && statOf(c).n && statOf(c).n.splash));
  const dmgSp = spells.filter(c => { const s = statOf(c); return s && (s.tags || []).some(t => t === '小呪文' || t === '中呪文' || t === '大呪文'); });
  const swarmN = splashU.length + dmgSp.length;
  add(swarmN >= 3 ? 'good' : swarmN === 2 ? 'ok' : swarmN === 1 ? 'warn' : 'bad',
    _tr('群れ対策'), _t('diag.swarmN', { a: splashU.length, b: dmgSp.length }), splashU.concat(dmgSp));

  const tk = deck.filter(c => has(c, 'tankKiller'));
  const hiDps = units.filter(c => { const s = statOf(c); return s && s.dps16 >= 400; });
  const bldDef = deck.filter(c => has(c, 'defBuilding'));
  const midDps = units.filter(c => { const s = statOf(c); return s && s.dps16 >= 300; });
  const tkGrade = tk.length ? 'good' : hiDps.length ? 'ok' : (bldDef.length && midDps.length) ? 'warn' : 'bad';
  add(tkGrade, _tr('タンク処理'),
    tk.length ? _t('diag.tankKillerN', { n: tk.length })
      : hiDps.length ? _tr('専任はいませんが高DPSで代用できます')
      : (bldDef.length && midDps.length) ? _tr('専任なし。建物釣り＋集中砲火で凌ぐ型です')
      : _tr('ジャイアント級に苦戦しやすい構成です'),
    tk.length ? tk : hiDps.length ? hiDps : midDps);

  add(bldDef.length ? 'good' : 'info', _tr('防衛建物'),
    bldDef.length ? _t('diag.bldN', { n: bldDef.length }) : _tr('なし。ホグ・攻城系の受けはユニットで工夫を'), bldDef);

  const spSmall = spells.filter(c => (statOf(c).tags || []).indexOf('小呪文') >= 0);
  const spBig = spells.filter(c => { const t = statOf(c).tags || []; return t.indexOf('中呪文') >= 0 || t.indexOf('大呪文') >= 0; });
  add(spells.length === 0 ? 'bad' : spells.length === 1 ? 'warn' : spells.length <= 3 ? 'good' : 'warn',
    _tr('呪文構成'), _t('diag.spellsN', { n: spells.length, s: spSmall.length, b: spBig.length }), spells);

  const ctrl = deck.filter(c => ['stun', 'stop', 'knockback', 'pull', 'slow'].some(k => has(c, k)));
  add(ctrl.length ? 'good' : 'warn', _tr('リセット・妨害'),
    ctrl.length ? _t('diag.ctrlN', { n: ctrl.length }) : _tr('なし。インフェルノ系・チャージ系・ランプ系に注意'), ctrl);

  SPELL_ZONES.forEach(z => {
    const zu = units.filter(c => inZone(c, z));
    const cheap = (z === 'ログ圏内' || z === 'ザップ圏内' || z === '矢の雨圏内');
    if (zu.length >= (cheap ? 3 : 4)) add('warn', _tr(z), _t('diag.zoneN', { n: zu.length }), zu);
  });

  return { checks, units, spells, wins, airU };
}

// ★アンチシナジー（悪い掛け算）検知。断定せず「〜しやすい」調で。
function buildAntiSynergy(deck, ctx) {
  const out = [];
  // A) 対空が少なく、その全員が同じ中型呪文圏内
  if (ctx.airU.length > 0 && ctx.airU.length <= 2) {
    const allFb = ctx.airU.every(c => inZone(c, 'ファイボ圏内'));
    if (allFb) out.push({ title: _tr('対空の一掃リスク'), detail: _t('diag.asAirSpell', { n: ctx.airU.length }), cards: ctx.airU });
  }
  // B) 小型呪文でまとめて消える駒が多い（ベイト意図が薄い場合のみ）
  const logZone = ctx.units.filter(c => inZone(c, 'ログ圏内') || inZone(c, '矢の雨圏内'));
  const baitN = deck.filter(c => has(c, 'spellBait')).length;
  if (logZone.length >= 4 && baitN < 3) {
    out.push({ title: _tr('小型呪文に弱い'), detail: _t('diag.asLog', { n: logZone.length }), cards: logZone });
  }
  // C) 重量勝ち筋の重複
  const heavyWins = ctx.wins.filter(c => c.info.c >= 6);
  if (heavyWins.length >= 2) {
    out.push({ title: _tr('重い勝ち筋の重複'), detail: _tr('高コストの主軸が複数あると、エリクサーが足りず両方とも腐りやすくなります'), cards: heavyWins });
  }
  return out;
}

// ★初手事故率：素出し適性（ポテンシャルタブ solo）が△/—のカードが初手4枚を独占する確率
function openingRisk(deck) {
  if (!POT) return null;
  const bad = deck.filter(c => { const p = potOf(c); const s = p && p.solo; return s === '△' || s === '—' || s === '-'; });
  const p = C(bad.length, 4) / C(8, 4);
  return { badN: bad.length, pct: Math.round(p * 1000) / 10, cards: bad };
}

// ★レーダーチャート（card-weights.json＝軸別1〜5の監修値から6軸を算出）
//   基準値REFは「強いデッキでだいたい100になる」チューニング定数。β運用で随時調整。
function radarHtml(deck, open) {
  if (!WEIGHTS) return '';
  const sums = { atk: 0, defG: 0, defA: 0, swarm: 0, ctrl: 0 };
  let hit = 0;
  deck.forEach(c => {
    const w = WEIGHTS[c.name + mark(c)] || WEIGHTS[c.name];
    if (!w) return;
    hit++;
    sums.atk += w.atk || 0; sums.defG += w.defG || 0; sums.defA += w.defA || 0;
    sums.swarm += w.swarm || 0; sums.ctrl += w.ctrl || 0;
  });
  if (hit < 6) return '';
  const avg = deck.reduce((s, c) => s + c.info.c, 0) / 8;
  let cyc = Math.max(5, Math.min(100, (4.6 - avg) / 2.0 * 100));
  if (open && open.pct >= 5) cyc = Math.max(5, cyc - 20); // 初手事故率が高いと安定性減点
  const REF = { atk: 16, defA: 12, defG: 18, swarm: 12, ctrl: 8 }; // β調整中（2.6ホグ=攻撃88が目安になるよう16に）
  const pct = k => Math.max(4, Math.min(100, Math.round(sums[k] / REF[k] * 100)));
  const axes = [
    { l: _tr('攻撃圧'), v: pct('atk') },
    { l: _tr('対空'), v: pct('defA') },
    { l: _tr('地上防衛'), v: pct('defG') },
    { l: _tr('小物処理'), v: pct('swarm') },
    { l: _tr('妨害'), v: pct('ctrl') },
    { l: _tr('回転・安定'), v: Math.round(cyc) }
  ];
  const CX = 150, CY = 122, R = 84, N = 6;
  const pt2 = (i, r) => { const a = -Math.PI / 2 + i * 2 * Math.PI / N; return [(CX + r * Math.cos(a)).toFixed(1), (CY + r * Math.sin(a)).toFixed(1)]; };
  let grid = '';
  [25, 50, 75, 100].forEach(g => {
    const ps = []; for (let i = 0; i < N; i++) ps.push(pt2(i, R * g / 100).join(','));
    grid += '<polygon points="' + ps.join(' ') + '" fill="none" stroke="rgba(255,255,255,.08)"/>';
  });
  let spokes = '';
  for (let i = 0; i < N; i++) { const p = pt2(i, R); spokes += '<line x1="' + CX + '" y1="' + CY + '" x2="' + p[0] + '" y2="' + p[1] + '" stroke="rgba(255,255,255,.08)"/>'; }
  const poly = axes.map((a, i) => pt2(i, R * a.v / 100).join(',')).join(' ');
  let labels = '';
  axes.forEach((a, i) => {
    const p = pt2(i, R + 22);
    labels += '<text x="' + p[0] + '" y="' + p[1] + '" text-anchor="middle" font-size="10" fill="#8a90a0">' + a.l + '</text>'
      + '<text x="' + p[0] + '" y="' + (parseFloat(p[1]) + 12) + '" text-anchor="middle" font-size="10" font-weight="700" fill="#e8eaf0">' + a.v + '</text>';
  });
  return '<div class="dg-radar"><svg viewBox="0 0 300 258" xmlns="http://www.w3.org/2000/svg">'
    + grid + spokes
    + '<polygon points="' + poly + '" fill="rgba(58,142,240,.30)" stroke="#3a8ef0" stroke-width="2"/>'
    + labels + '</svg>'
    + '<div class="dg-radar-note">' + _tr('β：ウェイト監修中。タグ表の精度が上がるほどチャートも正確になります') + '</div></div>';
}

// ★相性表（§8.11 D2）：自デッキの代表勝ち筋 vs 環境上位勝ち筋の実戦勝率（matchups.json）
function selfArchs(deck) {
  // WINCONS順＝オーナー監修の優先度。デッキ内の勝ち筋を形態サフィックス付きで返す
  const out = [];
  WINCONS.forEach(w => { const c = deck.find(x => x.name === w); if (c) out.push(c.name + mark(c)); });
  return out;
}
function matchupHtml(deck) {
  if (!MATCH || !META || !META.length) return '';
  const archs = selfArchs(deck);
  if (!archs.length) return '';
  const self = archs[0]; // 代表勝ち筋
  // 全月合算（現状1ヶ月。将来は「直近1ヶ月優先＋薄いペアを全期間ブレンド」に拡張）
  const pair = {}, months = MATCH.months || {};
  Object.keys(months).forEach(mk => {
    const bk = months[mk] || {};
    Object.keys(bk).forEach(k => { const v = bk[k]; if (!Array.isArray(v)) return; pair[k] = pair[k] || [0, 0]; pair[k][0] += v[0]; pair[k][1] += v[1]; });
  });
  const MIN = 40;
  const rows = [];
  META.slice(0, 14).forEach(m => {
    if (!m || m.k === self) return; // 同じ勝ち筋＝ミラー寄りノイズは除外
    const gw = pair[self + '|' + m.k];
    if (!gw || gw[0] < MIN) return;
    rows.push({ opp: m.k, share: m.share, wr: Math.round(gw[1] / gw[0] * 1000) / 10, games: gw[0] });
  });
  if (rows.length < 2) return '';
  rows.sort((a, b) => b.share - a.share); // 環境で多い相手から
  const rowHtml = rows.map(r => {
    const cls = r.wr >= 55 ? 'mu-good' : r.wr <= 45 ? 'mu-bad' : 'mu-even';
    return '<div class="mu-row"><span class="mu-opp">' + r.opp + '<small>' + _tr('環境') + ' ' + r.share + '%</small></span>'
      + '<span class="mu-bar"><span class="mu-fill ' + cls + '" style="width:' + Math.max(3, Math.min(100, r.wr)) + '%"></span></span>'
      + '<span class="mu-wr ' + cls + '">' + r.wr + '%<small>' + r.games + _tr('戦') + '</small></span></div>';
  }).join('');
  return '<div class="dg-matchup"><div class="mu-head">📊 ' + _tr('環境との相性') + '（β）</div>'
    + '<div class="mu-sub">' + _tr('あなたの勝ち筋') + '「' + self + '」' + _tr('が、環境で多いデッキと当たったときの実戦勝率') + '</div>'
    + rowHtml + '<div class="mu-note">' + _tr('※ 勝ち筋単位の概算（世界上位の実戦データ）。40戦未満の相手は非表示。緑＝有利／赤＝不利') + '</div></div>';
}

const GICON = { good: '◎', ok: '○', warn: '⚠', bad: '❌', info: 'ℹ️' };
function render() {
  const wrap = document.getElementById('diagResult');
  if (!wrap || !DECK) return;
  const ctx = buildChecks(DECK);
  const checks = ctx.checks;
  const anti = buildAntiSynergy(DECK, ctx);
  const open = openingRisk(DECK);
  const bads = checks.filter(c => c.grade === 'bad').length;
  const warns = checks.filter(c => c.grade === 'warn').length + anti.length;
  const verdict = bads === 0 && warns <= 1 ? ['good', _tr('合格ライン！バランスの良い構成です')]
    : bads === 0 ? ['ok', _tr('おおむね良好。⚠の項目を意識して立ち回ろう')]
    : ['warn', _tr('課題あり。❌の項目を見直すと安定します')];

  // 総評（だからどうなのか）
  const costs = DECK.map(c => c.info.c);
  const avg = (costs.reduce((s, v) => s + v, 0) / 8).toFixed(1);
  const sorted = costs.slice().sort((a, b) => a - b);
  const cyc = sorted.slice(0, 4).reduce((s, v) => s + v, 0);
  const curve = avg < 3.1 ? _tr('高速サイクル型') : avg < 3.8 ? _tr('バランス型') : avg < 4.4 ? _tr('やや重め') : _tr('重量級（序盤の受けに注意）');
  const winName = ctx.wins.length ? (ctx.wins[0].name + mark(ctx.wins[0])) : '—';
  const badTitles = checks.filter(c => c.grade === 'bad' || c.grade === 'warn').map(c => c.title).slice(0, 3);
  const summary = ctx.wins.length
    ? (badTitles.length ? _t('diag.sum', { t: curve, w: winName, b: badTitles.join(' / ') }) : _t('diag.sumGood', { t: curve, w: winName }))
    : _tr('タワーへの明確なダメージ源がありません');

  let html = '<div class="dg-deck">' + DECK.map(c => {
    const img = c.f === 'e' ? c.info.iv : c.f === 'h' ? c.info.ih : c.info.i;
    const badge = c.f === 'e' ? '<span class="slot-badge">⚡</span>' : c.f === 'h' ? '<span class="slot-badge">👑</span>' : '';
    return '<div class="mini-card' + (c.f === 'e' ? ' is-evo' : c.f === 'h' ? ' is-hero' : '') + '"><span class="pip">' + c.info.c + '</span>' + badge + '<img src="' + img + '" alt="' + c.name + '"></div>';
  }).join('') + '</div>';

  html += radarHtml(DECK, open);

  html += '<div class="dg-verdict dg-' + verdict[0] + '">' + GICON[verdict[0] === 'good' ? 'good' : verdict[0] === 'ok' ? 'ok' : 'warn'] + ' ' + verdict[1]
    + '<div class="dg-sum">' + summary + '</div>'
    + '<div class="dg-mini">' + _t('diag.curve', { avg: avg, cyc: cyc, hvy: sorted.slice(4).reduce((s, v) => s + v, 0), t: curve })
    + (open && open.badN >= 4 ? '<br>' + _t('diag.openRisk', { p: open.pct, n: open.badN }) : open ? '<br>' + _t('diag.openOk', { n: open.badN }) : '') + '</div></div>';

  html += matchupHtml(DECK);

  if (anti.length) {
    html += anti.map(a =>
      '<div class="dg-row dg-warn"><span class="dg-ico">💥</span><div class="dg-body"><div class="dg-title">' + a.title + '</div>'
      + '<div class="dg-detail">' + a.detail + '</div>'
      + '<div class="dg-chips">' + a.cards.map(chip).join('') + '</div></div></div>').join('');
  }

  html += '<details class="dg-details"><summary>📋 ' + _tr('詳細チェックを見る') + '（' + checks.length + '）</summary>'
    + checks.map(ch =>
      '<div class="dg-row dg-' + ch.grade + '">'
      + '<span class="dg-ico">' + GICON[ch.grade] + '</span>'
      + '<div class="dg-body"><div class="dg-title">' + ch.title + '</div>'
      + '<div class="dg-detail">' + ch.detail + '</div>'
      + (ch.cards.length ? '<div class="dg-chips">' + ch.cards.map(chip).join('') + '</div>' : '')
      + '</div></div>').join('')
    + '</details>';

  html += '<p class="note" style="margin-top:14px">' + _tr('※ 診断はLv16換算の理論値とオーナー監修タグに基づく参考情報です') + '</p>';
  wrap.innerHTML = html;
}

async function init() {
  DECK = parseDeck();
  const empty = document.getElementById('diagEmpty');
  const wrap = document.getElementById('diagResult');
  if (!DECK) { if (empty) empty.style.display = ''; return; }
  if (empty) empty.style.display = 'none';
  wrap.innerHTML = '<div class="coming-soon"><div class="big">🔬</div>' + _tr('診断中…') + '</div>';
  try {
    const [st, tg, pt, wt, dk, mu] = await Promise.all([
      fetch(RAW + 'card-stats.json', { cache: 'no-store' }).then(r => r.json()),
      fetch(RAW + 'card-tags.json', { cache: 'no-store' }).then(r => r.json()).catch(() => null),
      fetch(RAW + 'card-potential.json', { cache: 'no-store' }).then(r => r.json()).catch(() => null),
      fetch(RAW + 'card-weights.json', { cache: 'no-store' }).then(r => r.json()).catch(() => null),
      fetch(RAW + 'decks.json', { cache: 'no-store' }).then(r => r.json()).catch(() => null),
      fetch(RAW + 'matchups.json', { cache: 'no-store' }).then(r => r.json()).catch(() => null)
    ]);
    STATS = {}; (st.cards || []).forEach(c => STATS[c.jp] = c);
    TAGS = (tg && tg.cards) || {};
    POT = (pt && pt.cards) || null;
    WEIGHTS = (wt && wt.cards) || null;
    META = (dk && Array.isArray(dk.meta)) ? dk.meta : null;
    MATCH = (mu && mu.months) ? mu : null;
    render();
  } catch (e) {
    wrap.innerHTML = '<div class="coming-soon"><div class="big">📡</div>' + _tr('データの取得に失敗しました。時間をおいて再読み込みしてください') + '</div>';
  }
}
window.addEventListener('crlangchange', () => { try { render(); } catch (e) {} });
if (document.readyState !== 'loading') init();
else document.addEventListener('DOMContentLoaded', init);
