/**
 * CR Deck Builders – 人気デッキ自動更新（Node 移植版）
 *
 * ★これは gas/Code.gs の updateDecks() を Node に忠実移植したもの。GitHub Actions で cron 実行する。
 *   - GAS固有 → Node標準への置換のみ：
 *       UrlFetchApp.fetch / fetchAll  → グローバル fetch（Node 18+）/ Promise.all
 *       PropertiesService             → process.env（下の prop()）
 *       Utilities.sleep / base64      → setTimeout / Buffer
 *       Logger.log                    → console.log
 *   - 集計ロジック（3日ローリング・署名・形態・勝ち筋・matchups・sighist）は Code.gs と 1:1。
 *   - シート系（exportTagSheetV2 等＝SpreadsheetApp依存）は移植しない＝GASに残す（ハイブリッド）。
 *
 * 環境変数（GitHub Actions の env/secrets で渡す）:
 *   CR_TOKEN            … RoyaleAPI トークン（secret・必須）
 *   GITHUB_TOKEN        … Actions が自動付与（contents:write 権限が要る・必須）
 *   GITHUB_REPOSITORY   … "owner/repo"（Actions が自動付与）。手動時は GITHUB_REPO でも可
 *   TARGET_BRANCH       … 書き込み先ブランチ（既定 "data-test"。検証OK後に "data" へ）
 *   DECKS_PATH          … decks.json のパス（既定 "decks.json"＝リポジトリ直下）
 *                         ※ GITHUB_PATH は Actions の予約名なので使わない（DECKS_PATH に改名）
 *   TOP_PLAYERS         … 集計するトップランカー数（既定 "1000"）
 *   INTERVAL_HOURS      … 参考値としてdecks.jsonに載せる（既定 "6"）
 *   WIN_MIN_GAMES_3D    … 勝率ランキングの最低試合数（既定 "30"）
 *
 * ★Phase 1（今）＝この忠実移植で 3日ローリングを再現し、data-test に出して GAS出力(data)と照合。
 * ★Phase 2（後）＝収集を1時間ごとにし、スナップショット(t付き)から 1h/1day/3day の3窓を導出。
 *    （注：収集頻度を上げると延べ使用人数Pは素の合算なので増える＝デッキcountは窓正規化が要る。
 *      カードuseは aggregateCards_ で既に snaps数で正規化済み。Phase 2 で deck側も正規化する。）
 */

'use strict';

const PROXY = 'https://proxy.royaleapi.dev/v1';
const WINDOW_DAYS = 3; // ローリング期間（日）。デッキ・カード共通。
const UA = 'cr-deck-collector'; // ★Node fetch は UA を送らない→GitHub API が 403。全GitHub/CR要求に付与。

function prop(k, def) {
  const v = process.env[k];
  return (v === undefined || v === null || v === '') ? (def === undefined ? null : def) : v;
}
function sleep(ms) { return new Promise(function (r) { setTimeout(r, ms); }); }

// ---- 設定（env） ----
const CR_TOKEN = (prop('CR_TOKEN') || '').replace(/[^A-Za-z0-9._-]/g, '');
const GH_TOKEN = prop('GITHUB_TOKEN');
const REPO = prop('GITHUB_REPO') || prop('GITHUB_REPOSITORY'); // "owner/repo"
const BRANCH = prop('TARGET_BRANCH', 'data-test');
// ★ DECKS_PATH（GITHUB_PATH は Actions 予約名＝env で渡しても内部値に上書きされるので使わない）
const GH_PATH = prop('DECKS_PATH', 'decks.json');

var SLUG2JP = {
  "skeletons": "スケルトン", "ice-spirit": "アイススピリット", "fire-spirit": "ファイアスピリット",
  "electro-spirit": "エレクトロスピリット", "heal-spirit": "ヒールスピリット", "goblins": "ゴブリン",
  "bomber": "ボンバー", "spear-goblins": "槍ゴブリン", "bats": "コウモリの群れ", "ice-golem": "アイスゴーレム",
  "wall-breakers": "ウォールブレイカー", "berserker": "バーサーカー", "zap": "ザップ", "giant-snowball": "巨大雪玉",
  "barbarian-barrel": "ローリングバーバリアン", "the-log": "ローリングウッド", "rage": "レイジ",
  "suspicious-bush": "ステルスブッシュ", "goblin-curse": "ゴブリンの呪い", "knight": "ナイト", "archers": "アーチャー",
  "minions": "ガーゴイル", "goblin-gang": "ゴブリンギャング", "skeleton-barrel": "スケルトンバレル",
  "firecracker": "ロケット砲士", "mega-minion": "メガガーゴイル", "dart-goblin": "吹き矢ゴブリン",
  "elixir-golem": "エリクサーゴーレム", "ice-wizard": "アイスウィザード", "princess": "プリンセス", "miner": "ディガー",
  "skeleton-army": "スケルトン部隊", "guards": "盾の戦士", "bandit": "アサシン ユーノ", "fisherman": "漁師トリトン",
  "royal-ghost": "ロイヤルゴースト", "arrows": "矢の雨", "tornado": "トルネード", "earthquake": "アースクエイク",
  "royal-delivery": "ロイヤルデリバリー", "goblin-barrel": "ゴブリンバレル", "clone": "クローン", "vines": "ヴァイン",
  "void": "ボイド", "mirror": "ミラー", "cannon": "大砲", "tombstone": "墓石", "valkyrie": "バルキリー",
  "musketeer": "マスケット銃士", "mini-pekka": "ミニペッカ", "hog-rider": "ホグライダー", "battle-ram": "攻城バーバリアン",
  "skeleton-dragons": "スケルトンドラゴン", "zappies": "ザッピー", "flying-machine": "ホバリング砲",
  "battle-healer": "バトルヒーラー", "goblin-demolisher": "ダイナマイトゴブリン", "dark-prince": "ダークプリンス",
  "hunter": "ハンター", "baby-dragon": "ベビードラゴン", "electro-wizard": "エレクトロウィザード",
  "inferno-dragon": "インフェルノドラゴン", "lumberjack": "ランバージャック", "magic-archer": "マジックアーチャー",
  "mother-witch": "マザーネクロマンサー", "night-witch": "ダークネクロ", "golden-knight": "ゴールドナイト",
  "skeleton-king": "スケルトンキング", "mighty-miner": "マイティディガー", "phoenix": "フェニックス",
  "rune-giant": "鍛冶屋ジャイアント", "fireball": "ファイアボール", "freeze": "フリーズ", "poison": "ポイズン",
  "goblin-cage": "ゴブリンの檻", "goblin-drill": "ゴブリンドリル", "goblin-hut": "ゴブリンの小屋",
  "bomb-tower": "ボムタワー", "tesla": "テスラ", "mortar": "迫撃砲", "furnace": "オーブン", "barbarians": "バーバリアン",
  "minion-horde": "ガーゴイルの群れ", "giant": "ジャイアント", "wizard": "ウィザード", "balloon": "エアバルーン",
  "witch": "ネクロマンサー", "bowler": "ボウラー", "executioner": "執行人ファルチェ", "cannon-cart": "60式ムート",
  "royal-hogs": "ロイヤルホグ", "rascals": "アウトロー", "electro-dragon": "ライトニングドラゴン", "prince": "プリンス",
  "ram-rider": "ラムライダー", "little-prince": "リトルプリンス", "monk": "モンク", "goblinstein": "ゴブリンシュタイン",
  "boss-bandit": "ボスアサシン", "archer-queen": "アーチャークイーン", "goblin-machine": "ゴブリンマシン",
  "graveyard": "スケルトンラッシュ", "inferno-tower": "インフェルノタワー", "royal-giant": "ロイヤルジャイアント",
  "elite-barbarians": "エリートバーバリアン", "giant-skeleton": "巨大スケルトン", "goblin-giant": "ゴブジャイアント",
  "sparky": "スパーキー", "spirit-empress": "スピリットエンプレス", "rocket": "ロケット", "lightning": "ライトニング",
  "elixir-collector": "エリクサーポンプ", "barbarian-hut": "バーバリアンの小屋", "x-bow": "巨大クロスボウ",
  "pekka": "ペッカ", "lava-hound": "ラヴァハウンド", "electro-giant": "エレクトロジャイアント", "mega-knight": "メガナイト",
  "royal-recruits": "見習い親衛隊", "golem": "ゴーレム", "three-musketeers": "三銃士"
};

var COST = {
  "スケルトン": 1, "アイススピリット": 1, "ファイアスピリット": 1, "エレクトロスピリット": 1, "ヒールスピリット": 1,
  "ゴブリン": 2, "ボンバー": 2, "槍ゴブリン": 2, "コウモリの群れ": 2, "アイスゴーレム": 2, "ウォールブレイカー": 2,
  "バーサーカー": 2, "ザップ": 2, "巨大雪玉": 2, "ローリングバーバリアン": 2, "ローリングウッド": 2, "レイジ": 2,
  "ステルスブッシュ": 2, "ゴブリンの呪い": 2, "ナイト": 3, "アーチャー": 3, "ガーゴイル": 3, "ゴブリンギャング": 3,
  "スケルトンバレル": 3, "ロケット砲士": 3, "メガガーゴイル": 3, "吹き矢ゴブリン": 3, "エリクサーゴーレム": 3,
  "アイスウィザード": 3, "プリンセス": 3, "ディガー": 3, "スケルトン部隊": 3, "盾の戦士": 3, "アサシン ユーノ": 3,
  "漁師トリトン": 3, "ロイヤルゴースト": 3, "矢の雨": 3, "トルネード": 3, "アースクエイク": 3, "ロイヤルデリバリー": 3,
  "ゴブリンバレル": 3, "クローン": 3, "ヴァイン": 3, "ボイド": 3, "ミラー": 1, "大砲": 3, "墓石": 3,
  "バルキリー": 4, "マスケット銃士": 4, "ミニペッカ": 4, "ホグライダー": 4, "攻城バーバリアン": 4, "スケルトンドラゴン": 4,
  "ザッピー": 4, "ホバリング砲": 4, "バトルヒーラー": 4, "ダイナマイトゴブリン": 4, "ダークプリンス": 4, "ハンター": 4,
  "ベビードラゴン": 4, "エレクトロウィザード": 4, "インフェルノドラゴン": 4, "ランバージャック": 4, "マジックアーチャー": 4,
  "マザーネクロマンサー": 4, "ダークネクロ": 4, "ゴールドナイト": 4, "スケルトンキング": 4, "マイティディガー": 4,
  "フェニックス": 4, "鍛冶屋ジャイアント": 4, "ファイアボール": 4, "フリーズ": 4, "ポイズン": 4, "ゴブリンの檻": 4,
  "ゴブリンドリル": 4, "ゴブリンの小屋": 4, "ボムタワー": 4, "テスラ": 4, "迫撃砲": 4, "オーブン": 4,
  "バーバリアン": 5, "ガーゴイルの群れ": 5, "ジャイアント": 5, "ウィザード": 5, "エアバルーン": 5, "ネクロマンサー": 5,
  "ボウラー": 5, "執行人ファルチェ": 5, "60式ムート": 5, "ロイヤルホグ": 5, "アウトロー": 5, "ライトニングドラゴン": 5,
  "プリンス": 5, "ラムライダー": 5, "リトルプリンス": 3, "モンク": 5, "ゴブリンシュタイン": 5, "ボスアサシン": 6,
  "アーチャークイーン": 5, "ゴブリンマシン": 5, "スケルトンラッシュ": 5, "インフェルノタワー": 5, "ロイヤルジャイアント": 6,
  "エリートバーバリアン": 6, "巨大スケルトン": 6, "ゴブジャイアント": 6, "スパーキー": 6, "スピリットエンプレス": 6,
  "ロケット": 6, "ライトニング": 6, "エリクサーポンプ": 6, "バーバリアンの小屋": 6, "巨大クロスボウ": 6,
  "ペッカ": 7, "ラヴァハウンド": 7, "エレクトロジャイアント": 7, "メガナイト": 7, "見習い親衛隊": 7, "ゴーレム": 8, "三銃士": 9
};

function normSlug(name) {
  return String(name).toLowerCase()
    .replace(/\./g, '').replace(/'/g, '').replace(/&/g, 'and')
    .replace(/[^a-z0-9]+/g, '-').replace(/^-+|-+$/g, '');
}
function apiCardToJp(card) { return SLUG2JP[normSlug(card.name)] || null; }

async function crGet(path, token) {
  const res = await fetch(PROXY + path, { headers: { Authorization: 'Bearer ' + token, Accept: 'application/json', 'User-Agent': UA } });
  if (res.status !== 200) throw new Error('CR API ' + res.status + ' for ' + path + ' :: ' + (await res.text()).slice(0, 300));
  return res.json();
}

function deckNameGuess(slots) {
  var wins = ['ホグライダー', 'ロイヤルジャイアント', 'エアバルーン', '巨大クロスボウ', '迫撃砲', 'ゴーレム', 'ラヴァハウンド', 'ペッカ', 'メガナイト', 'ロイヤルホグ', '三銃士', 'スケルトンラッシュ', 'ディガー', 'ゴブリンドリル'];
  for (var i = 0; i < slots.length; i++) { if (wins.indexOf(slots[i]) >= 0) return slots[i] + ' デッキ'; }
  return 'おすすめデッキ';
}

// ★勝ち筋（アーキタイプ）判定。配列の順序＝優先度。★strategy.js / decks.js の WINCONS と同一に保つこと。
var ARCH_WINCONS = ['ラヴァハウンド', 'ゴーレム', 'エレクトロジャイアント', 'エリクサーゴーレム', '三銃士',
  'ゴブジャイアント', 'ジャイアント', '巨大スケルトン', 'スパーキー', '見習い親衛隊', 'ペッカ', 'メガナイト',
  'ボスアサシン', 'ロイヤルジャイアント', '巨大クロスボウ', '迫撃砲', 'エアバルーン', 'スケルトンバレル',
  'ホグライダー', 'ロイヤルホグ', 'ラムライダー', '攻城バーバリアン', 'エリートバーバリアン', 'プリンス',
  'ゴブリンマシン', 'ゴブリンシュタイン', 'モンク', 'アーチャークイーン', 'ゴールドナイト', 'スケルトンラッシュ',
  'ゴブリンバレル', 'ゴブリンドリル', 'ウォールブレイカー', 'マイティディガー', 'ディガー', 'ロケット'];
function archOf_(jpArr) {
  for (var i = 0; i < ARCH_WINCONS.length; i++) if (jpArr.indexOf(ARCH_WINCONS[i]) >= 0) return ARCH_WINCONS[i];
  return 'その他';
}
function archsForm_(jpArr, forms) {
  var out = [];
  for (var i = 0; i < ARCH_WINCONS.length; i++) {
    var idx = jpArr.indexOf(ARCH_WINCONS[i]);
    if (idx >= 0) {
      var f = forms ? forms[idx] : null;
      out.push(ARCH_WINCONS[i] + ((f === 'evo') ? '⚡' : (f === 'hero' || f === 'both') ? '👑' : ''));
    }
  }
  return out.length ? out : ['その他'];
}
function archForm_(jpArr, forms) {
  for (var i = 0; i < ARCH_WINCONS.length; i++) {
    var idx = jpArr.indexOf(ARCH_WINCONS[i]);
    if (idx >= 0) {
      var f = forms ? forms[idx] : null;
      var suf = (f === 'evo') ? '⚡' : (f === 'hero' || f === 'both') ? '👑' : '';
      return ARCH_WINCONS[i] + suf;
    }
  }
  return 'その他';
}

function wilson_(w, g) {
  if (!g) return 0;
  var z = 1.96, p = w / g, n = g;
  return (p + z * z / (2 * n) - z * Math.sqrt((p * (1 - p) + z * z / (4 * n)) / n)) / (1 + z * z / n);
}

function cycHvy_(slots) {
  var cs = (slots || []).map(function (n) { return COST[n] || 0; }).sort(function (a, b) { return a - b; });
  var cyc = 0, hvy = 0;
  for (var i = 0; i < 4 && i < cs.length; i++) cyc += cs[i];
  for (var j = Math.max(0, cs.length - 4); j < cs.length; j++) hvy += cs[j];
  return { cyc: cyc, hvy: hvy };
}

// ---- GitHub I/O（api.github.com 直叩き。GITHUB_TOKEN で contents:write） ----
function ghSiblingPath_(mainPath, name) {
  var i = mainPath.lastIndexOf('/');
  return (i >= 0 ? mainPath.slice(0, i + 1) : '') + name;
}
async function ghReadJson_(path) {
  if (!GH_TOKEN || !REPO) return null;
  // raw メディアタイプ＝1MB超でも全文取れる（base64型は1MB超でcontentが空になり履歴リセット事故）
  var headers = { Authorization: 'Bearer ' + GH_TOKEN, Accept: 'application/vnd.github.raw', 'User-Agent': UA };
  var res = await fetch('https://api.github.com/repos/' + REPO + '/contents/' + path + '?ref=' + BRANCH, { headers: headers });
  if (res.status !== 200) return null;
  try { return JSON.parse(await res.text()); } catch (e) { return null; }
}
async function ghExists_(path) {
  var headers = { Authorization: 'Bearer ' + GH_TOKEN, Accept: 'application/vnd.github.object', 'User-Agent': UA };
  var res = await fetch('https://api.github.com/repos/' + REPO + '/contents/' + path + '?ref=' + BRANCH, { headers: headers });
  return res.status === 200;
}
async function ghWriteJson_(path, obj, message) {
  if (!GH_TOKEN || !REPO) throw new Error('GITHUB_TOKEN / GITHUB_REPOSITORY 未設定');
  var api = 'https://api.github.com/repos/' + REPO + '/contents/' + path;
  var sha = null;
  // object メディアタイプ＝1MB超ファイルでも sha が取れる
  var cur = await fetch(api + '?ref=' + BRANCH, { headers: { Authorization: 'Bearer ' + GH_TOKEN, Accept: 'application/vnd.github.object', 'User-Agent': UA } });
  if (cur.status === 200) { try { sha = (await cur.json()).sha; } catch (e) {} }
  var content = Buffer.from(JSON.stringify(obj)).toString('base64');
  var body = { message: message || ('chore: update ' + path), content: content, branch: BRANCH };
  if (sha) body.sha = sha;
  var put = await fetch(api, {
    method: 'PUT',
    headers: { Authorization: 'Bearer ' + GH_TOKEN, Accept: 'application/vnd.github+json', 'User-Agent': UA, 'Content-Type': 'application/json' },
    body: JSON.stringify(body)
  });
  if (put.status !== 200 && put.status !== 201) throw new Error('GitHub write ' + path + ' ' + put.status + ' :: ' + (await put.text()).slice(0, 200));
}

// 窓内のスナップショットからカード単体を集計（Code.gs aggregateCards_ と同一）
function aggregateCards_(snaps) {
  var keys = {}, n = snaps.length || 1;
  snaps.forEach(function (s) {
    Object.keys(s.use || {}).forEach(function (k) { keys[k] = 1; });
    Object.keys(s.bat || {}).forEach(function (k) { keys[k] = 1; });
  });
  var latest = snaps[snaps.length - 1] || { use: {}, players: 0 };
  var prior = snaps.slice(0, -1);
  var basePlayers = 0, baseUse = {};
  prior.forEach(function (s) {
    basePlayers += (s.players || 0);
    var u = s.use || {};
    Object.keys(u).forEach(function (k) { baseUse[k] = (baseUse[k] || 0) + u[k]; });
  });
  var out = [];
  Object.keys(keys).forEach(function (name) {
    var useSum = 0, g = 0, w = 0;
    snaps.forEach(function (s) {
      var pl = s.players || 0;
      if (pl > 0 && s.use && s.use[name]) useSum += s.use[name] / pl;
      if (s.bat && s.bat[name]) { g += s.bat[name][0]; w += s.bat[name][1]; }
    });
    var use = Math.round(useSum / n * 1000) / 10;
    var winr = g > 0 ? Math.round(w / g * 1000) / 10 : null;
    var rise = null;
    if (prior.length >= 1 && latest.players > 0) {
      var curRate = (latest.use && latest.use[name] ? latest.use[name] : 0) / latest.players;
      var baseRate = basePlayers > 0 ? (baseUse[name] || 0) / basePlayers : 0;
      rise = Math.round((curRate - baseRate) * 1000) / 10;
    }
    if (use > 0 || g > 0) {
      var f = '', nm = name, sp = name.lastIndexOf('|');
      if (sp > 0) { f = name.slice(sp + 1); nm = name.slice(0, sp); }
      var o = { name: nm, use: use, win: winr, games: Math.round(g), rise: rise };
      if (f === 'e' || f === 'h') o.f = f; // f無し=ノーマル
      out.push(o);
    }
  });
  return out;
}

// ★モードbucket分類（CRDB_API_TAG_INVENTORY_NODE_BUILDER §混ぜずにbucket化）。
//   混ぜると壊れる（PoLとfriendly、通常とDraft/Triple等）ので、type/gameMode を用途別bucketへ。
//   特殊モードを type 判定より先に見る（例 tournament/TripleElixir は special_triple）。
function modeBucketOf(type, gm) {
  type = type || ''; var g = String(gm || '').toLowerCase();
  if (type === 'pathOfLegend') return 'ranked_pol';
  if (type === 'boatBattle' || /touchdown|heist|boatbattle|showdown/.test(g)) return 'excluded_special';
  if (/event_|restless/.test(g)) return 'excluded_event';
  if (/challenge/.test(g)) return 'challenge_event'; // ★レベル中立（標準レベル）勝率の素材になりうる
  if (/draft|pickmode|^pick|classicdecks|mirrordeck/.test(g)) return 'draft_pick';
  if (/rampup/.test(g)) return 'special_rampup';
  if (/tripleelixir|7xelixir/.test(g)) return 'special_triple';
  if (/doubleelixir/.test(g)) return 'special_double';
  if (/overtime/.test(g)) return 'special_overtime';
  if (type === 'riverRacePvP') return /cw_battle_1v1/.test(g) ? 'clanwar_1v1' : 'clanwar_other';
  if (type === 'tournament') return 'tournament_standard';
  if (type === 'PvP' && /ladder/.test(g)) return 'ladder_pvp';
  if (type === 'trail' && /ladder/.test(g)) return 'ladder_trail';
  if (type === 'friendly' || type === 'clanMate') return 'friendly_training';
  return 'other';
}

async function updateDecks() {
  var token = CR_TOKEN;
  if (!token) throw new Error('CR_TOKEN 未設定');
  if (!GH_TOKEN || !REPO) throw new Error('GITHUB_TOKEN / GITHUB_REPOSITORY 未設定');
  var topN = parseInt(prop('TOP_PLAYERS', '1000'), 10);
  var intervalHours = parseInt(prop('INTERVAL_HOURS', '6'), 10);

  console.log('▶ collect start repo=' + REPO + ' branch=' + BRANCH + ' top=' + topN);

  var ranking = await crGet('/locations/global/pathoflegend/players?limit=' + topN, token);
  var players = (ranking.items || []).slice(0, topN);
  var headers = { Authorization: 'Bearer ' + token, Accept: 'application/json', 'User-Agent': UA };

  // ---- 履歴を先に読む（対戦の二重カウント防止用 lastT を使うため） ----
  var ghPath = GH_PATH;
  var histPath = ghSiblingPath_(ghPath, 'cardhist.json');
  var hist = await ghReadJson_(histPath);
  if (!hist) {
    // ★上書き事故ガード：ファイルが「存在するのに読めない」場合は履歴を消さないよう実行を中断。
    if (await ghExists_(histPath)) throw new Error('cardhist.json が存在するのに読めない＝上書き防止のため中断（要調査）');
    hist = { snaps: [], dinfo: {} };
  }
  if (!hist.dinfo) hist.dinfo = {};
  var lastT = hist.lastT || {};   // tag → 前回処理した最新の battleTime
  var newLastT = {};

  // ---- バトルログから集計 ----
  var pop = {}, win = {}, unmapped = {}, CHUNK = 40;
  var muNow = {};       // ' 自分arch|相手arch' → [試合数, 勝ち数]（今回ぶん）
  var typeSeen = {};    // 観測した type/gameMode の分布（→ api-tags-seen.json）
  var runPlayerSig = {}; // ★今回ぶん：プレイヤータグ → そのプレイヤーの現在デッキ署名（ユニーク人数集計用）
  // ★battle-schema-sample用：先頭~80試合の実フィールド構造を観測（取れる値を確定し憶測実装を防ぐ）
  var schemaSample = { sampleSize: 0, topLevelKeys: {}, teamKeys: {}, cardKeys: {}, present: {} };
  function observeSchema_(b) {
    if (schemaSample.sampleSize >= 80) return;
    schemaSample.sampleSize++;
    Object.keys(b).forEach(function (k) { schemaSample.topLevelKeys[k] = (schemaSample.topLevelKeys[k] || 0) + 1; });
    var t0 = (b.team && b.team[0]) || {}, c0 = (t0.cards && t0.cards[0]) || {};
    Object.keys(t0).forEach(function (k) { schemaSample.teamKeys[k] = (schemaSample.teamKeys[k] || 0) + 1; });
    Object.keys(c0).forEach(function (k) { schemaSample.cardKeys[k] = (schemaSample.cardKeys[k] || 0) + 1; });
    ['elixirLeaked', 'kingTowerHitPoints', 'princessTowersHitPoints', 'trophyChange', 'startingTrophies', 'supportCards', 'globalRank'].forEach(function (f) { if (t0[f] != null) schemaSample.present[f] = (schemaSample.present[f] || 0) + 1; });
    if (b.leagueNumber != null) schemaSample.present.leagueNumber = (schemaSample.present.leagueNumber || 0) + 1;
    if (b.battleTime != null) schemaSample.present.battleTime = (schemaSample.present.battleTime || 0) + 1;
  }

  // 署名キー（tally と同一規則）。ユニーク人数のローリング表のキーに使う。
  function sigKey(d) {
    var special = [];
    d.jp.forEach(function (n, idx) { if (d.fm[idx] !== 'norm') special.push(n); });
    return d.jp.slice().sort().join('|') + '#' + special.slice().sort().join('|');
  }

  function isRanked_(b) {
    var t = b.type || '', gm = (b.gameMode && b.gameMode.name) || '';
    return t === 'pathOfLegend' || /ranked|path.?of.?legend/i.test(t) || /ranked|path.?of.?legend/i.test(gm);
  }
  function classifyDeck(cards) {
    var jp = [], fm = [], ok = true;
    cards.forEach(function (c) {
      var name = apiCardToJp(c);
      if (!name) { ok = false; unmapped[c.name] = (unmapped[c.name] || 0) + 1; return; }
      jp.push(name);
      var f = 'norm';
      if (c.rarity === 'champion') f = 'champ';
      else if (c.evolutionLevel && c.evolutionLevel > 0) {
        var iu = c.iconUrls || {};
        var hasEvo = !!iu.evolutionMedium, hasHero = !!iu.heroMedium;
        if (hasEvo && hasHero) f = (c.evolutionLevel >= 2) ? 'hero' : 'evo';
        else f = hasHero ? 'hero' : 'evo';
      }
      fm.push(f);
    });
    return (ok && jp.length === 8) ? { jp: jp, fm: fm } : null;
  }
  function tally(map, d, won, tc, oc) {
    if (!d) return false;
    var special = [];
    d.jp.forEach(function (n, idx) { if (d.fm[idx] !== 'norm') special.push(n); });
    var key = d.jp.slice().sort().join('|') + '#' + special.slice().sort().join('|');
    var e = map[key] || (map[key] = { count: 0, wins: 0, cards: d.jp, votes: {}, vwins: {}, c3: 0, cf: 0, ca: 0 });
    e.count++;
    if (won === true) e.wins++;
    if (typeof tc === 'number' && typeof oc === 'number') {
      e.cf += tc; e.ca += oc;
      if (won === true && tc === 3) e.c3++;
    }
    d.jp.forEach(function (n, idx) {
      var v = e.votes[n] || (e.votes[n] = { evo: 0, hero: 0, both: 0, champ: 0, norm: 0 });
      v[d.fm[idx]]++;
      if (won === true) {
        if (!e.vwins) e.vwins = {};
        var vw = e.vwins[n] || (e.vwins[n] = { evo: 0, hero: 0, both: 0, champ: 0, norm: 0 });
        vw[d.fm[idx]]++;
      }
    });
    return true;
  }
  function isStd(b) {
    return b && b.team && b.team.length === 1 && b.opponent && b.opponent.length === 1
      && b.team[0] && b.team[0].cards && b.team[0].cards.length === 8;
  }
  function evoCnt(cards) { var k = 0; for (var j = 0; j < cards.length; j++) if (cards[j].evolutionLevel > 0) k++; return k; }
  function sameSig_(a, b) { return a.slice().sort().join('|') === b.slice().sort().join('|'); }

  function processLog(battles, tag) {
    if (!battles || !battles.length) return;
    var gotPop = false;
    var seenT = lastT[tag] || '';
    var maxT = newLastT[tag] || seenT;
    for (var i = 0; i < battles.length; i++) {
      var b = battles[i];
      if (!isStd(b)) continue;
      observeSchema_(b);
      var tk = (b.type || '?') + '/' + ((b.gameMode && b.gameMode.name) || '?');
      typeSeen[tk] = (typeSeen[tk] || 0) + 1;
      if (!isRanked_(b)) continue;                 // ★ランク戦のみ
      var cards = b.team[0].cards;
      if (evoCnt(cards) > 4) continue;
      var d = classifyDeck(cards);
      if (!d) continue;
      if (!gotPop) { if (tally(pop, d, null)) { gotPop = true; if (tag) runPlayerSig[tag] = sigKey(d); } }
      var bt = b.battleTime || '';
      if (bt && bt > maxT) maxT = bt;
      if (seenT && bt && bt <= seenT) continue;    // ★前回処理済み＝二重カウントしない
      var tc = b.team[0].crowns, oc = b.opponent[0].crowns;
      if (typeof tc !== 'number' || typeof oc !== 'number' || tc === oc) continue;
      var oppCards = b.opponent[0].cards || [];
      var od = (oppCards.length === 8) ? classifyDeck(oppCards) : null;
      if (od && sameSig_(d.jp, od.jp)) continue;   // ★完全ミラー除外
      tally(win, d, tc > oc, tc, oc);
      if (od) {                                     // ★相性（勝ち筋は複数あれば全組み合わせにカウント）
        var aa = archsForm_(d.jp, d.fm), bb = archsForm_(od.jp, od.fm);
        var oppTag = (b.opponent[0].tag ? String(b.opponent[0].tag).toUpperCase().replace(/[^0-9A-Z]/g, '') : '');
        var oppTracked = !!(oppTag && TAGSET[oppTag]);
        for (var ai = 0; ai < aa.length; ai++) for (var bi = 0; bi < bb.length; bi++) {
          var k = aa[ai] + '|' + bb[bi];
          var mm = muNow[k] || (muNow[k] = [0, 0]);
          mm[0]++; if (tc > oc) mm[1]++;
          if (!oppTracked) {
            var k2 = bb[bi] + '|' + aa[ai];
            var mm2 = muNow[k2] || (muNow[k2] = [0, 0]);
            mm2[0]++; if (oc > tc) mm2[1]++;
          }
        }
      }
    }
    if (maxT) newLastT[tag] = maxT;
  }

  var allTags = players.map(function (p) { return p.tag; });
  var TAGSET = {}; allTags.forEach(function (t) { TAGSET[String(t).toUpperCase().replace(/[^0-9A-Z]/g, '')] = 1; });
  allTags.forEach(function (t) { if (lastT[t]) newLastT[t] = newLastT[t] || lastT[t]; });

  async function fetchTags(tags) {
    var got = [];
    for (var off = 0; off < tags.length; off += CHUNK) {
      var slice = tags.slice(off, off + CHUNK);
      var resps = await Promise.all(slice.map(function (t) {
        return fetch(PROXY + '/players/' + encodeURIComponent(t) + '/battlelog', { headers: headers })
          .then(async function (r) { return { ok: r.status === 200, body: r.status === 200 ? await r.json() : null }; })
          .catch(function () { return { ok: false, body: null }; });
      }));
      resps.forEach(function (res, i) {
        if (res.ok) { got.push(slice[i]); try { processLog(res.body, slice[i]); } catch (e) {} }
      });
      await sleep(300);
    }
    return got;
  }

  var got1 = await fetchTags(allTags);
  var miss = allTags.filter(function (t) { return got1.indexOf(t) < 0; });
  if (miss.length) { await sleep(1200); await fetchTags(miss); }
  console.log('typeSeen ' + JSON.stringify(typeSeen));

  var aggregated = Object.keys(pop).reduce(function (s, k) { return s + pop[k].count; }, 0);
  var winBattles = Object.keys(win).reduce(function (s, k) { return s + win[k].count; }, 0);
  console.log('ranking ' + players.length + ' / players(pop) ' + aggregated + ' / win-battles ' + winBattles + ' / unmapped ' + JSON.stringify(unmapped));
  if (!Object.keys(pop).length) throw new Error('集計0件 unmapped=' + JSON.stringify(unmapped)); // API失敗時は履歴を汚さない

  // ---- デッキ確定（形＋ゲームと同じスロット配置）。pop/win共通 ----
  function finalizeDeck(r) {
    var champName = null, champBest = 0;
    r.cards.forEach(function (n) { var c = (r.votes[n] || {}).champ || 0; if (c > champBest) { champBest = c; champName = n; } });
    var thr = Math.max(1, r.count * 0.25);
    var cardForm = {};
    r.cards.forEach(function (n) { cardForm[n] = 'norm'; });
    if (champName) cardForm[champName] = 'champ';
    var evoC = [];
    r.cards.forEach(function (n) {
      if (n === champName) return;
      var v = r.votes[n] || {};
      var ev = (v.evo || 0) + (v.both || 0), he = (v.hero || 0);
      if (ev >= he) { if (ev >= thr) evoC.push({ n: n, s: ev }); }
      else if (he >= thr) { cardForm[n] = 'hero'; }
    });
    evoC.sort(function (a, b) { return b.s - a.s; });
    evoC.slice(0, 2).forEach(function (x) { cardForm[x.n] = 'evo'; });
    var groups = { evo: [], hero: [], champ: [], norm: [] };
    r.cards.forEach(function (n) { groups[cardForm[n] || 'norm'].push(n); });
    groups.norm.sort(function (a, b) { return (COST[a] || 0) - (COST[b] || 0); });
    var slots8 = [null, null, null, null, null, null, null, null];
    var evos = groups.evo.slice(), mids = groups.champ.concat(groups.hero);
    if (evos.length) slots8[0] = evos.shift();
    if (evos.length) slots8[2] = evos.shift();
    [1, 2].forEach(function (idx) { if (slots8[idx] === null && mids.length) slots8[idx] = mids.shift(); });
    var rest = groups.norm.concat(evos, mids);
    rest.sort(function (a, b) { return (COST[a] || 0) - (COST[b] || 0); });
    for (var k = 0; k < 8; k++) if (slots8[k] === null) slots8[k] = rest.shift();
    return { name: deckNameGuess(slots8), slots: slots8, forms: slots8.map(function (n) { return cardForm[n] || 'norm'; }) };
  }

  // ===== 3日ローリング =====
  var now = Date.now();
  var DECK_TOP = 100;
  var DK_KEEP = 250;
  var WIN_MIN_3D = parseInt(prop('WIN_MIN_GAMES_3D', '30'), 10);

  // カード単体の素（形態別 n / n|e / n|h）
  var useNow = {};
  Object.keys(pop).forEach(function (k) {
    var r = pop[k];
    r.cards.forEach(function (n) {
      var v = r.votes[n] || { norm: r.count };
      var both = v.both || 0;
      var nn = (v.norm || 0) + (v.champ || 0), ev = (v.evo || 0) + both, he = (v.hero || 0);
      if (nn) useNow[n] = (useNow[n] || 0) + nn;
      if (ev) useNow[n + '|e'] = (useNow[n + '|e'] || 0) + ev;
      if (he) useNow[n + '|h'] = (useNow[n + '|h'] || 0) + he;
    });
  });
  var batNow = {};
  function addBat_(key, g, w) { if (!g && !w) return; if (!batNow[key]) batNow[key] = [0, 0]; batNow[key][0] += g; batNow[key][1] += w; }
  Object.keys(win).forEach(function (k) {
    var r = win[k];
    r.cards.forEach(function (n) {
      var v = r.votes[n] || { norm: r.count }, vw = (r.vwins && r.vwins[n]) || {};
      var vb = v.both || 0, wb = vw.both || 0;
      addBat_(n, (v.norm || 0) + (v.champ || 0), (vw.norm || 0) + (vw.champ || 0));
      addBat_(n + '|e', (v.evo || 0) + vb, (vw.evo || 0) + wb);
      addBat_(n + '|h', (v.hero || 0), (vw.hero || 0));
    });
  });

  // デッキの素：署名→[使用人数p, 試合数g, 勝ち数w, c3, cf, ca]。上位DK_KEEP件。
  var sigSet = {};
  Object.keys(pop).forEach(function (s) { sigSet[s] = 1; });
  Object.keys(win).forEach(function (s) { sigSet[s] = 1; });
  var dkArr = Object.keys(sigSet).map(function (sig) {
    var W = win[sig] || {};
    return { sig: sig, p: (pop[sig] ? pop[sig].count : 0), g: W.count || 0, w: W.wins || 0, c3: W.c3 || 0, cf: W.cf || 0, ca: W.ca || 0 };
  });
  dkArr.sort(function (a, b) { return (b.p + b.g) - (a.p + a.g); });
  var dkNow = {};
  dkArr.slice(0, DK_KEEP).forEach(function (x) { dkNow[x.sig] = [x.p, x.g, x.w, x.c3, x.cf, x.ca]; });

  // 履歴へ追加し、3日より古いスナップショットを捨てる
  hist.snaps.push({ t: now, players: aggregated, use: useNow, bat: batNow, dk: dkNow });
  hist.snaps = hist.snaps.filter(function (s) { return s.t >= now - WINDOW_DAYS * 864e5; });

  // （窓ごとの合算は buildWindow 内で行う＝1h/1日/3日を同じ snaps から導出）

  // 表示用の絵柄：今回の集計→過去確定(dinfo)
  function renderSig(sig) {
    if (pop[sig]) return finalizeDeck(pop[sig]);
    if (win[sig]) return finalizeDeck(win[sig]);
    if (hist.dinfo[sig]) return hist.dinfo[sig];
    return null;
  }
  function archOfSig_(sig) {
    var d = renderSig(sig);
    if (d && d.slots && d.forms) return archForm_(d.slots, d.forms);
    return archOf_(sig.split('#')[0].split('|'));
  }
  function archsOfSig_(sig) {
    var d = renderSig(sig);
    if (d && d.slots && d.forms) return archsForm_(d.slots, d.forms);
    var jp = sig.split('#')[0].split('|');
    var out = [];
    for (var i = 0; i < ARCH_WINCONS.length; i++) if (jp.indexOf(ARCH_WINCONS[i]) >= 0) out.push(ARCH_WINCONS[i]);
    return out.length ? out : ['その他'];
  }
  function crownOut_(a) {
    if (!a.G || (a.CF + a.CA) <= 0) return null;
    return { c3: a.W ? Math.round(a.C3 / a.W * 1000) / 10 : null, cd: Math.round((a.CF - a.CA) / a.G * 100) / 100 };
  }

  // dinfo更新＋窓外掃除
  Object.keys(dkNow).forEach(function (sig) { var d = renderSig(sig); if (d) hist.dinfo[sig] = { name: d.name, slots: d.slots, forms: d.forms }; });
  var live = {}; hist.snaps.forEach(function (s) { Object.keys(s.dk || {}).forEach(function (sig) { live[sig] = 1; }); });
  Object.keys(hist.dinfo).forEach(function (sig) { if (!live[sig]) delete hist.dinfo[sig]; });

  // ★ユニーク人数（窓内）：sig→{tag: 最終確認ms}。今回の現在デッキを記録し、窓外タグ/死んだsigを剪定。
  //   ユニーク人数＝そのsigのタグ数。最終確認msを持つので 1h/1日/3日 のユニーク数も同じ表から算出可（Phase 2b）。
  hist.uniq = hist.uniq || {};
  Object.keys(runPlayerSig).forEach(function (tag) {
    var sig = runPlayerSig[tag];
    (hist.uniq[sig] || (hist.uniq[sig] = {}))[tag] = now;
  });
  var WINDOW_MS = WINDOW_DAYS * 864e5;
  Object.keys(hist.uniq).forEach(function (sig) {
    var m = hist.uniq[sig];
    Object.keys(m).forEach(function (tag) { if (m[tag] < now - WINDOW_MS) delete m[tag]; });
    if (!live[sig] || !Object.keys(m).length) delete hist.uniq[sig];
  });
  // 窓内ユニーク人数（最終確認msで窓を切る）。1h/1日/3日 を同じ表から算出。
  function uniqCountW(sig, ms) {
    var m = hist.uniq[sig]; if (!m) return 0;
    var c = 0, thr = now - ms, ks = Object.keys(m);
    for (var i = 0; i < ks.length; i++) if (m[ks[i]] >= thr) c++;
    return c;
  }

  // ★窓ごとのデータセットを構築（decks/winDecks/cards/trending/meta/players/uniquePlayers）。
  //   表示は uniq(N人分)・games(M戦) が主。count(延べP) は収集頻度で膨らむ参考値として温存。
  function buildWindow(ms, winMin) {
    var snaps = hist.snaps.filter(function (s) { return s.t >= now - ms; });
    if (!snaps.length) snaps = hist.snaps.slice(-1); // 空回避（最新1枚）
    var agg = {}, playersW = 0;
    snaps.forEach(function (s) {
      playersW += (s.players || 0);
      var dk = s.dk || {};
      Object.keys(dk).forEach(function (sig) {
        var a = agg[sig] || (agg[sig] = { P: 0, G: 0, W: 0, C3: 0, CF: 0, CA: 0 });
        a.P += dk[sig][0] || 0; a.G += dk[sig][1] || 0; a.W += dk[sig][2] || 0;
        a.C3 += dk[sig][3] || 0; a.CF += dk[sig][4] || 0; a.CA += dk[sig][5] || 0;
      });
    });
    var popDecks = Object.keys(agg).sort(function (a, b) { return agg[b].P - agg[a].P; })
      .map(function (sig) {
        var d = renderSig(sig); if (!d) return null;
        var a = agg[sig], cr = crownOut_(a);
        var o = { name: d.name, slots: d.slots, forms: d.forms, count: a.P, uniq: uniqCountW(sig, ms), games: a.G, arch: archOfSig_(sig), archs: archsOfSig_(sig) };
        var ch = cycHvy_(d.slots); o.cyc = ch.cyc; o.hvy = ch.hvy;
        if (a.G > 0) o.winRate = Math.round(a.W / a.G * 1000) / 10;
        if (cr) { o.c3 = cr.c3; o.cd = cr.cd; }
        return o;
      }).filter(Boolean).slice(0, DECK_TOP);
    var winDecks = Object.keys(agg).filter(function (sig) { return agg[sig].G >= winMin; })
      .sort(function (a, b) { return wilson_(agg[b].W, agg[b].G) - wilson_(agg[a].W, agg[a].G) || (agg[b].G - agg[a].G); })
      .map(function (sig) {
        var d = renderSig(sig); if (!d) return null;
        var a = agg[sig], cr = crownOut_(a);
        var o = { name: d.name, slots: d.slots, forms: d.forms, games: a.G, wins: a.W,
          winRate: Math.round(a.W / a.G * 1000) / 10, lb: Math.round(wilson_(a.W, a.G) * 1000) / 10,
          count: a.P, uniq: uniqCountW(sig, ms), arch: archOfSig_(sig), archs: archsOfSig_(sig) };
        var ch = cycHvy_(d.slots); o.cyc = ch.cyc; o.hvy = ch.hvy;
        if (cr) { o.c3 = cr.c3; o.cd = cr.cd; }
        return o;
      }).filter(Boolean).slice(0, DECK_TOP);
    var cards = aggregateCards_(snaps);
    // 急上昇：窓内の最新snap vs それ以前
    var trending = [];
    var latest = snaps[snaps.length - 1] || { dk: {}, players: 0 };
    var prior = snaps.slice(0, -1);
    if (prior.length >= 1) {
      var baseCount = {}, basePlayers = 0;
      prior.forEach(function (s) { basePlayers += (s.players || 0); var dk = s.dk || {}; Object.keys(dk).forEach(function (sig) { baseCount[sig] = (baseCount[sig] || 0) + (dk[sig][0] || 0); }); });
      var curPlayers = latest.players || 1, ldk = latest.dk || {};
      Object.keys(ldk).forEach(function (sig) {
        var cur = ldk[sig][0] || 0; if (cur < 2) return;
        var rise = (cur / curPlayers) - (basePlayers > 0 ? (baseCount[sig] || 0) / basePlayers : 0);
        if (rise > 0) { var d = renderSig(sig); if (d) trending.push({ name: d.name, slots: d.slots, forms: d.forms, count: cur, delta: Math.round(rise * 1000) / 10 }); }
      });
      trending.sort(function (a, b) { return b.delta - a.delta || b.count - a.count; });
      trending = trending.slice(0, 15);
    }
    var metaAgg = {}, sigTotalP = 0;
    Object.keys(agg).forEach(function (sig) {
      sigTotalP += agg[sig].P;
      archsOfSig_(sig).forEach(function (k) { var m = metaAgg[k] || (metaAgg[k] = { P: 0, G: 0, W: 0 }); m.P += agg[sig].P; m.G += agg[sig].G; m.W += agg[sig].W; });
    });
    var totalP = sigTotalP || 1;
    var meta = Object.keys(metaAgg).map(function (k) { var m = metaAgg[k]; return { k: k, share: Math.round(m.P / totalP * 1000) / 10, win: m.G ? Math.round(m.W / m.G * 1000) / 10 : null, games: m.G }; })
      .sort(function (a, b) { return b.share - a.share; });
    var allTags = {};
    Object.keys(hist.uniq).forEach(function (sig) { var m = hist.uniq[sig]; Object.keys(m).forEach(function (t) { if (m[t] >= now - ms) allTags[t] = 1; }); });
    var gamesTotal = Object.keys(agg).reduce(function (s, sig) { return s + (agg[sig].G || 0); }, 0); // 窓内の総戦数（説明文用）
    return { players: playersW, uniquePlayers: Object.keys(allTags).length, games: gamesTotal, decks: popDecks, winDecks: winDecks, cards: cards, trending: trending, meta: meta };
  }

  var DAY = 864e5, HOUR = 36e5;
  var W3D = buildWindow(3 * DAY, WIN_MIN_3D);   // 既定（最低試合数100）
  var W1D = buildWindow(1 * DAY, 40);           // 1日（少サンプルなので閾値を下げる）
  var W1H = buildWindow(1 * HOUR, 10);          // 1時間（超新鮮・最も少サンプル）
  var players3d = W3D.players;
  console.log('windows 3d(decks ' + W3D.decks.length + '/win ' + W3D.winDecks.length + '/uniq ' + W3D.uniquePlayers + ') 1d(' + W1D.decks.length + '/' + W1D.winDecks.length + '/' + W1D.uniquePlayers + ') 1h(' + W1H.decks.length + '/' + W1H.winDecks.length + '/' + W1H.uniquePlayers + ')');

  // ★相性（matchups.json に月別累積）
  if (Object.keys(muNow).length) {
    var muPath = ghSiblingPath_(ghPath, 'matchups.json');
    var mu = (await ghReadJson_(muPath)) || { months: {} };
    if (!mu.months) mu.months = {};
    var mk = new Date().toISOString().slice(0, 7);
    var bucket = mu.months[mk] || (mu.months[mk] = {});
    Object.keys(muNow).forEach(function (k) {
      var t = bucket[k] || (bucket[k] = [0, 0]);
      t[0] += muNow[k][0]; t[1] += muNow[k][1];
    });
    mu.updated = new Date().toISOString();
    await ghWriteJson_(muPath, mu, 'chore: update matchups.json');
    console.log('matchups +' + Object.keys(muNow).length + ' pairs');
  }

  // ★月次署名ダイジェスト（sighist-YYYY-MM.json）
  try {
    var mkey2 = new Date().toISOString().slice(0, 7);
    var shPath = ghSiblingPath_(ghPath, 'sighist-' + mkey2 + '.json');
    var sh = (await ghReadJson_(shPath)) || { cards: [], sigs: {} };
    if (!sh.cards) sh.cards = [];
    if (!sh.sigs) sh.sigs = {};
    var cidx = {};
    sh.cards.forEach(function (n, i) { cidx[n] = i; });
    Object.keys(dkNow).forEach(function (sig) {
      var d = renderSig(sig); if (!d || !d.slots) return;
      var pairs = d.slots.map(function (n, i) {
        if (cidx[n] == null) { cidx[n] = sh.cards.length; sh.cards.push(n); }
        return { x: cidx[n], f: ((d.forms && d.forms[i]) || 'norm').charAt(0) };
      });
      pairs.sort(function (a, b) { return a.x - b.x; });
      var key = pairs.map(function (q) { return q.x; }).join('.') + '|' + pairs.map(function (q) { return q.f; }).join('');
      var v = dkNow[sig];
      var t = sh.sigs[key] || (sh.sigs[key] = [0, 0, 0]);
      t[0] += v[0] || 0; t[1] += v[1] || 0; t[2] += v[2] || 0;
    });
    sh.updated = new Date().toISOString();
    await ghWriteJson_(shPath, sh, 'chore: update sighist');
    console.log('sighist ' + Object.keys(sh.sigs).length + ' sigs');
  } catch (e) { console.log('sighist error ' + ((e && e.message) || e)); }

  // ★API棚卸し：観測した type/gameMode を bucket 分類して保存（混ぜず将来別集計の土台）
  try {
    var tags = Object.keys(typeSeen).map(function (k) {
      var i = k.indexOf('/'); var type = i >= 0 ? k.slice(0, i) : k; var gm = i >= 0 ? k.slice(i + 1) : '';
      var bucket = modeBucketOf(type, gm);
      return { type: type, gameMode: gm, count: typeSeen[k], bucket: bucket, useForMainMeta: bucket === 'ranked_pol' };
    }).sort(function (a, b) { return b.count - a.count; });
    await ghWriteJson_(ghSiblingPath_(ghPath, 'api-tags-seen.json'),
      { updated: new Date().toISOString(), window: 'latest-run', tags: tags }, 'chore: update api-tags-seen.json');
    console.log('api-tags-seen ' + tags.length + ' tags');
  } catch (e) { console.log('api-tags-seen error ' + ((e && e.message) || e)); }

  // ★battle-schema-sample：実フィールド構造（取れる値の確定）
  try {
    await ghWriteJson_(ghSiblingPath_(ghPath, 'battle-schema-sample.json'),
      { updated: new Date().toISOString(), sampleSize: schemaSample.sampleSize,
        topLevelKeys: Object.keys(schemaSample.topLevelKeys), teamKeys: Object.keys(schemaSample.teamKeys),
        cardKeys: Object.keys(schemaSample.cardKeys), presentCounts: schemaSample.present },
      'chore: update battle-schema-sample.json');
    console.log('battle-schema-sample size ' + schemaSample.sampleSize);
  } catch (e) { console.log('battle-schema-sample error ' + ((e && e.message) || e)); }

  hist.lastT = newLastT; // ★二重カウント防止のしおり

  await ghWriteJson_(ghPath, {
    updated: new Date().toISOString(),
    players: W3D.players,
    playersPerRun: aggregated,
    uniquePlayers: W3D.uniquePlayers,   // ★3日窓の総ユニーク人数（収集頻度に依存しない）
    games: W3D.games,                   // ★3日窓の総戦数
    topPlayers: players.length,
    intervalHours: intervalHours,
    windowDays: WINDOW_DAYS,
    cardsWindowDays: WINDOW_DAYS,
    defaultWindow: '3d',
    // 既定(3日)を従来どおりトップレベルにも置く＝後方互換（旧フロントもそのまま動く）
    decks: W3D.decks,
    winDecks: W3D.winDecks,
    trending: W3D.trending,
    cards: W3D.cards,
    meta: W3D.meta,
    winMin: WIN_MIN_3D,
    // ★窓別（1h / 1日 / 3日）＝フロントのセレクタで切替。既定は 3d。
    windows: {
      '1h': { players: W1H.players, uniquePlayers: W1H.uniquePlayers, games: W1H.games, decks: W1H.decks, winDecks: W1H.winDecks, trending: W1H.trending, cards: W1H.cards, meta: W1H.meta },
      '1d': { players: W1D.players, uniquePlayers: W1D.uniquePlayers, games: W1D.games, decks: W1D.decks, winDecks: W1D.winDecks, trending: W1D.trending, cards: W1D.cards, meta: W1D.meta },
      '3d': { players: W3D.players, uniquePlayers: W3D.uniquePlayers, games: W3D.games, decks: W3D.decks, winDecks: W3D.winDecks, trending: W3D.trending, cards: W3D.cards, meta: W3D.meta }
    }
  }, 'chore: update decks.json');
  await ghWriteJson_(histPath, hist, 'chore: update cardhist.json'); // 履歴

  console.log('✅ done. players3d=' + players3d + ' decks=' + W3D.decks.length + ' winDecks=' + W3D.winDecks.length);
}

updateDecks().catch(function (e) {
  console.error('❌ collect failed: ' + ((e && e.stack) || e));
  process.exit(1);
});
