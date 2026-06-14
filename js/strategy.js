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

let STATS = null, TAGS = null, POT = null, EVAL = null, DECK = null, META = null, MATCH = null;

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

// ★デッキ能力（card-eval.json＝全カード相対評価1〜10から集計）。"下から持ち上げる"構成的診断。
//   各軸＝関連項目をカードごとに最大化→デッキは「担い手1位＋0.35×2位」。耐性/エリ得は全体平均。
function capabilityHtml(deck) {
  if (!EVAL) return '';
  const E = deck.map(c => ({ c: c, e: EVAL[c.name + mark(c)] || EVAL[c.name] }));
  if (E.filter(x => x.e).length < 6) return '';
  const AX = [
    { l: _tr('対空'), it: ['対空単体処理', '対空群れ処理'], avg: false },
    { l: _tr('タンク処理'), it: ['タンク処理', '中型タンク処理'], avg: false },
    { l: _tr('小物処理'), it: ['地上群れ処理', '対空群れ処理'], avg: false },
    { l: _tr('タワー圧'), it: ['タワーダメージ力', 'タワーダメージ決定力'], avg: false },
    { l: _tr('施設攻略'), it: ['施設破壊力', '施設突破力'], avg: false },
    { l: _tr('呪文耐性'), it: ['呪文耐性'], avg: true },
    { l: _tr('エリ得'), it: ['エリクサーアドバンテージ'], avg: true }
  ];
  const axData = AX.map(ax => {
    const contrib = E.map(x => {
      const v = x.e ? Math.max.apply(null, ax.it.map(it => x.e[it] || 0)) : 0;
      return { c: x.c, v: v };
    }).sort((a, b) => b.v - a.v);
    let score = ax.avg
      ? contrib.reduce((s, x) => s + x.v, 0) / E.length
      : 0.65 * contrib[0].v + 0.35 * (contrib[1] ? contrib[1].v : 0);
    score = Math.max(0, Math.min(10, Math.round(score * 10) / 10));
    return { l: ax.l, score: score, carry: (!ax.avg && contrib[0].v >= 4) ? contrib[0].c : null };
  });
  const bars = axData.map(a => {
    const pct = Math.max(4, Math.round(a.score / 10 * 100));
    const cls = a.score >= 6.5 ? 'cap-hi' : a.score >= 3.5 ? 'cap-mid' : 'cap-lo';
    const carry = a.carry ? '<span class="cap-carry">' + a.carry.name + mark(a.carry) + '</span>' : '';
    return '<div class="cap-row"><span class="cap-l">' + a.l + '</span>'
      + '<span class="cap-bar"><span class="cap-fill ' + cls + '" style="width:' + pct + '%"></span></span>'
      + '<span class="cap-v">' + a.score.toFixed(1) + '</span>' + carry + '</div>';
  }).join('');
  const strong = axData.slice().sort((a, b) => b.score - a.score)[0];
  const weak = axData.slice().sort((a, b) => a.score - b.score)[0];
  const tip = '<div class="cap-tip"><div class="cap-strong">💪 ' + _tr('強み') + '：「' + strong.l + '」' + _tr('が高い。ここを主軸に組み立てよう') + '</div>'
    + '<div class="cap-weak">🛠 ' + _tr('伸ばすなら') + '：「' + weak.l + '」' + _tr('は控えめ。') + capAdvice(weak.l) + '</div></div>';
  return '<div class="dg-cap"><div class="cap-head">⚙️ ' + _tr('デッキ能力（カード評価ベース）') + '</div>'
    + bars
    + tip + '</div>';
}
// ★弱い軸への"こう対処する"アドバイス（欠点指摘ではなく立ち回りでカバー）
function capAdvice(l) {
  const M = {
    '対空': '空主体の相手は、地上の手数で押し返すかタワー射程に引きつけて削る',
    'タンク処理': '大型タンクは建物や複数体で受けを重ね、時間を稼いで処理',
    '小物処理': '数で来る相手は呪文を温存し、引きつけてからまとめて',
    'タワー圧': 'カウンター主体で、守ってから少数で確実に削る展開に',
    '施設攻略': '正面が硬いので左右に振り、的を絞らせず横圧をかける',
    '呪文耐性': '主力を固めず散らして置き、呪文の一掃を避ける',
    'エリ得': '無駄打ちを減らし、受けてから攻める"後出し"を意識'
  };
  return _tr(M[l] || '立ち回りでカバーしよう');
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
  const pair = {}, months = MATCH.months || {};
  Object.keys(months).forEach(mk => {
    const bk = months[mk] || {};
    Object.keys(bk).forEach(k => { const v = bk[k]; if (!Array.isArray(v)) return; pair[k] = pair[k] || [0, 0]; pair[k][0] += v[0]; pair[k][1] += v[1]; });
  });
  const MIN = 20; // 全勝ち筋を出す。少数サンプルのノイズだけ除外
  const rows = [];
  let sw = 0, sg = 0;
  META.forEach(m => {
    if (!m || m.k === self) return; // ミラーは除外
    const gw = pair[self + '|' + m.k];
    if (!gw || gw[0] < MIN) return;
    rows.push({ opp: m.k, share: m.share, wr: Math.round(gw[1] / gw[0] * 1000) / 10, games: gw[0] });
    sw += gw[1]; sg += gw[0];
  });
  if (rows.length < 2) return '';
  const avg = Math.round(sw / sg * 1000) / 10; // 中心線＝このデッキの平均勝率
  rows.sort((a, b) => b.wr - a.wr); // 得意→苦手
  const rowHtml = rows.map(r => {
    const dev = r.wr - avg;
    const cls = dev >= 3 ? 'mu-good' : dev <= -3 ? 'mu-bad' : 'mu-even';
    const w = Math.min(48, Math.abs(dev) * 4.0); // 平均からの差を拡大（収束しても見える）
    const fill = dev >= 0
      ? '<span class="mu-fill ' + cls + '" style="left:50%;width:' + w + '%"></span>'
      : '<span class="mu-fill ' + cls + '" style="right:50%;width:' + w + '%"></span>';
    return '<div class="mu-row"><span class="mu-opp">' + r.opp + '<small>' + _tr('環境') + ' ' + r.share + '%</small></span>'
      + '<span class="mu-bar">' + fill + '</span>'
      + '<span class="mu-wr ' + cls + '">' + r.wr + '%<small>' + r.games + _tr('戦') + '</small></span></div>';
  }).join('');
  return '<div class="dg-matchup"><div class="mu-head">📊 ' + _tr('環境との相性') + '（β）</div>'
    + '<div class="mu-sub">' + _tr('あなたの勝ち筋') + '「' + self + '」／' + _tr('中心線＝このデッキの平均') + ' ' + avg + '%（' + _tr('右=得意／左=苦手') + '）</div>'
    + '<div class="mu-list">' + rowHtml + '</div>'
    + '<div class="mu-note">' + _tr('※ 中心はこのデッキの平均勝率。全勝ち筋を表示（スクロール）。緑＝平均より上／赤＝下。少数戦は参考値') + '</div></div>';
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
  const verdict = bads === 0 && warns <= 1 ? ['good', _tr('強みが噛み合ったバランスの良い構成です'), '✅']
    : bads === 0 ? ['ok', _tr('おおむね好バランス。弱めの軸は立ち回りでカバーしよう'), '👍']
    : ['warn', _tr('伸びしろのある構成。下の弱い軸を立ち回りで補うと安定します'), '🛠'];

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

  html += capabilityHtml(DECK);

  html += '<div class="dg-verdict dg-' + verdict[0] + '">' + verdict[2] + ' ' + verdict[1]
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
      fetch(RAW + 'card-eval.json', { cache: 'no-store' }).then(r => r.json()).catch(() => null),
      fetch(RAW + 'decks.json', { cache: 'no-store' }).then(r => r.json()).catch(() => null),
      fetch(RAW + 'matchups.json', { cache: 'no-store' }).then(r => r.json()).catch(() => null)
    ]);
    STATS = {}; (st.cards || []).forEach(c => STATS[c.jp] = c);
    TAGS = (tg && tg.cards) || {};
    POT = (pt && pt.cards) || null;
    EVAL = (wt && wt.cards) || null;
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
