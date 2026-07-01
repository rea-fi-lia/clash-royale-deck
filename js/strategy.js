/* =============================================================
 *  デッキ診断 v2（§8.11 D1 + アンチシナジー + 初手事故率）
 *  - 構造: 大枠（総評・事故率・警告）→ <details>で詳細チェック
 *  - 材料: 公開表示用JSON + card-stats/card-tags/card-potential（カード定義）
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
function dataFreshUrl(path) {
  const url = (/^(https?:)?\/\//.test(path) || String(path).charAt(0) === '/') ? path : RAW + path;
  return url + (url.indexOf('?') >= 0 ? '&' : '?') + 'cb=' + Date.now();
}
function allowPublicJsonFallback() {
  try {
    const h = location.hostname || '';
    const local = location.protocol === 'file:' || h === 'localhost' || h === '127.0.0.1' || h.endsWith('.local');
    if (local) return true;
    const prod = h === 'crdeckbuilders.com' || h.endsWith('.crdeckbuilders.com');
    return !prod && new URLSearchParams(location.search || '').get('publicJsonFallback') === '1';
  } catch (e) { return false; }
}
function fetchPublicStrategyJson(name) {
  if (!allowPublicJsonFallback()) return Promise.resolve(null);
  return fetch(dataFreshUrl(name), { cache: 'no-store' }).then(r => r.ok ? r.json() : null).catch(() => null);
}
const SPELL_ZONES = ['ログ圏内', 'ザップ圏内', '矢の雨圏内', 'ファイボ圏内', 'ポイズン圏内', 'ライトニング圏内', 'ロケット圏内'];
function _t(k, v) { return window.CRI18N ? CRI18N.t(k, v) : k; }
function _tr(s) { return window.CRI18N ? CRI18N.tr(s) : s; }

let STATS = null, TAGS = null, POT = null, VECTORS = null, DECK = null, WINCON = null, STRATEGY_INTEL = null;

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

function vectorOf(c) {
  if (!VECTORS) return null;
  return VECTORS[c.name + mark(c)] || VECTORS[c.name] || null;
}
function vectorValue(v, key) {
  if (!v) return 0;
  if (key.indexOf('sub.') === 0) return Number(v.sub && v.sub[key.slice(4)]) || 0;
  return Number(v[key]) || 0;
}
const CAP_AXES = [
  { k: '対空', it: ['sub.antiAir', 'sub.airClear', 'def'] },
  { k: 'タンク処理', it: ['sub.tank', 'sub.mid', 'fire'] },
  { k: '小物処理', it: ['sub.small', 'sub.swarm', 'area'] },
  { k: 'タワー圧', it: ['reach', 'sub.range', 'sub.tempo', 'fire'] },
  { k: '施設攻略', it: ['reach', 'sub.range', 'fire', 'ctrl'] },
  { k: '耐久', it: ['dur', 'sub.bigBlock'], avg: true },
  { k: '回転', it: ['cycle', 'flex'], avg: true }
];

// ★デッキ能力を公開用エリクサー価値ベクトルから組み立てる
function capScores(deck) {
  if (!VECTORS) return null;
  const E = deck.map(c => ({ e: vectorOf(c) }));
  if (E.filter(x => x.e).length < 6) return null;
  const out = {};
  CAP_AXES.slice(0, 5).forEach(ax => {
    const c = E.map(x => x.e ? Math.max.apply(null, ax.it.map(it => vectorValue(x.e, it))) : 0).sort((a, b) => b - a);
    out[ax.k] = Math.max(0, Math.min(10, Math.round((0.65 * (c[0] || 0) + 0.35 * (c[1] || 0)) * 10) / 10));
  });
  return out;
}

// ★相手の型→"核の脅威"に、自分が答えを持つか（公開用ベクトルの軸で判定）
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

// ★デッキ能力（公開用エリクサー価値ベクトルから集計）。
//   各軸＝関連項目をカードごとに最大化→デッキは「担い手1位＋0.35×2位」。耐久/回転は全体平均。
function capabilityHtml(deck) {
  if (!VECTORS) return '';
  const E = deck.map(c => ({ c: c, e: vectorOf(c) }));
  if (E.filter(x => x.e).length < 6) return '';
  const axData = CAP_AXES.map(ax => {
    const contrib = E.map(x => {
      const v = x.e ? Math.max.apply(null, ax.it.map(it => vectorValue(x.e, it))) : 0;
      return { c: x.c, v: v };
    }).sort((a, b) => b.v - a.v);
    let score = ax.avg
      ? contrib.reduce((s, x) => s + x.v, 0) / E.length
      : 0.65 * contrib[0].v + 0.35 * (contrib[1] ? contrib[1].v : 0);
    score = Math.max(0, Math.min(10, Math.round(score * 10) / 10));
    return { l: _tr(ax.k), raw: ax.k, score: score, carry: (!ax.avg && contrib[0].v >= 4) ? contrib[0].c : null };
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
    + '<div class="cap-weak">🛠 ' + _tr('伸ばすなら') + '：「' + weak.l + '」' + _tr('は控えめ。') + capAdvice(weak.raw) + '</div></div>';
  return '<div class="dg-cap"><div class="cap-head">⚙️ ' + _tr('デッキ能力') + '</div>'
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
    '耐久': '主力を固めすぎず、受け札を重ねて残る形を作る',
    '回転': '重い札を抱えた時は無理に攻めず、軽い受けから手札を整える'
  };
  return _tr(M[l] || '立ち回りでカバーしよう');
}

// ★相性表：核JSONは直接読まず、Worker APIでこのデッキに必要な範囲だけ受け取る。
function selfArchs(deck) {
  // WINCONS順＝オーナー監修の優先度。デッキ内の勝ち筋を形態サフィックス付きで返す
  const out = [];
  WINCONS.forEach(w => { const c = deck.find(x => x.name === w); if (c) out.push(c.name + mark(c)); });
  return out;
}
function matchupHtml(deck) {
  const rows = (STRATEGY_INTEL && STRATEGY_INTEL.matchups) || [];
  if (!rows.length) return '';
  const html = rows.slice(0, 6).map(function (r) {
    const dom = typeof r.dominanceAvg === 'number' ? r.dominanceAvg : 0;
    const cls = dom >= 0.08 ? 'mu-good' : dom <= -0.08 ? 'mu-bad' : 'mu-even';
    const text = dom <= -0.12 ? _tr('押し込まれやすい') : dom < 0 ? _tr('やや苦しい') : _tr('互角に近い');
    const notes = [];
    if (typeof r.wr === 'number') notes.push(_tr('勝率') + ' ' + r.wr + '%');
    if (typeof r.collapseLossRate === 'number') notes.push(_tr('崩れる負け') + ' ' + r.collapseLossRate + '%');
    notes.push(_tr('実戦') + (r.games || 0) + _tr('戦'));
    return '<div class="mu-row"><span class="mu-opp">' + _tr(r.opponent || '相手') + '<small>' + text + '</small></span>'
      + '<span class="mu-wr ' + cls + '">' + signedNum(dom * 100, 1) + '</span></div>'
      + '<div class="sr-note">' + notes.join(' / ') + '</div>';
  }).join('');
  return '<div class="dg-cap"><div class="cap-head">🛡️ ' + _tr('苦しい相手') + '</div>' + html + '</div>';
}

// ★Fugu実戦読み（第一歩）：構造上の第二軸候補＋Actionsで貯めたPoL支配度を診断に出す。
function deckSigForPol(deck) {
  const names = deck.map(c => c.name).slice().sort();
  const special = deck.filter(c => c.f === 'e' || c.f === 'h' || (c.info && c.info.ch)).map(c => c.name).sort();
  return names.join('|') + '#' + special.join('|');
}
function polRecordForDeck(deck) {
  return (STRATEGY_INTEL && STRATEGY_INTEL.pol) || null;
}
function signedNum(v, digits) {
  if (typeof v !== 'number' || !isFinite(v)) return '—';
  const p = Math.pow(10, digits || 1), n = Math.round(v * p) / p;
  return (n > 0 ? '+' : '') + n.toFixed(digits == null ? 1 : digits);
}
function secondAxisHint(deck, ctx) {
  const wins = (ctx && ctx.wins ? ctx.wins : []).map(c => c.name + mark(c));
  const names = {}; deck.forEach(c => names[c.name] = c.name + mark(c));
  if (wins[1]) return { main: wins[0], second: wins[1], source: _tr('勝ち筋カード') };
  const pairs = [
    [['ディガー', 'ポイズン'], 'ディガー＋ポイズン', '継続削り'],
    [['ホグライダー', 'アースクエイク'], 'ホグ＋アースクエイク', '建物突破'],
    [['ロイヤルホグ', 'アースクエイク'], 'ロイホグ＋アースクエイク', '建物突破'],
    [['巨大クロスボウ', 'ロケット'], 'Xボウ＋ロケット', '固定削り'],
    [['迫撃砲', 'ロケット'], '迫撃＋ロケット', '固定削り']
  ];
  for (let i = 0; i < pairs.length; i++) {
    if (pairs[i][0].every(n => names[n])) return { main: wins[0] || pairs[i][1], second: pairs[i][1], source: _tr(pairs[i][2]) };
  }
  const spells = (ctx && ctx.spells ? ctx.spells : []).filter(c => ['ロケット', 'ライトニング', 'ポイズン', 'ファイアボール', 'アースクエイク'].indexOf(c.name) >= 0);
  if (spells.length) return { main: wins[0] || '—', second: spells.sort((a, b) => b.info.c - a.info.c)[0].name + _tr('削り'), source: _tr('呪文補助') };
  return { main: wins[0] || '—', second: '', source: '' };
}
function fuguIntelHtml(deck, ctx) {
  const axis = secondAxisHint(deck, ctx);
  const rec = polRecordForDeck(deck);
  let html = '<div class="dg-cap"><div class="cap-head">🧠 ' + _tr('Fugu実戦読み') + '（β）</div>'
    + '<div class="dg-row dg-ok"><span class="dg-ico">🎯</span><div class="dg-body"><div class="dg-title">' + _tr('勝ち筋軸') + '</div>'
    + '<div class="dg-detail">' + _tr('主軸') + '：<b>' + axis.main + '</b>'
    + (axis.second ? ' ／ ' + _tr('第二軸候補') + '：<b>' + axis.second + '</b>' + (axis.source ? ' <small>（' + axis.source + '）</small>' : '') : ' ／ ' + _tr('第二軸候補は実戦の記録が増えるほど見えやすくなります'))
    + '</div></div></div>';
  if (rec && rec.data && rec.data.games) {
    const d = rec.data, dom = typeof d.dominanceAvg === 'number' ? d.dominanceAvg : 0;
    const cls = dom >= 0.08 ? 'mu-good' : dom <= -0.08 ? 'mu-bad' : 'mu-even';
    const w = Math.min(48, Math.abs(dom) * 80);
    const fill = dom >= 0
      ? '<span class="mu-fill ' + cls + '" style="left:50%;width:' + w + '%"></span>'
      : '<span class="mu-fill ' + cls + '" style="right:50%;width:' + w + '%"></span>';
    const notes = [
      _tr('勝率') + ' ' + (typeof d.wr === 'number' ? d.wr + '%' : '—'),
      _tr('真価') + ' ' + (typeof d.truePower === 'number' ? d.truePower : '—'),
      _tr('クラウン差') + ' ' + signedNum(d.crownMarginAvg, 2)
    ];
    if (typeof d.leakAdvantageAvg === 'number') notes.push(_tr('エリ漏れ差') + ' ' + signedNum(d.leakAdvantageAvg, 2));
    html += '<div class="mu-row"><span class="mu-opp">' + _tr('実戦支配度') + '<small>' + _tr('塔HP・クラウン・キング圧') + '</small></span>'
      + '<span class="mu-bar">' + fill + '</span>'
      + '<span class="mu-wr ' + cls + '">' + signedNum(dom * 100, 1) + '<small>' + d.games + _tr('戦') + '</small></span></div>'
      + '<div class="sr-note">' + notes.join(' / ') + (rec.exact ? '' : ' / ' + _tr('同じ8枚の形態違いを含む近似')) + '</div>';
  } else {
    html += '<div class="sr-note">' + _tr('実戦の傾向は、近い構成が増えるほどここに出ます。') + '</div>';
  }
  return html + '</div>';
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
function publicDeckRows(j) {
  const out = {};
  function addList(list) {
    (list || []).forEach(function (d) {
      if (!d || !Array.isArray(d.slots) || d.slots.length !== 8) return;
      const names = d.slots.slice();
      const forms = Array.isArray(d.forms) ? d.forms.map(function (f) { return f === 'evo' ? 'e' : f === 'hero' ? 'h' : 'n'; }) : names.map(function () { return 'n'; });
      const games = Number(d.games || d.count || d.uniq || 0) || 0;
      const wr = Number(d.winRate);
      if (games < SIM_MINGAMES && !isFinite(wr)) return;
      const key = names.map(function (n, i) { return n + ':' + forms[i]; }).sort().join('|');
      const row = { names: names, forms: forms, g: games, w: isFinite(wr) ? games * wr / 100 : 0, wr: isFinite(wr) ? wr : null };
      if (!out[key] || (row.g || 0) > (out[key].g || 0)) out[key] = row;
    });
  }
  const win = j && j.defaultWindow && j.windows && j.windows[j.defaultWindow] ? j.windows[j.defaultWindow] : j;
  addList(win && win.winDecks);
  addList(win && win.decks);
  addList(win && win.trending);
  return Object.keys(out).map(function (k) { return out[k]; });
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
    const wr = d.wr != null ? d.wr : Math.round(d.w / d.g * 1000) / 10;
    rows.push({ wr: wr, g: d.g, self: (!out.length && !inc.length), out: out, inc: inc, eh: eh });
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
  return '<div class="dg-simrank">' + selfLine
    + '<div class="sr-note">' + _tr('あなたのデッキと6枚以上かぶる構成の通算勝率。左の抜く→右の入れるが差分（⚡限界突破/👑ヒーローも区別）。「入れ替える」で今のデッキに反映。') + '</div>'
    + tabs
    + '<div class="sr-pane" data-sub="up"' + (_simSub === 'up' ? '' : ' hidden') + '><div class="sr-sub sr-good">' + _tr('勝率の高い構成') + '</div><div class="sr-list">' + listOrEmpty(wins) + '</div></div>'
    + '<div class="sr-pane" data-sub="down"' + (_simSub === 'down' ? '' : ' hidden') + '><div class="sr-sub sr-bad">' + _tr('勝率の低い構成') + '</div><div class="sr-list">' + listOrEmpty(loses) + '</div>'
    + '<div class="sr-note">' + _tr('※ いまは「この変更だと勝率が下がる」例。相手の勝ち筋に効く対策カード提案は今後追加予定。') + '</div></div>'
    + '</div>';
}
// ★ランキングの「入れ替える」＝今のデッキにその差分を適用→再診断＋戻る先にも反映
// Index準拠のスロット再配置：進化=枠1(0)→枠3(2) / ヒーロー=枠2(1)→枠3(2) / ノーマル=空き枠に順に（並びは自由）
function reslotDeck(cards) {
  const slots = [null, null, null, null, null, null, null, null];
  const placed = new Set();
  const demoted = [];
  const put = (c, i) => { slots[i] = c; placed.add(c); };
  // 進化：枠1(0)→枠3(2)、最大2、超過は解除
  let evoN = 0;
  cards.forEach(c => { if (c.f !== 'e') return; if (evoN === 0 && !slots[0]) { put(c, 0); evoN++; } else if (evoN < 2 && !slots[2]) { put(c, 2); evoN++; } else demoted.push({ name: c.name, f: 'n', info: c.info }); });
  // チャンピオン(info.ch)：枠2(1)優先→枠3(2)、最大2（2024〜2枚編成可）。形態はnのままだが必ず2/3枠へ
  let champN = 0;
  cards.forEach(c => { if (placed.has(c) || c.f === 'e' || !(c.info && c.info.ch)) return; if (champN < 2) { if (!slots[1]) { put(c, 1); champN++; } else if (!slots[2]) { put(c, 2); champN++; } } });
  // ヒーロー(h)：枠2(1)→枠3(2)、最大1、超過は解除
  let heroN = 0;
  cards.forEach(c => { if (c.f !== 'h' || placed.has(c)) return; if (heroN === 0 && !slots[1]) { put(c, 1); heroN++; } else if (heroN === 0 && !slots[2]) { put(c, 2); heroN++; } else demoted.push({ name: c.name, f: 'n', info: c.info }); });
  // 残り（通常・枠に入れなかったチャンピオン・降格分）：空き枠へ順に
  cards.forEach(c => { if (placed.has(c) || c.f === 'e' || c.f === 'h') return; for (let i = 0; i < 8; i++) { if (!slots[i]) { put(c, i); break; } } });
  demoted.forEach(c => { for (let i = 0; i < 8; i++) { if (!slots[i]) { put(c, i); break; } } });
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
  // ★入れ替え後＝そのランカーの実デッキ。デッキ作成と同じく特殊枠を最大活用：まずランカー記録(data-rf)を反映
  const rankerForm = {}; rfList.forEach(function (x) { rankerForm[x.name] = x.form; });
  next = next.map(function (c) {
    const want = rankerForm[c.name]; // 'e' | 'h' | undefined（チャンピオンはinfo.chでreslotが枠2/3へ）
    const can = want === 'e' ? !!(c.info && c.info.iv) : want === 'h' ? !!(c.info && c.info.ih) : false;
    return { name: c.name, f: (want && can) ? want : 'n', info: c.info };
  });
  // 進化は最大2枠。ランカーの形態記録が欠けても、進化可能なカードがあれば埋める（＝枠を遊ばせない／チャンピオンは枠2/3なので除外）
  let _evoN = next.filter(function (c) { return c.f === 'e'; }).length;
  if (_evoN < 2) next = next.map(function (c) {
    if (_evoN >= 2 || c.f !== 'n' || !(c.info && c.info.iv) || (c.info && c.info.ch)) return c;
    _evoN++; return { name: c.name, f: 'e', info: c.info };
  });
  DECK = reslotDeck(next); // Index準拠で進化/ヒーローを定位置に
  const names = DECK.map(c => c.name).join(',');
  const fs = DECK.map(c => _fnorm(c.f)).join('');
  const q = '?deck=' + encodeURIComponent(names) + '&f=' + fs;
  try { history.replaceState(null, '', 'strategy.html' + q); } catch (e) {}
  document.querySelectorAll('.back-link').forEach(a => { a.href = 'index.html' + q; });
  render();
  // ★入れ替え後はトップへ戻さない＝固定バー(4×2)がその場で更新。リストのスクロール位置を維持
}


const GICON = { good: '◎', ok: '○', warn: '⚠', bad: '❌', info: 'ℹ️' };
// ===== 新・デッキ診断（2026-06-26 全面刷新）=====
//   旧 archetype/verdict/checks/旧実戦読みカード は不使用。採点でなく「どんなデッキで・実戦でどう勝ってて・どこが強い/苦手か」を平易な言葉で。
//   ★ユーザー向け文言に内部用語（収集元・外部名など裏側がわかる語）は出さない。
function winOf(c) { if (!WINCON) return null; return WINCON[c.name + mark(c)] || WINCON[c.name] || null; }
function polOf(deck) {
  return STRATEGY_INTEL && STRATEGY_INTEL.pol && STRATEGY_INTEL.pol.data ? STRATEGY_INTEL.pol.data : null;
}
function winClassGroup(sc, cls) {
  return sc.filter(function (x) { return x.w && x.w.class === cls; }).sort(function (a, b) {
    return (b.w.mainWinconScore + b.w.secondaryWinconScore + b.w.finishingScore) - (a.w.mainWinconScore + a.w.secondaryWinconScore + a.w.finishingScore);
  });
}
function winChipGroup(title, arr) {
  if (!arr.length) return '';
  return '<div class="dg-detail"><b>' + _tr(title) + '</b>：' + arr.slice(0, 4).map(function (x) { return x.c.name + mark(x.c); }).join(' / ') + '</div>';
}
function cycleFitLine(cycles) {
  if (!cycles.length) return '';
  const labels = cycles.map(function (x) {
    const t = x.w.attackType;
    if (t === 'cycleGroundDps') return x.c.name + _tr('＝地上DPSで受ける');
    if (t === 'cyclePoke') return x.c.name + _tr('＝対空も橋前ちょっかいもできる');
    if (t === 'cycleDpsPressure') return x.c.name + _tr('＝地上小物処理と入った時の削り');
    if (t === 'cycleSplash') return x.c.name + _tr('＝小物処理を補う');
    if (t === 'cycleReset') return x.c.name + _tr('＝リセットと連鎖処理');
    if (t === 'cycleFreeze') return x.c.name + _tr('＝足止めで1発を作る');
    if (t === 'cycleHeal') return x.c.name + _tr('＝反撃の生存時間を伸ばす');
    if (t === 'cycleDefense') return x.c.name + _tr('＝囲み・タゲ取りで受ける');
    return x.c.name;
  });
  return '<div class="dg-detail"><b>' + _tr('サイクル調整枠') + '</b>：' + labels.join(' / ') + '</div>';
}
function defenseFitLine(defenses) {
  if (!defenses.length) return '';
  const labels = defenses.map(function (x) {
    const t = x.w.attackType;
    if (t === 'defensiveSplash') return x.c.name + _tr('＝複数体をまとめて処理');
    if (t === 'kiteTank') return x.c.name + _tr('＝逆サイド釣りと時間稼ぎ');
    return x.c.name;
  });
  return '<div class="dg-detail"><b>' + _tr('防衛調整枠') + '</b>：' + labels.join(' / ') + '</div>';
}
function practicalRead(mains, secs, supports, cycles, defenses, avg) {
  const bits = [];
  if (!mains.length) bits.push(_tr('主軸が薄いので、相手に守りを固められると削り切る道筋が曖昧です'));
  else if (!secs.length && !supports.length) bits.push(_tr('攻めの入口が主軸に寄っています。止められた時の別ルートが課題です'));
  else if (secs.length) bits.push(_tr('主軸が止まっても、第2勝ち筋で削り直す道があります'));
  else bits.push(_tr('第2勝ち筋は薄めですが、補助勝ち筋で追加ダメージを作れます'));
  if (avg < 3.1 && cycles.length) bits.push(_tr('高回転で主軸を何度も回し、相手の受け札をずらす形です'));
  if (avg >= 4.0 && cycles.length <= 1) bits.push(_tr('重めなので、序盤は無理に攻めず受けから形を作る必要があります'));
  if (defenses.length) bits.push(_tr('防衛札で受け方を調整し、守ってから攻めへつなげる形です'));
  if (supports.length >= 2) bits.push(_tr('残ったユニットでタワーに触る展開を作りやすいです'));
  return bits.join('。') + '。';
}
function diagnoseHtml(deck) {
  let h = '';
  // 1) このデッキの特徴（監修済みの勝ち筋スコア）
  const sc = deck.map(function (c) { return { c: c, w: winOf(c) }; });
  const mains = winClassGroup(sc, '勝ち筋');
  const secs = winClassGroup(sc, '第2勝ち筋');
  const supports = winClassGroup(sc, '補助勝ち筋');
  const cycles = winClassGroup(sc, 'サイクル札');
  const defenses = winClassGroup(sc, '防衛札');
  const costs = deck.map(function (c) { return c.info.c; });
  const avg = costs.reduce(function (s, v) { return s + v; }, 0) / 8;
  const typ = avg < 3.1 ? _tr('高速で回すタイプ') : avg < 3.8 ? _tr('バランス型') : avg < 4.4 ? _tr('やや重めの構え') : _tr('重量級（序盤の受けに注意）');
  const mn = mains[0] ? (mains[0].c.name + mark(mains[0].c)) : null;
  const sn = secs[0] ? (secs[0].c.name + mark(secs[0].c)) : null;
  let line = mn ? (_tr('主役は') + '<b>' + mn + '</b>') : _tr('タワーを削る明確な主役が見当たりません');
  if (mn && sn) line += _tr('。詰めや別ルートに') + '<b>' + sn + '</b>' + _tr('も使える形');
  else if (mn && supports[0]) line += _tr('。追加ダメージ役に') + '<b>' + supports[0].c.name + mark(supports[0].c) + '</b>' + _tr('を使える形');
  line += '。' + typ + '（' + _tr('平均コスト') + avg.toFixed(1) + '）。';
  h += '<div class="dg-cap"><div class="cap-head">🃏 ' + _tr('このデッキの特徴') + '</div><div class="dg-detail">' + line + '</div>'
    + winChipGroup('主軸', mains) + winChipGroup('第2勝ち筋', secs) + winChipGroup('補助勝ち筋', supports) + cycleFitLine(cycles) + defenseFitLine(defenses)
    + '<div class="dg-detail"><b>' + _tr('読み') + '</b>：' + practicalRead(mains, secs, supports, cycles, defenses, avg) + '</div>'
    + '<div class="dg-chips">' + mains.concat(secs).concat(supports).slice(0, 4).map(function (x) { return chip(x.c); }).join('') + '</div></div>';
  // 2) 実戦での傾向（同じ構成の戦績があるときだけ）
  const p = polOf(deck);
  if (p && p.games >= 30) {
    const d = p.dominanceAvg;
    const dw = d >= 0.12 ? _tr('相手より大きく押し込めています') : d <= -0.12 ? _tr('やや押し込まれ気味で、競り負けやすい傾向') : _tr('互角の競り合いになりやすい');
    const ww = p.collapseLossRate >= 22 ? _tr('負けるときは大きく崩れがち') : p.fragileWinRate >= 12 ? _tr('勝ち切れるものの、際どい勝ちも多め') : p.cleanWinRate >= 25 ? _tr('勝つときはきれいに押し切れています') : _tr('堅実に勝てています');
    const lw = p.leakAdvantageAvg >= 0.8 ? _tr('手札は回しやすめ') : p.leakAdvantageAvg <= -0.8 ? _tr('エリクサー管理はシビア') : '';
    h += '<div class="dg-cap"><div class="cap-head">⚔️ ' + _tr('実戦での傾向') + '<small>（' + _tr('実戦') + p.games + _tr('戦') + '）</small></div>'
      + '<div class="dg-detail">' + dw + '。' + ww + '。' + (lw ? lw + '。' : '') + '</div></div>';
  }
  // 3) 強み・弱み（カード評価ベース） 4) 苦手な相手（相性）＝既存のデータ表示を流用
  try { h += capabilityHtml(deck); } catch (e) {}
  try { h += matchupHtml(deck); } catch (e) {}
  h += '<p class="note" style="margin-top:14px">' + _tr('※ 数値は参考値です。同じ構成の実戦記録が増えるほど精度が上がります。') + '</p>';
  return h;
}

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

  const deckHtml = '<div class="dg-deckbar"><div class="dg-deck">' + DECK.map(c => {
    const img = c.f === 'e' ? c.info.iv : c.f === 'h' ? c.info.ih : c.info.i;
    const badge = c.f === 'e' ? '<span class="slot-badge">⚡</span>' : c.f === 'h' ? '<span class="slot-badge">👑</span>' : '';
    return '<div class="mini-card' + (c.f === 'e' ? ' is-evo' : c.f === 'h' ? ' is-hero' : '') + '" data-key="' + c.name + ':' + _fnorm(c.f) + '"><span class="pip">' + c.info.c + '</span>' + badge + '<img src="' + img + '" alt="' + c.name + '"></div>';
  }).join('') + '</div></div>';

  const html = diagnoseHtml(DECK); // ★新診断（特徴/実戦傾向/強み弱み/苦手相手）。旧 archetype/verdict/実戦読み/checks は廃止
  const simHtml = similarRankingHtml(DECK) || ('<div class="sr-note">' + _tr('似たデッキのデータを蓄積中です。時間が経つほど充実します。') + '</div>');
  const tabs = '<div class="diag-tabs"><button class="dtab' + (_diagTab === 'main' ? ' active' : '') + '" data-tab="main">' + _tr('診断') + '</button>'
    + '<button class="dtab' + (_diagTab === 'sim' ? ' active' : '') + '" data-tab="sim">📊 ' + _tr('デッキ調整') + '</button></div>';
  // タブ名は「デッキ強化」→「デッキ調整」に変更（2026-06-24・VISION§4「断定しない/関係性で見せる」に寄せる）
  wrap.innerHTML = deckHtml + tabs
    + '<div class="diag-panel" data-panel="main"' + (_diagTab === 'main' ? '' : ' hidden') + '>' + html + '</div>'
    + '<div class="diag-panel" data-panel="sim"' + (_diagTab === 'sim' ? '' : ' hidden') + '>' + simHtml + '</div>';
  wrap.querySelectorAll('.dtab').forEach(function (t) {
    t.addEventListener('click', function () {
      _diagTab = t.dataset.tab;
      wrap.querySelectorAll('.dtab').forEach(function (x) { x.classList.toggle('active', x === t); });
      wrap.querySelectorAll('.diag-panel').forEach(function (p) { p.hidden = (p.dataset.panel !== _diagTab); });
      wrap.classList.toggle('tab-sim', _diagTab === 'sim'); // 強化タブだけデッキを上部固定
      try { selectFirstRow(); } catch (e) {} // タブ切替で発光を更新（強化タブの時のみ点灯）
    });
  });
  wrap.querySelectorAll('.srtab').forEach(function (t) {
    t.addEventListener('click', function () {
      _simSub = t.dataset.sub;
      wrap.querySelectorAll('.srtab').forEach(function (x) { x.classList.toggle('active', x === t); });
      wrap.querySelectorAll('.sr-pane').forEach(function (p) { p.hidden = (p.dataset.sub !== _simSub); });
      try { selectFirstRow(); } catch (e) {}
    });
  });
  wrap.querySelectorAll('.sr-swap').forEach(function (b) {
    b.addEventListener('click', function (e) { e.stopPropagation(); applyDeckSwap(b.dataset.out, b.dataset.in, b.dataset.rf); });
  });
  // 候補をタップ＝入れ替え元(out)を現デッキバー＆上の8枚で発光
  function srHighlight(keys) {
    wrap.querySelectorAll('.dg-deck .mini-card').forEach(function (el) { // 上のデッキ表示で入れ替え元を発光
      el.classList.toggle('hot', (keys || []).indexOf(el.dataset.key) >= 0);
    });
  }
  function selectFirstRow() { // 一番上の候補をデフォルト選択＝上のデッキで入れ替え元を発光（強化タブの時だけ）
    if (_diagTab !== 'sim') { srHighlight([]); return; }
    var pane = wrap.querySelector('.sr-pane[data-sub="' + _simSub + '"]');
    var row = pane ? pane.querySelector('.sr-row') : null;
    var btn = row ? row.querySelector('.sr-swap') : null;
    srHighlight(btn ? (btn.dataset.out || '').split(',').filter(Boolean) : []);
    wrap.querySelectorAll('.sr-row').forEach(function (r) { r.classList.toggle('sr-sel', r === row); });
  }
  wrap.querySelectorAll('.sr-row').forEach(function (row) {
    function selectRow() {
      var btn = row.querySelector('.sr-swap');
      var keys = btn ? (btn.dataset.out || '').split(',').filter(Boolean) : [];
      srHighlight(keys);
      wrap.querySelectorAll('.sr-row').forEach(function (r) { r.classList.toggle('sr-sel', r === row); });
    }
    row.addEventListener('click', selectRow);
    // 素早いタップにも即反応（clickの遅延/取りこぼし対策。動かさず離した時だけ＝スクロールと区別。selectRowは冪等なので二重発火しても無害）
    var _sy = 0, _moved = false;
    row.addEventListener('touchstart', function (e) { _sy = e.touches[0].clientY; _moved = false; }, { passive: true });
    row.addEventListener('touchmove', function (e) { if (Math.abs(e.touches[0].clientY - _sy) > 8) _moved = true; }, { passive: true });
    row.addEventListener('touchend', function (e) { if (!_moved && !(e.target && e.target.closest && e.target.closest('.sr-swap'))) selectRow(); }, { passive: true });
  });
  wrap.classList.toggle('tab-sim', _diagTab === 'sim'); // 強化タブだけデッキを上部固定
  try { selectFirstRow(); } catch (e) {}
  var dt = wrap.querySelector('.diag-tabs');
  if (dt) document.documentElement.style.setProperty('--tabsH', dt.offsetHeight + 'px'); // サブタブの固定位置をメインタブ直下に
}

async function init() {
  DECK = parseDeck();
  if (DECK) DECK = reslotDeck(DECK); // 初期表示も上限是正＋進化/ヒーロー/チャンピオンを定位置に
  document.querySelectorAll('.back-link').forEach(function (a) { a.href = 'index.html' + (location.search || ''); }); // 同じdeck/fを渡して復元（上下の戻る共通）
  const empty = document.getElementById('diagEmpty');
  const wrap = document.getElementById('diagResult');
  if (!DECK) { if (empty) empty.style.display = ''; return; }
  if (empty) empty.style.display = 'none';
  wrap.innerHTML = '<div class="coming-soon"><div class="big">🔬</div>' + _tr('診断中…') + '</div>';
  try {
    const apiUrl = '/api/strategy?deck=' + encodeURIComponent(DECK.map(c => c.name).join(',')) + '&f=' + DECK.map(c => c.f).join('');
    const api = await fetch(dataFreshUrl(apiUrl), { cache: 'no-store' }).then(r => r.ok ? r.json() : null).catch(() => null);
    let st, tg, pt, wp, vec, dk;
    if (api && api.cards) {
      STRATEGY_INTEL = api;
      st = api.cards.stats;
      tg = api.cards.tags ? { cards: api.cards.tags } : null;
      pt = api.cards.potential ? { cards: api.cards.potential } : null;
      wp = api.cards.wincon ? { cards: api.cards.wincon } : null;
      vec = api.cards.vectors ? { cards: api.cards.vectors } : null;
      dk = api.cards.publicDecks;
    } else {
      if (!allowPublicJsonFallback()) throw new Error('strategy api unavailable');
      STRATEGY_INTEL = null;
      [st, tg, pt, wp, vec, dk] = await Promise.all([
        fetchPublicStrategyJson('card-stats.json'),
        fetchPublicStrategyJson('card-tags.json'),
        fetchPublicStrategyJson('card-potential.json'),
        fetchPublicStrategyJson('wincon-policy-public-v1.json'),
        fetchPublicStrategyJson('card-elixir-vectors-public-v1.json'),
        fetchPublicStrategyJson('decks-public-v1.json')
      ]);
    }
    STATS = {}; ((st && st.cards) || []).forEach(c => STATS[c.jp] = c);
    TAGS = (tg && tg.cards) || {};
    POT = (pt && pt.cards) || null;
    VECTORS = (vec && vec.cards) || null;
    WINCON = (wp && wp.cards) || null;
    SIGHIST_DECKS = publicDeckRows(dk);
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
