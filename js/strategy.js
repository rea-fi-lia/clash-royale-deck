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

// ★型判定：勝ち筋＋平均コスト＋構成で「このデッキは何か」を当てる＝全評価の基準点
const ARCH_DEFS = {
  siege:    { label: '攻城', plan: '建物で守りつつ攻城兵器でタワーを遠距離から削る型。受けの徹底と射線管理が肝。',
    explain: '迫撃砲・巨大クロスボウなどの攻城兵器を自陣に置き、射程でタワーを遠距離から削る玄人型。守りを徹底してアドバンテージを取り、攻城を通し続けて勝つ。設置位置と防衛の精度がすべてで、攻城を割られたり前に出られると一気に苦しくなる。' },
  beatdown: { label: 'ビートダウン', plan: '重い主軸を後ろから育て、エリクサーで上回ってから攻め切る型。重い展開を捌けるかが鍵。',
    explain: '高コストの主軸タンク（ゴーレム・ラヴァ等）を軸に、後ろへサポートを足しながら大きな攻めを作る型。エリクサーを貯めて一度に押し切る爆発力が魅力。反面、序盤は守勢になりがちで、軽量速攻に手数で攻められると展開が間に合わない。重い分、事故ると一気に不利になる。' },
  cycle:    { label: 'サイクル', plan: '軽量で手数を回し、主軸を小刻みに通してチップを蓄積する型。エリ効率と手の速さが命。',
    explain: '平均コスト2.5〜3.0前後の軽いデッキで、安いカードを高速で回し、主軸（ホグ等）を何度も通してチップを刻む型。手数とエリクサー効率で上回るのが強み。一撃の火力は低く、守りを固められると削り切れず終盤の競り合いになりやすい。' },
  bait:     { label: 'ベイト', plan: '小型呪文を釣り、呪文を吐かせた隙に主軸を通す型。相手の呪文管理を読む駆け引きが軸。',
    explain: 'ゴブリンバレルやプリンセスなど"小型呪文で対応される駒"をあえて多く積み、相手に呪文を吐かせてから本命を通す型。相手の呪文の有無を読む駆け引きが核。読みが当たれば一方的に押せるが、外すと手札が腐る。' },
  bridge:   { label: 'ブリッジスパム', plan: '橋前に圧をかけ続け、相手の対応が遅れた所を突く速攻型。手数とテンポで主導権を握る。',
    explain: 'アサシン・プリンス・バトルラムなどを橋前に置いて圧をかけ続け、相手の対応が遅れた隙を突く速攻型。テンポと手数で主導権を握る。受けに回ると弱く、常に先手で攻め続けたい。' },
  control:  { label: 'コントロール', plan: '守ってカウンター、少数で確実に削る型。受けの厚みとエリクサーアドバンテージで勝つ。',
    explain: '強力な防衛で受け切り、カウンターや削りで少しずつ差をつける型。エリクサーアドバンテージと盤面管理で勝つ。試合が長引きやすく、判断ミスが響く玄人寄り。爆発的な火力はない代わりに、安定して優位を積める。' },
  midrange: { label: 'ミッドレンジ', plan: '攻守バランス型。状況に応じて受けと攻めを切り替える。',
    explain: '極端な軽さも重さもない、攻守バランス型。状況に応じて受けと攻めを切り替えられる柔軟さが武器。突出した強みは出にくいが、幅広い相手に対応しやすく扱いやすい。' }
};
const A_SIEGE = ['迫撃砲', '巨大クロスボウ'];
const A_HEAVY = ['ゴーレム', 'ラヴァハウンド', 'エレクトロジャイアント', 'エリクサーゴーレム', '巨大スケルトン', 'ゴブジャイアント'];
const A_BRIDGE = ['アサシン ユーノ', 'ロイヤルゴースト', 'プリンス', 'ダークプリンス', 'エリートバーバリアン', 'ラムライダー', '攻城バーバリアン'];
const A_RUSH = ['ホグライダー', 'ロイヤルホグ', 'ラムライダー', '攻城バーバリアン', 'エアバルーン', 'ウォールブレイカー', 'ゴブリンドリル', 'ディガー', 'マイティディガー'];
function classifyArchetype(deck, ctx) {
  const names = deck.map(c => c.name);
  const avg = deck.reduce((s, c) => s + c.info.c, 0) / 8;
  const wins = ctx.wins || [];
  const has_ = n => names.indexOf(n) >= 0;
  const baitN = deck.filter(c => has(c, 'spellBait')).length;
  const bridgeN = deck.filter(c => A_BRIDGE.indexOf(c.name) >= 0).length;
  const heavy = wins.filter(c => A_HEAVY.indexOf(c.name) >= 0);
  let key;
  if (A_SIEGE.some(has_)) key = 'siege';
  else if (baitN >= 3) key = 'bait';
  else if (heavy.length && avg >= 3.6) key = 'beatdown';
  else if (avg <= 3.0 && wins.some(c => A_RUSH.indexOf(c.name) >= 0)) key = 'cycle';
  else if (bridgeN >= 2 && !heavy.length) key = 'bridge';
  else if ((ctx.spells || []).length >= 2 && !heavy.length && avg < 3.8) key = 'control';
  else key = 'midrange';
  let axis = null;
  if (key === 'siege') axis = deck.find(c => A_SIEGE.indexOf(c.name) >= 0);
  else if (key === 'beatdown') axis = heavy.slice().sort((a, b) => b.info.c - a.info.c)[0];
  else axis = wins.find(c => A_RUSH.indexOf(c.name) >= 0) || wins.slice().sort((a, b) => b.info.c - a.info.c)[0];
  if (!axis && wins.length) axis = wins[0];
  return { key: key, label: ARCH_DEFS[key].label, plan: ARCH_DEFS[key].plan, axis: axis, avg: Math.round(avg * 10) / 10 };
}
function archetypeHtml(deck, ctx) {
  const a = classifyArchetype(deck, ctx);
  const axisHtml = a.axis ? chip(a.axis) : '<span class="dg-detail">' + _tr('明確な主軸なし') + '</span>';
  return '<div class="dg-identity">'
    + '<details class="id-details"><summary class="id-head">🎯 ' + _tr('これは') + '「<b>' + _tr(a.label) + '</b>」' + _tr('デッキ')
    + '<span class="id-avg">' + _tr('平均') + ' ' + a.avg.toFixed(1) + '</span><span class="id-q">' + _tr('型の説明') + ' ▾</span></summary>'
    + '<div class="id-explain">' + _tr(ARCH_DEFS[a.key].explain) + '</div></details>'
    + '<div class="id-axis"><span class="id-lbl">' + _tr('主軸') + '</span>' + axisHtml + '</div>'
    + '<div class="id-plan">' + _tr(a.plan) + '</div></div>';
}

// ★デッキ能力スコア（card-eval集計）をマップで返す＝相性の"答え"判定に使う
function capScores(deck) {
  if (!EVAL) return null;
  const E = deck.map(c => ({ e: EVAL[c.name + mark(c)] || EVAL[c.name] }));
  if (E.filter(x => x.e).length < 6) return null;
  const AX = [
    { k: '対空', it: ['対空単体処理', '対空群れ処理'] },
    { k: 'タンク処理', it: ['タンク処理', '中型タンク処理'] },
    { k: '小物処理', it: ['地上群れ処理', '対空群れ処理'] },
    { k: 'タワー圧', it: ['タワーダメージ力', 'タワーダメージ決定力'] },
    { k: '施設攻略', it: ['施設破壊力', '施設突破力'] }
  ];
  const out = {};
  AX.forEach(ax => {
    const c = E.map(x => x.e ? Math.max.apply(null, ax.it.map(it => x.e[it] || 0)) : 0).sort((a, b) => b - a);
    out[ax.k] = Math.max(0, Math.min(10, Math.round((0.65 * c[0] + 0.35 * (c[1] || 0)) * 10) / 10));
  });
  return out;
}

// ★相手の型→"核の脅威"に、自分が答えを持つか（card-evalの軸で判定）
const THREAT_AXIS = {
  'ラヴァハウンド': '対空', 'エアバルーン': '対空', 'スケルトンバレル': '対空',
  'ゴーレム': 'タンク処理', 'エレクトロジャイアント': 'タンク処理', 'ジャイアント': 'タンク処理',
  'ロイヤルジャイアント': 'タンク処理', '巨大スケルトン': 'タンク処理', 'ゴブジャイアント': 'タンク処理',
  'エリクサーゴーレム': 'タンク処理', 'ペッカ': 'タンク処理', 'メガナイト': 'タンク処理',
  '三銃士': '小物処理', 'ゴブリンバレル': '小物処理', 'スケルトンラッシュ': '小物処理', 'ゴブリンドリル': '小物処理',
  '迫撃砲': '施設攻略', '巨大クロスボウ': '施設攻略'
};
const THREAT_PHRASE = {
  '対空': { hi: '対空が厚く、空の主軸を止めやすい', lo: '対空が薄く、空の主軸を止めきれない' },
  'タンク処理': { hi: '大型タンクを処理できる', lo: '大型タンクの突破を許しやすい' },
  '小物処理': { hi: '群れ・数攻めを捌ける', lo: '数で攻められると捌ききれない' },
  '施設攻略': { hi: '攻城建物を直接割れる', lo: '攻城を割る手段が薄い' }
};
function threatReason(oppBase, caps) {
  const ax = THREAT_AXIS[oppBase];
  if (!ax || !caps || caps[ax] == null) return '';
  const v = caps[ax], p = THREAT_PHRASE[ax];
  if (v >= 6) return _tr(p.hi);
  if (v <= 3.5) return _tr(p.lo);
  return '';
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
  const caps = capScores(deck);
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
    const base = String(r.opp).replace(/[⚡👑]+$/, ''), suf = String(r.opp).slice(base.length);
    const reason = threatReason(base, caps);
    const inf = (typeof CARD_INFO !== 'undefined') ? CARD_INFO[base] : null;
    const src = inf ? ((suf === '⚡' && inf.iv) ? inf.iv : (suf === '👑' && inf.ih) ? inf.ih : inf.i) : '';
    const ico = '<span class="mu-ico">' + (src ? '<img src="' + src + '" alt="' + base + '" loading="lazy">' : '') + '</span>';
    return '<div class="mu-row">' + ico + '<span class="mu-opp">' + r.opp + '<small>' + _tr('環境') + ' ' + r.share + '%</small>' + (reason ? '<small class="mu-reason">' + reason + '</small>' : '') + '</span>'
      + '<span class="mu-bar">' + fill + '</span>'
      + '<span class="mu-wr ' + cls + '">' + r.wr + '%<small>' + r.games + _tr('戦') + '</small></span></div>';
  }).join('');
  return '<div class="dg-matchup"><div class="mu-head">📊 ' + _tr('環境との相性') + '（β）</div>'
    + '<div class="mu-sub">' + _tr('あなたの勝ち筋') + '「' + self + '」／' + _tr('中心線＝このデッキの平均') + ' ' + avg + '%（' + _tr('右=得意／左=苦手') + '）</div>'
    + '<div class="mu-list">' + rowHtml + '</div>'
    + '<div class="mu-note">' + _tr('※ 中心はこのデッキの平均勝率。全勝ち筋を表示（スクロール）。緑＝平均より上／赤＝下。少数戦は参考値') + '</div></div>';
}

// ★似たデッキ（6枚以上一致）の勝率ランキング：sighist（署名ごとの通算[人数,試合,勝]）を、今のデッキと
//   6枚以上かぶるデッキだけ集めて勝率順に。勝ち/負けランキング＋"あなたとの差分(抜く→入れる)"を出す。
let SIGHIST_DECKS = null;     // [{ names:[8], g, w }]（月別sighistをカード名で集約＝全累計）
let _diagTab = 'main', _simSub = 'up'; // タブ/サブタブ選択を再描画後も保持
const SIM_MINGAMES = 30;      // 勝率の信頼に足る最低試合数（少数戦のブレ除去）
function ymOffset(off) { const d = new Date(); d.setMonth(d.getMonth() + off); return d.toISOString().slice(0, 7); }
function _fnorm(f) { return f === 'e' ? 'e' : f === 'h' ? 'h' : 'n'; } // ⚡限界突破/👑ヒーロー以外はnに寄せる（chは区別しない）
function mergeSighist(files) {
  const agg = {};
  (files || []).forEach(sh => {
    if (!sh || !Array.isArray(sh.cards) || !sh.sigs) return;
    Object.keys(sh.sigs).forEach(key => {
      const parts = String(key).split('|');
      const idxs = parts[0].split('.');
      const fstr = parts[1] || '';
      const names = idxs.map(i => sh.cards[+i]);
      if (names.length !== 8 || names.indexOf(undefined) >= 0) return;
      const forms = names.map((n, i) => _fnorm(fstr[i] || 'n')); // 署名は索引昇順＝formsも同順
      const v = sh.sigs[key]; // [users, games, wins]
      const canon = names.map((n, i) => n + ':' + forms[i]).sort().join('|');
      const e = agg[canon] || (agg[canon] = { names: names, forms: forms, g: 0, w: 0 });
      e.g += (v[1] || 0); e.w += (v[2] || 0);
    });
  });
  return Object.keys(agg).map(k => agg[k]);
}
function similarRankingHtml(deck) {
  if (!SIGHIST_DECKS || !SIGHIST_DECKS.length) return '';
  const userBase = {}; deck.forEach(c => userBase[c.name] = 1);
  const rows = [];
  SIGHIST_DECKS.forEach(d => {
    let overlap = 0; d.names.forEach(n => { if (userBase[n]) overlap++; });   // 6枚一致＝名前ベース（進化/ヒーロー込み8枚のうち6枚）
    if (overlap < 6 || d.g < SIM_MINGAMES) return;
    const out = deck.filter(c => d.names.indexOf(c.name) < 0);                 // 自分にあって相手に無い＝名前ベース（最大2枚）
    const inc = []; d.names.forEach((n, i) => { if (!userBase[n]) inc.push({ name: n, form: d.forms[i] }); }); // 相手にあって自分に無い＝名前＋相手の形態
    const eh = d.names.map(function (n, i) { return { name: n, form: d.forms[i] }; }).filter(function (x) { return x.form === 'e' || x.form === 'h'; }); // このランカーが進化/ヒーローさせてるカード
    rows.push({ wr: Math.round(d.w / d.g * 1000) / 10, g: d.g, self: (!out.length && !inc.length), out: out, inc: inc, eh: eh });
  });
  if (!rows.length) return '';
  const self = rows.find(r => r.self);
  const changes = rows.filter(r => !r.self && r.out.length && r.inc.length);
  const wins = changes.filter(r => r.wr >= 55).sort((a, b) => b.wr - a.wr).slice(0, 100);
  const loses = changes.filter(r => r.wr <= 45).sort((a, b) => a.wr - b.wr).slice(0, 100);
  const cimgF = (name, form) => {
    const inf = (typeof CARD_INFO !== 'undefined') ? CARD_INFO[name] : null;
    const src = inf ? (form === 'e' && inf.iv ? inf.iv : form === 'h' && inf.ih ? inf.ih : inf.i) : '';
    const badge = form === 'e' ? '<span class="sr-fb">⚡</span>' : form === 'h' ? '<span class="sr-fb">👑</span>' : '';
    return '<span class="sr-c">' + (src ? '<img src="' + src + '" alt="' + name + '" loading="lazy">' : '') + badge + '</span>';
  };
  const enc = arr => arr.map(x => x.name + ':' + x.form).join(',');
  const rowHtml = r => {
    const cls = r.wr >= 55 ? 'sr-good' : r.wr <= 45 ? 'sr-bad' : 'sr-even';
    const outH = r.out.map(c => cimgF(c.name, _fnorm(c.f))).join('');
    const inH = r.inc.map(x => cimgF(x.name, x.form)).join('');
    return '<div class="sr-row"><span class="sr-out">' + outH + '</span><span class="sr-arrow">→</span><span class="sr-in">' + inH + '</span>'
      + '<span class="sr-wr ' + cls + '">' + r.wr + '%<small>' + r.g + _tr('戦') + '</small></span>'
      + '<button class="sr-swap" data-out="' + enc(r.out.map(c => ({ name: c.name, form: _fnorm(c.f) }))) + '" data-in="' + enc(r.inc) + '" data-rf="' + enc(r.eh || []) + '">' + _tr('入れ替える') + '</button></div>';
  };
  const listOrEmpty = arr => arr.length ? arr.map(rowHtml).join('') : ('<div class="sr-note">' + _tr('まだ十分なデータがありません（蓄積中）') + '</div>');
  const selfLine = self ? '<div class="sr-self">' + _tr('あなたのデッキの通算勝率') + '：<b>' + self.wr + '%</b>（' + self.g + _tr('戦') + '）</div>' : '';
  const tabs = '<div class="sr-tabs"><button class="srtab' + (_simSub === 'up' ? ' active' : '') + '" data-sub="up">' + _tr('強化案') + '</button>'
    + '<button class="srtab' + (_simSub === 'down' ? ' active' : '') + '" data-sub="down">' + _tr('苦手対策') + '</button></div>';
  const deckBar = '<div class="sr-deckbar" id="srDeckBar" aria-hidden="true">' + deck.map(function (c) {
    var f = _fnorm(c.f);
    var img = f === 'e' ? c.info.iv : f === 'h' ? c.info.ih : c.info.i;
    var badge = f === 'e' ? '<span class="sr-fb">⚡</span>' : f === 'h' ? '<span class="sr-fb">👑</span>' : '';
    return '<span class="sr-dc" data-key="' + c.name + ':' + f + '"><img src="' + img + '" alt="' + c.name + '" loading="lazy">' + badge + '</span>';
  }).join('') + '</div>';
  return '<div class="dg-simrank">' + selfLine
    + '<div class="sr-note">' + _tr('あなたのデッキと6枚以上かぶる構成の通算勝率。左の抜く→右の入れるが差分（⚡限界突破/👑ヒーローも区別）。「入れ替える」で今のデッキに反映。') + '</div>'
    + tabs + deckBar
    + '<div class="sr-pane" data-sub="up"' + (_simSub === 'up' ? '' : ' hidden') + '><div class="sr-sub sr-good">' + _tr('勝率の高い構成') + '</div><div class="sr-list">' + listOrEmpty(wins) + '</div></div>'
    + '<div class="sr-pane" data-sub="down"' + (_simSub === 'down' ? '' : ' hidden') + '><div class="sr-sub sr-bad">' + _tr('勝率の低い構成') + '</div><div class="sr-list">' + listOrEmpty(loses) + '</div>'
    + '<div class="sr-note">' + _tr('※ いまは「この変更だと勝率が下がる」例。相手の勝ち筋に効く対策カード提案は今後追加予定。') + '</div></div>'
    + '</div>';
}
// ★ランキングの「入れ替える」＝今のデッキにその差分を適用→再診断＋戻る先にも反映
// Index準拠のスロット再配置：進化=枠1(0)→枠3(2) / ヒーロー=枠2(1)→枠3(2) / ノーマル=空き枠に順に（並びは自由）
function reslotDeck(cards) {
  const slots = [null, null, null, null, null, null, null, null];
  const overflow = [];
  cards.filter(c => c.f === 'e').forEach(c => { if (slots[0] === null) slots[0] = c; else if (slots[2] === null) slots[2] = c; else overflow.push(c); });
  cards.filter(c => c.f === 'h').forEach(c => { if (slots[1] === null) slots[1] = c; else if (slots[2] === null) slots[2] = c; else overflow.push(c); });
  cards.filter(c => c.f !== 'e' && c.f !== 'h').concat(overflow).forEach(c => { for (let i = 0; i < 8; i++) { if (slots[i] === null) { slots[i] = c; break; } } });
  return slots;
}
function applyDeckSwap(outStr, inStr, rfStr) {
  if (!DECK) return;
  const parse = s => (s || '').split(',').filter(Boolean).map(x => { const a = x.split(':'); return { name: a[0], form: a[1] || 'n' }; });
  const outList = parse(outStr), inList = parse(inStr), rfList = parse(rfStr);
  const inCards = inList.map(x => {
    const info = (typeof CARD_INFO !== 'undefined') ? CARD_INFO[x.name] : null;
    if (!info) return null;
    const fm = (x.form === 'e' && info.iv) ? 'e' : (x.form === 'h' && info.ih) ? 'h' : 'n'; // 形を画像有無で正規化
    return { name: x.name, f: fm, info };
  });
  if (inCards.indexOf(null) >= 0) return;
  const outKeys = {}; outList.forEach(x => outKeys[x.name + ':' + x.form] = 1);
  let k = 0;
  let next = DECK.map(c => outKeys[c.name + ':' + _fnorm(c.f)] ? inCards[k++] : { name: c.name, f: _fnorm(c.f), info: c.info }); // 差分適用＋複製
  // ★進化/ヒーローが「純減」する入れ替えの時だけ、ランカーの割当に合わせて別カードを昇格（枠の無駄遣い防止）。進化→進化やノーマル→進化は触らない
  ['e', 'h'].forEach(function (t) {
    const removed = outList.filter(function (x) { return x.form === t; }).length;
    const added = inList.filter(function (x) { return x.form === t; }).length;
    if (removed - added <= 0) return;
    const rankerT = {}; rfList.forEach(function (x) { if (x.form === t) rankerT[x.name] = 1; });
    next = next.map(function (c) {
      const cap = (t === 'e') ? !!(c.info && c.info.iv) : !!(c.info && c.info.ih);
      if (rankerT[c.name] && cap) return { name: c.name, f: t, info: c.info };          // ランカーが進化/ヒーローさせてるカードを昇格
      if (c.f === t && !rankerT[c.name]) return { name: c.name, f: 'n', info: c.info };  // ランカーに無い同型は解除＝枚数をランカーに合わせる
      return c;
    });
  });
  DECK = reslotDeck(next); // Index準拠で進化/ヒーローを定位置に
  const names = DECK.map(c => c.name).join(',');
  const fs = DECK.map(c => _fnorm(c.f)).join('');
  const q = '?deck=' + encodeURIComponent(names) + '&f=' + fs;
  try { history.replaceState(null, '', 'strategy.html' + q); } catch (e) {}
  document.querySelectorAll('.back-link').forEach(a => { a.href = 'index.html' + q; });
  render();
  try { window.scrollTo({ top: 0, behavior: 'smooth' }); } catch (e) {}
}

// ===== デッキ強化タブ：現デッキ固定バー（上の8枚が隠れたらFLIPで集合）＝================
let _simScrollHandler = null;
function _cssVarPx(name, fb) { const v = parseFloat(getComputedStyle(document.documentElement).getPropertyValue(name)); return isNaN(v) ? fb : v; }
function flipShowBar(bar, topDeck) {
  var srt = document.querySelector('.diag-panel[data-panel="sim"] .sr-tabs'); // sim可視時に正しい高さで測る
  if (srt && srt.offsetHeight) document.documentElement.style.setProperty('--srtabsH', srt.offsetHeight + 'px');
  bar.classList.add('show'); // display:flex にしてからレイアウト確定→各カードを上の8枚位置から飛ばす
  const dcs = bar.querySelectorAll('.sr-dc');
  const minis = topDeck ? topDeck.querySelectorAll('.mini-card') : [];
  dcs.forEach(function (dc, i) {
    const mini = minis[i]; if (!mini) return;
    const a = mini.getBoundingClientRect(), b = dc.getBoundingClientRect();
    if (!b.width) return;
    const dx = a.left - b.left, dy = a.top - b.top, s = a.width / b.width;
    dc.style.transition = 'none';
    dc.style.transform = 'translate(' + dx + 'px,' + dy + 'px) scale(' + s + ')';
    requestAnimationFrame(function () {
      dc.style.transition = 'transform .34s cubic-bezier(.2,.75,.3,1)';
      dc.style.transitionDelay = (i * 0.022) + 's'; // 軽いスタッガでシュルシュル
      dc.style.transform = '';
    });
  });
}
function wireSimDeckBar(wrap) {
  const srt = wrap.querySelector('.sr-tabs');
  if (srt && srt.offsetHeight) document.documentElement.style.setProperty('--srtabsH', srt.offsetHeight + 'px'); // 隠れてる時(0)は書かない
  if (_simScrollHandler) { window.removeEventListener('scroll', _simScrollHandler); _simScrollHandler = null; }
  const bar = wrap.querySelector('#srDeckBar');
  if (!bar) return;
  const topDeck = wrap.querySelector('.dg-deck');
  let shown = false;
  function evalBar() {
    const simPanel = wrap.querySelector('.diag-panel[data-panel="sim"]');
    if (!simPanel || simPanel.hidden || !topDeck) { if (shown) { bar.classList.remove('show'); shown = false; } return; }
    const threshold = _cssVarPx('--sbH', 96) + _cssVarPx('--tabsH', 48) + 8;
    const gone = topDeck.getBoundingClientRect().bottom <= threshold; // 上の8枚がタブ裏へ隠れた
    if (gone && !shown) { shown = true; flipShowBar(bar, topDeck); }
    else if (!gone && shown) { shown = false; bar.classList.remove('show'); }
  }
  _simScrollHandler = evalBar;
  window.addEventListener('scroll', evalBar, { passive: true });
  evalBar();
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

  const deckHtml = '<div class="dg-deck">' + DECK.map(c => {
    const img = c.f === 'e' ? c.info.iv : c.f === 'h' ? c.info.ih : c.info.i;
    const badge = c.f === 'e' ? '<span class="slot-badge">⚡</span>' : c.f === 'h' ? '<span class="slot-badge">👑</span>' : '';
    return '<div class="mini-card' + (c.f === 'e' ? ' is-evo' : c.f === 'h' ? ' is-hero' : '') + '" data-key="' + c.name + ':' + _fnorm(c.f) + '"><span class="pip">' + c.info.c + '</span>' + badge + '<img src="' + img + '" alt="' + c.name + '"></div>';
  }).join('') + '</div>';

  let html = '';
  html += archetypeHtml(DECK, ctx);
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
  const simHtml = similarRankingHtml(DECK) || ('<div class="sr-note">' + _tr('似たデッキのデータを蓄積中です。時間が経つほど充実します。') + '</div>');
  const tabs = '<div class="diag-tabs"><button class="dtab' + (_diagTab === 'main' ? ' active' : '') + '" data-tab="main">' + _tr('診断') + '</button>'
    + '<button class="dtab' + (_diagTab === 'sim' ? ' active' : '') + '" data-tab="sim">📊 ' + _tr('デッキ強化') + '</button></div>';
  wrap.innerHTML = deckHtml + tabs
    + '<div class="diag-panel" data-panel="main"' + (_diagTab === 'main' ? '' : ' hidden') + '>' + html + '</div>'
    + '<div class="diag-panel" data-panel="sim"' + (_diagTab === 'sim' ? '' : ' hidden') + '>' + simHtml + '</div>';
  wrap.querySelectorAll('.dtab').forEach(function (t) {
    t.addEventListener('click', function () {
      _diagTab = t.dataset.tab;
      wrap.querySelectorAll('.dtab').forEach(function (x) { x.classList.toggle('active', x === t); });
      wrap.querySelectorAll('.diag-panel').forEach(function (p) { p.hidden = (p.dataset.panel !== _diagTab); });
      if (_simScrollHandler) _simScrollHandler(); // タブ切替で固定バーの要否を再判定
    });
  });
  wrap.querySelectorAll('.srtab').forEach(function (t) {
    t.addEventListener('click', function () {
      _simSub = t.dataset.sub;
      wrap.querySelectorAll('.srtab').forEach(function (x) { x.classList.toggle('active', x === t); });
      wrap.querySelectorAll('.sr-pane').forEach(function (p) { p.hidden = (p.dataset.sub !== _simSub); });
    });
  });
  wrap.querySelectorAll('.sr-swap').forEach(function (b) {
    b.addEventListener('click', function (e) { e.stopPropagation(); applyDeckSwap(b.dataset.out, b.dataset.in, b.dataset.rf); });
  });
  // 候補をタップ＝入れ替え元(out)を現デッキバー＆上の8枚で発光
  function srHighlight(keys) {
    wrap.querySelectorAll('.sr-dc, .dg-deck .mini-card').forEach(function (el) {
      el.classList.toggle('hot', (keys || []).indexOf(el.dataset.key) >= 0);
    });
  }
  wrap.querySelectorAll('.sr-row').forEach(function (row) {
    row.addEventListener('click', function () {
      var btn = row.querySelector('.sr-swap');
      var keys = btn ? (btn.dataset.out || '').split(',').filter(Boolean) : [];
      srHighlight(keys);
      wrap.querySelectorAll('.sr-row').forEach(function (r) { r.classList.toggle('sr-sel', r === row); });
    });
  });
  try { wireSimDeckBar(wrap); } catch (e) {}
  var dt = wrap.querySelector('.diag-tabs');
  if (dt) document.documentElement.style.setProperty('--tabsH', dt.offsetHeight + 'px'); // サブタブの固定位置をメインタブ直下に
}

async function init() {
  DECK = parseDeck();
  document.querySelectorAll('.back-link').forEach(function (a) { a.href = 'index.html' + (location.search || ''); }); // 同じdeck/fを渡して復元（上下の戻る共通）
  const empty = document.getElementById('diagEmpty');
  const wrap = document.getElementById('diagResult');
  if (!DECK) { if (empty) empty.style.display = ''; return; }
  if (empty) empty.style.display = 'none';
  wrap.innerHTML = '<div class="coming-soon"><div class="big">🔬</div>' + _tr('診断中…') + '</div>';
  try {
    const [st, tg, pt, wt, dk, mu, sh0, sh1, sh2] = await Promise.all([
      fetch(RAW + 'card-stats.json', { cache: 'no-store' }).then(r => r.json()),
      fetch(RAW + 'card-tags.json', { cache: 'no-store' }).then(r => r.json()).catch(() => null),
      fetch(RAW + 'card-potential.json', { cache: 'no-store' }).then(r => r.json()).catch(() => null),
      fetch(RAW + 'card-eval.json', { cache: 'no-store' }).then(r => r.json()).catch(() => null),
      fetch(RAW + 'decks.json', { cache: 'no-store' }).then(r => r.json()).catch(() => null),
      fetch(RAW + 'matchups.json', { cache: 'no-store' }).then(r => r.json()).catch(() => null),
      fetch(RAW + 'sighist-' + ymOffset(0) + '.json', { cache: 'no-store' }).then(r => r.ok ? r.json() : null).catch(() => null),
      fetch(RAW + 'sighist-' + ymOffset(-1) + '.json', { cache: 'no-store' }).then(r => r.ok ? r.json() : null).catch(() => null),
      fetch(RAW + 'sighist-' + ymOffset(-2) + '.json', { cache: 'no-store' }).then(r => r.ok ? r.json() : null).catch(() => null)
    ]);
    STATS = {}; (st.cards || []).forEach(c => STATS[c.jp] = c);
    TAGS = (tg && tg.cards) || {};
    POT = (pt && pt.cards) || null;
    EVAL = (wt && wt.cards) || null;
    META = (dk && Array.isArray(dk.meta)) ? dk.meta : null;
    MATCH = (mu && mu.months) ? mu : null;
    SIGHIST_DECKS = mergeSighist([sh0, sh1, sh2]);
    render();
  } catch (e) {
    wrap.innerHTML = '<div class="coming-soon"><div class="big">📡</div>' + _tr('データの取得に失敗しました。時間をおいて再読み込みしてください') + '</div>';
  }
}
window.addEventListener('crlangchange', () => { try { render(); } catch (e) {} });
if (document.readyState !== 'loading') init();
else document.addEventListener('DOMContentLoaded', init);

// ★sitebar（ロゴ＋ナビ＋戻る）の高さを測ってCSS変数に＝タブのスティッキー位置をその下に合わせる
(function () {
  const sb = document.querySelector('.sitebar');
  if (!sb) return;
  const setH = () => document.documentElement.style.setProperty('--sbH', sb.offsetHeight + 'px');
  setH();
  window.addEventListener('resize', setH);
  window.addEventListener('load', setH);
})();
