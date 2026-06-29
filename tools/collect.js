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
 *   RANKING_SOURCE      … "pol"=PoLランキング / "trophy"=トロフィーランキング（既定 "pol"）
 *   TROPHY_MIN/MAX      … RANKING_SOURCE=trophy の時だけ、ランキング取得後に絞り込むトロフィー範囲
 *   TROPHY_EVENT_MIN/MAX… battlelog内で保存するトロフィー戦イベントの試合時点トロフィー範囲
 *   WINDOW_DAYS         … ローリング期間（日）。既定 "3"
 *   INTERVAL_HOURS      … 参考値としてdecks.jsonに載せる（既定 "6"）
 *   WIN_MIN_GAMES_3D    … 勝率ランキングの最低試合数（既定 "30"）
 *
 * ★Phase 1（今）＝この忠実移植で 3日ローリングを再現し、data-test に出して GAS出力(data)と照合。
 * ★Phase 2（後）＝収集を1時間ごとにし、スナップショット(t付き)から 1h/1day/3day の3窓を導出。
 *    （注：収集頻度を上げると延べ使用人数Pは素の合算なので増える＝デッキcountは窓正規化が要る。
 *      カードuseは aggregateCards_ で既に snaps数で正規化済み。Phase 2 で deck側も正規化する。）
 */

'use strict';

const { spawnSync } = require('child_process');

const PROXY = 'https://proxy.royaleapi.dev/v1';
const WINDOW_DAYS = parseInt(prop('WINDOW_DAYS', '3'), 10); // ローリング期間（日）。デッキ・カード共通。
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
function normTag_(tag) { return String(tag || '').toUpperCase().replace(/[^0-9A-Z]/g, ''); }
function eloBand_(elo) {
  if (typeof elo !== 'number' || !isFinite(elo)) return null;
  var size = parseInt(prop('ELO_BAND_SIZE', '200'), 10) || 200;
  var lo = Math.floor(elo / size) * size;
  return lo + '-' + (lo + size - 1);
}

async function crGet(path, token) {
  const res = await fetch(PROXY + path, { headers: { Authorization: 'Bearer ' + token, Accept: 'application/json', 'User-Agent': UA } });
  if (res.status !== 200) throw new Error('CR API ' + res.status + ' for ' + path + ' :: ' + (await res.text()).slice(0, 300));
  return res.json();
}

function summarizeRankingItems_(items) {
  var keys = {}, nums = {};
  (items || []).forEach(function (p) {
    Object.keys(p || {}).forEach(function (k) {
      keys[k] = 1;
      if (typeof p[k] === 'number') {
        var n = nums[k] || (nums[k] = { min: p[k], max: p[k], sample: [] });
        n.min = Math.min(n.min, p[k]); n.max = Math.max(n.max, p[k]);
        if (n.sample.length < 5) n.sample.push(p[k]);
      }
    });
  });
  return { count: (items || []).length, keys: Object.keys(keys).sort(), numeric: nums, sample: (items || []).slice(0, 3) };
}

async function probePolRanking_(token) {
  var out = { updated: new Date().toISOString(), pages: [] };
  var first = await crGet('/locations/global/pathoflegend/players?limit=1000', token);
  out.pages.push(Object.assign({ page: 1, cursorAfter: first.paging && first.paging.cursors && first.paging.cursors.after }, summarizeRankingItems_(first.items || [])));
  var after = first.paging && first.paging.cursors && first.paging.cursors.after;
  if (after) {
    try {
      var second = await crGet('/locations/global/pathoflegend/players?limit=1000&after=' + encodeURIComponent(after), token);
      out.pages.push(Object.assign({ page: 2, cursorAfter: second.paging && second.paging.cursors && second.paging.cursors.after }, summarizeRankingItems_(second.items || [])));
    } catch (e) {
      out.page2Error = (e && e.message) || String(e);
    }
  }
  return out;
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

// ★PoL試合内容インテリジェンス（CRDB_POL_BATTLE_CONTENT_INTELLIGENCE_DESIGN）。
//   タワー残HP差＝支配度、エリ漏れ差＝扱いやすさ、勝ち方の質を1試合から読む。欠損は重みから外す。
function numOr0_(v) { return typeof v === 'number' ? v : 0; }
function sumArr_(a) { if (!Array.isArray(a)) return 0; var s = 0; for (var i = 0; i < a.length; i++) s += numOr0_(a[i]); return s; }
function sumTowerHp_(p) { return numOr0_(p && p.kingTowerHitPoints) + sumArr_(p && p.princessTowersHitPoints); }
function clampN_(x) { return x < -1 ? -1 : x > 1 ? 1 : x; }
// 固定正規化（v1）。p95目安＝§11.1。データが貯まったら窓内p95へ差し替え可。
var POL_NORM = { hp: 9000, king: 5000, leak: 12 };
function battleDominance_(hpMargin, crownMargin, kingHpMargin, hasHp) {
  var crownNorm = crownMargin / 3;
  if (!hasHp) return crownNorm; // HP欠損時はクラウンのみ（重み再配分＝1.0）
  var hpNorm = clampN_(hpMargin / POL_NORM.hp), kingNorm = clampN_(kingHpMargin / POL_NORM.king);
  return 0.55 * hpNorm + 0.30 * crownNorm + 0.15 * kingNorm;
}
function outcomeBucket_(win, dom) {
  if (win) return dom >= 0.35 ? 'cleanWin' : dom > -0.10 ? 'stableWin' : 'fragileWin';
  return dom >= 0.10 ? 'pressureLoss' : dom > -0.35 ? 'closeLoss' : 'collapseLoss';
}
function addPolStats_(map, key, t0, o0, tc, oc) {
  var hasHp = (typeof t0.kingTowerHitPoints === 'number') && (typeof o0.kingTowerHitPoints === 'number');
  var hpMargin = sumTowerHp_(t0) - sumTowerHp_(o0);
  var kingHpMargin = numOr0_(t0.kingTowerHitPoints) - numOr0_(o0.kingTowerHitPoints);
  var crownMargin = tc - oc, win = tc > oc;
  var dom = battleDominance_(hpMargin, crownMargin, kingHpMargin, hasHp);
  var bk = outcomeBucket_(win, dom);
  var leakAdv = (typeof t0.elixirLeaked === 'number' && typeof o0.elixirLeaked === 'number') ? (o0.elixirLeaked - t0.elixirLeaked) : null;
  var trophy = (typeof t0.trophyChange === 'number') ? t0.trophyChange : null;
  var e = map[key] || (map[key] = [0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0]);
  e[0]++; e[1] += dom; e[2] += crownMargin;
  if (hasHp) { e[3] += hpMargin; e[4]++; }
  if (leakAdv != null) { e[5] += leakAdv; e[6]++; }
  if (trophy != null) { e[7] += trophy; e[8]++; }
  var bi = { cleanWin: 9, stableWin: 10, fragileWin: 11, pressureLoss: 12, closeLoss: 13, collapseLoss: 14 }[bk];
  e[bi]++;
}
function polSummary_(a) {
  var g = a && a[0] || 0; if (!g) return null;
  var wins = (a[9] || 0) + (a[10] || 0) + (a[11] || 0);
  var domAvg = a[1] / g, crownAvg = a[2] / g;
  var leakAdvAvg = a[6] ? a[5] / a[6] : null, troAvg = a[8] ? a[7] / a[8] : null;
  var cleanWinRate = (a[9] || 0) / g, stableWinRate = (a[10] || 0) / g, fragileWinRate = (a[11] || 0) / g;
  var pressureLossRate = (a[12] || 0) / g, closeLossRate = (a[13] || 0) / g, collapseLossRate = (a[14] || 0) / g;
  var stability = cleanWinRate - fragileWinRate - collapseLossRate;
  var pilotFit = leakAdvAvg != null ? clampN_(leakAdvAvg / POL_NORM.leak) : 0;
  var truePower = Math.round((0.46 * wilson_(wins, g) + 0.27 * ((clampN_(domAvg) + 1) / 2) + 0.13 * ((clampN_(crownAvg / 3) + 1) / 2) + 0.09 * ((clampN_(stability) + 1) / 2) + 0.05 * ((pilotFit + 1) / 2)) * 1000) / 10;
  return {
    games: g, wins: wins, wr: Math.round(wins / g * 1000) / 10, lb: Math.round(wilson_(wins, g) * 1000) / 10,
    dominanceAvg: Math.round(domAvg * 1000) / 1000, crownMarginAvg: Math.round(crownAvg * 100) / 100,
    cleanWinRate: Math.round(cleanWinRate * 1000) / 10, stableWinRate: Math.round(stableWinRate * 1000) / 10,
    fragileWinRate: Math.round(fragileWinRate * 1000) / 10, pressureLossRate: Math.round(pressureLossRate * 1000) / 10,
    closeLossRate: Math.round(closeLossRate * 1000) / 10, collapseLossRate: Math.round(collapseLossRate * 1000) / 10,
    leakAdvantageAvg: leakAdvAvg != null ? Math.round(leakAdvAvg * 100) / 100 : null,
    trophyChangeAvg: troAvg != null ? Math.round(troAvg * 100) / 100 : null,
    truePower: truePower
  };
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
  var rankingSource = String(prop('RANKING_SOURCE', 'pol')).toLowerCase();
  var trophyMin = parseInt(prop('TROPHY_MIN', '0'), 10);
  var trophyMax = parseInt(prop('TROPHY_MAX', '999999'), 10);
  var trophyEventMin = parseInt(prop('TROPHY_EVENT_MIN', '10000'), 10);
  var trophyEventMax = parseInt(prop('TROPHY_EVENT_MAX', '14000'), 10);
  var intervalHours = parseInt(prop('INTERVAL_HOURS', '6'), 10);

  console.log('▶ collect start repo=' + REPO + ' branch=' + BRANCH + ' source=' + rankingSource + ' top=' + topN + ' path=' + GH_PATH);

  var rankingPath = rankingSource === 'trophy' ? '/locations/global/rankings/players?limit=' + topN : '/locations/global/pathoflegend/players?limit=' + topN;
  var ranking = await crGet(rankingPath, token);
  if (rankingSource === 'pol') {
    try {
      var probe = { updated: new Date().toISOString(), source: 'global pathoflegend ranking', pages: [] };
      probe.pages.push(Object.assign({ page: 1, cursorAfter: ranking.paging && ranking.paging.cursors && ranking.paging.cursors.after }, summarizeRankingItems_(ranking.items || [])));
      var afterProbe = ranking.paging && ranking.paging.cursors && ranking.paging.cursors.after;
      if (afterProbe) {
        var page2 = await crGet('/locations/global/pathoflegend/players?limit=1000&after=' + encodeURIComponent(afterProbe), token);
        probe.pages.push(Object.assign({ page: 2, cursorAfter: page2.paging && page2.paging.cursors && page2.paging.cursors.after }, summarizeRankingItems_(page2.items || [])));
      }
      await ghWriteJson_(ghSiblingPath_(GH_PATH, 'pol-ranking-probe-v1.json'), probe, 'chore: update pol-ranking-probe-v1.json');
      console.log('pol-ranking-probe pages=' + probe.pages.length + ' keys=' + (probe.pages[0] && probe.pages[0].keys || []).join(','));
    } catch (e) { console.log('pol-ranking-probe error ' + ((e && e.message) || e)); }
  }
  var players = (ranking.items || []).slice(0, topN);
  var rankMetaByTag = {};
  players.forEach(function (p) {
    var t = normTag_(p.tag);
    if (!t) return;
    rankMetaByTag[t] = {
      rank: typeof p.rank === 'number' ? p.rank : null,
      eloRating: typeof p.eloRating === 'number' ? p.eloRating : null,
      expLevel: typeof p.expLevel === 'number' ? p.expLevel : null
    };
  });
  if (rankingSource === 'trophy') {
    players = players.filter(function (p) {
      var tr = typeof p.trophies === 'number' ? p.trophies : (typeof p.score === 'number' ? p.score : null);
      return tr != null && tr >= trophyMin && tr <= trophyMax;
    });
    console.log('trophy filter ' + trophyMin + '-' + trophyMax + ' => ' + players.length + ' players');
  }
  var headers = { Authorization: 'Bearer ' + token, Accept: 'application/json', 'User-Agent': UA };
  if (rankingSource === 'trophy' && !players.length) {
    var emptyWindow = { players: 0, uniquePlayers: 0, games: 0, decks: [], winDecks: [], trending: [], cards: [], meta: [] };
    await ghWriteJson_(GH_PATH, {
      updated: new Date().toISOString(),
      source: rankingSource,
      trophyRange: { min: trophyMin, max: trophyMax },
      players: 0,
      playersPerRun: 0,
      uniquePlayers: 0,
      games: 0,
      topPlayers: 0,
      intervalHours: intervalHours,
      windowDays: WINDOW_DAYS,
      cardsWindowDays: WINDOW_DAYS,
      defaultWindow: '7d',
      decks: [],
      winDecks: [],
      trending: [],
      cards: [],
      meta: [],
      winMin: parseInt(prop('WIN_MIN_GAMES_3D', '30'), 10),
      warning: 'No players returned in trophy range from ranking endpoint. Collector skipped without failing.',
      windows: { '7d': emptyWindow }
    }, 'chore: update empty trophy range decks.json');
    console.log('trophy range empty; wrote placeholder and skipped');
    return;
  }

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
  // ★PoL試合内容（今回ぶん）：sig → [g, domSum, crownSum, hpSum, hpN, leakSum, leakN, troSum, troN, cleanWin, stableWin, fragileWin, pressureLoss, closeLoss, collapseLoss]
  var polNow = {};
  // ★PoL対面別試合内容（今回ぶん）：'自分arch|相手arch' → pol配列。勝率だけでなく支配度/崩壊負け率まで貯める。
  var polMuNow = {};
  // ★相手カード別インテリジェンス（今回ぶん）：相手にそのカードが入っていた時、こちらがどう勝ち/負けたか。
  var polOppCardNow = {};
  // ★ランク戦トロフィ(eloRating)別インテリジェンス（今回ぶん）。eloRatingが取れるTop1000範囲を最大限使う。
  var polEloNow = {};
  // ★10000〜14000トロフィー戦イベント（今回ぶん）。PoLとは別に、試合時点startingTrophiesで保存する。
  var trophyEventsNow = [];
  // ★10000〜14000帯で当たった対戦相手のtag＝次回以降に少しずつ収集する母集団のseed候補。
  var oppSeedNow = {};
  function accPol_(sig, b, tc, oc) {
    var t0 = b.team[0], o0 = b.opponent[0];
    addPolStats_(polNow, sig, t0, o0, tc, oc);
  }
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
    ['battleTime', 'duration', 'durationSeconds', 'gameDuration', 'matchDuration', 'endTime'].forEach(function (f) { if (b[f] != null) schemaSample.present[f] = (schemaSample.present[f] || 0) + 1; });
    if (b.leagueNumber != null) schemaSample.present.leagueNumber = (schemaSample.present.leagueNumber || 0) + 1;
  }

  // 署名キー（tally と同一規則）。ユニーク人数のローリング表のキーに使う。
  function sigKey(d) {
    var special = [];
    d.jp.forEach(function (n, idx) { if (d.fm[idx] !== 'norm') special.push(n); });
    return d.jp.slice().sort().join('|') + '#' + special.slice().sort().join('|');
  }

  function isRanked_(b) {
    var t = b.type || '', gm = (b.gameMode && b.gameMode.name) || '';
    if (rankingSource === 'trophy') {
      var tr = b.team && b.team[0] && b.team[0].startingTrophies;
      var bucket = modeBucketOf(t, gm);
      return typeof tr === 'number' && tr >= trophyMin && tr <= trophyMax && (bucket === 'ladder_pvp' || bucket === 'ladder_trail');
    }
    return t === 'pathOfLegend' || /ranked|path.?of.?legend/i.test(t) || /ranked|path.?of.?legend/i.test(gm);
  }
  function parseBattleTimeMs_(s) {
    var m = String(s || '').match(/^(\d{4})(\d{2})(\d{2})T(\d{2})(\d{2})(\d{2})/);
    return m ? Date.UTC(+m[1], +m[2] - 1, +m[3], +m[4], +m[5], +m[6]) : 0;
  }
  function durationSec_(b) {
    var fs = ['durationSeconds', 'duration', 'gameDuration', 'matchDuration'];
    for (var i = 0; i < fs.length; i++) if (typeof b[fs[i]] === 'number') return b[fs[i]];
    if (b.endTime && b.battleTime) {
      var a = parseBattleTimeMs_(b.battleTime), z = parseBattleTimeMs_(b.endTime);
      if (a && z && z > a) return Math.round((z - a) / 1000);
    }
    return null;
  }
  function supportName_(p) {
    var sc = p && p.supportCards;
    if (!Array.isArray(sc) || !sc.length) return null;
    return apiCardToJp(sc[0]) || sc[0].name || null;
  }
  function sideLite_(p, d, crowns) {
    return {
      trophies: typeof p.startingTrophies === 'number' ? p.startingTrophies : null,
      deck: d.jp, forms: d.fm, crowns: crowns,
      kingTowerHitPoints: typeof p.kingTowerHitPoints === 'number' ? p.kingTowerHitPoints : null,
      princessTowersHitPoints: Array.isArray(p.princessTowersHitPoints) ? p.princessTowersHitPoints : null,
      elixirLeaked: typeof p.elixirLeaked === 'number' ? p.elixirLeaked : null,
      towerTroop: supportName_(p)
    };
  }
  function trophyBattleEvent_(b, d, od, tc, oc) {
    var t0 = b.team[0], o0 = b.opponent[0];
    var tt = typeof t0.startingTrophies === 'number' ? t0.startingTrophies : null;
    var ot = typeof o0.startingTrophies === 'number' ? o0.startingTrophies : null;
    if (tt == null || ot == null) return null;
    var mid = Math.round((tt + ot) / 2);
    if (mid < trophyEventMin || mid > trophyEventMax) return null;
    var bucket = modeBucketOf(b.type || '', (b.gameMode && b.gameMode.name) || '');
    if (bucket !== 'ladder_pvp' && bucket !== 'ladder_trail') return null;
    var dur = durationSec_(b);
    var id = [b.battleTime || '', tt, ot, d.jp.slice().sort().join('.'), od.jp.slice().sort().join('.')].join('|');
    return {
      id: id,
      battleTime: b.battleTime || '',
      mode: bucket,
      trophyMid: mid,
      trophyDiff: Math.abs(tt - ot),
      durationSeconds: dur,
      reachedTripleElixir: dur == null ? null : dur > 180,
      team: sideLite_(t0, d, tc),
      opponent: sideLite_(o0, od, oc),
      win: tc > oc
    };
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

  function processLog(battles, tag, seedMode) {
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
      var cards = b.team[0].cards;
      if (evoCnt(cards) > 4) continue;
      var d = classifyDeck(cards);
      if (!d) continue;
      var ranked = isRanked_(b);
      if (!seedMode && ranked && !gotPop) { if (tally(pop, d, null)) { gotPop = true; if (tag) runPlayerSig[tag] = sigKey(d); } }
      var bt = b.battleTime || '';
      if (bt && bt > maxT) maxT = bt;
      if (seenT && bt && bt <= seenT) continue;    // ★前回処理済み＝二重カウントしない
      var tc = b.team[0].crowns, oc = b.opponent[0].crowns;
      if (typeof tc !== 'number' || typeof oc !== 'number' || tc === oc) continue;
      var oppCards = b.opponent[0].cards || [];
      var od = (oppCards.length === 8) ? classifyDeck(oppCards) : null;
      if (od) {
        var tev = trophyBattleEvent_(b, d, od, tc, oc);
        if (tev) trophyEventsNow.push(tev);
        if (tev) {
          var ostag = b.opponent[0].tag ? String(b.opponent[0].tag).toUpperCase().replace(/[^0-9A-Z]/g, '') : '';
          if (ostag) oppSeedNow[ostag] = tev.opponent.trophies || tev.trophyMid;
        }
      }
      if (seedMode) continue;                      // ★seed由来はtrophy event抽出のみ。PoLメタ母集団は汚さない
      if (!ranked) continue;                       // ★PoL集計はランク戦のみ
      if (od && sameSig_(d.jp, od.jp)) continue;   // ★完全ミラー除外
      tally(win, d, tc > oc, tc, oc);
      accPol_(sigKey(d), b, tc, oc);               // ★PoL試合内容（支配度/エリ漏れ/勝ち方）を貯める
      var rmeta = rankMetaByTag[normTag_(tag)];
      var eband = rmeta ? eloBand_(rmeta.eloRating) : null;
      if (eband) {
        var eb = polEloNow[eband] || (polEloNow[eband] = { players: {}, rankMin: rmeta.rank, rankMax: rmeta.rank, eloMin: rmeta.eloRating, eloMax: rmeta.eloRating, all: [0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0], decks: {}, cards: {} });
        eb.players[normTag_(tag)] = 1;
        if (typeof rmeta.rank === 'number') { eb.rankMin = Math.min(eb.rankMin || rmeta.rank, rmeta.rank); eb.rankMax = Math.max(eb.rankMax || rmeta.rank, rmeta.rank); }
        if (typeof rmeta.eloRating === 'number') { eb.eloMin = Math.min(eb.eloMin || rmeta.eloRating, rmeta.eloRating); eb.eloMax = Math.max(eb.eloMax || rmeta.eloRating, rmeta.eloRating); }
        addPolStats_(eb.decks, sigKey(d), b.team[0], b.opponent[0], tc, oc);
        addPolStats_({ tmp: eb.all }, 'tmp', b.team[0], b.opponent[0], tc, oc);
        var seenOwnCard = {};
        d.jp.forEach(function (n) {
          if (seenOwnCard[n]) return;
          seenOwnCard[n] = 1;
          addPolStats_(eb.cards, n, b.team[0], b.opponent[0], tc, oc);
        });
      }
      if (od) {
        var seenOppCard = {};
        od.jp.forEach(function (n) {
          if (seenOppCard[n]) return;
          seenOppCard[n] = 1;
          addPolStats_(polOppCardNow, n, b.team[0], b.opponent[0], tc, oc);
        });
      }
      if (od) {                                     // ★相性（勝ち筋は複数あれば全組み合わせにカウント）
        var aa = archsForm_(d.jp, d.fm), bb = archsForm_(od.jp, od.fm);
        var oppTag = (b.opponent[0].tag ? String(b.opponent[0].tag).toUpperCase().replace(/[^0-9A-Z]/g, '') : '');
        var oppTracked = !!(oppTag && TAGSET[oppTag]);
        for (var ai = 0; ai < aa.length; ai++) for (var bi = 0; bi < bb.length; bi++) {
          var k = aa[ai] + '|' + bb[bi];
          var mm = muNow[k] || (muNow[k] = [0, 0]);
          mm[0]++; if (tc > oc) mm[1]++;
          addPolStats_(polMuNow, k, b.team[0], b.opponent[0], tc, oc);
          if (!oppTracked) {
            var k2 = bb[bi] + '|' + aa[ai];
            var mm2 = muNow[k2] || (muNow[k2] = [0, 0]);
            mm2[0]++; if (oc > tc) mm2[1]++;
            addPolStats_(polMuNow, k2, b.opponent[0], b.team[0], oc, tc);
          }
        }
      }
    }
    if (maxT) newLastT[tag] = maxT;
  }

  var allTags = players.map(function (p) { return p.tag; });
  var TAGSET = {}; allTags.forEach(function (t) { TAGSET[String(t).toUpperCase().replace(/[^0-9A-Z]/g, '')] = 1; });
  allTags.forEach(function (t) { if (lastT[t]) newLastT[t] = newLastT[t] || lastT[t]; });

  // ★Top1000以外の10000〜14000帯母集団：過去に当たった相手tagをseedとして履歴に保持し、
  //   毎回少しずつ（SEED_PER_RUN件）だけ追加収集する＝「一気にではなく」少しずつ広げる。
  if (!hist.oppSeeds) hist.oppSeeds = {}; // tag -> { tr, lastSeen, lastFetch }
  var SEED_PER_RUN = parseInt(prop('SEED_PER_RUN', '60'), 10);
  var seedAll = Object.keys(hist.oppSeeds).filter(function (t) { return !TAGSET[t]; });
  // 未取得（lastFetch無し=0）を優先し、その後は最も長く取得していない順。
  seedAll.sort(function (a, b) { return (hist.oppSeeds[a].lastFetch || 0) - (hist.oppSeeds[b].lastFetch || 0); });
  var seedTags = seedAll.slice(0, SEED_PER_RUN).map(function (t) { return '#' + t; });
  console.log('opp seeds total=' + seedAll.length + ' fetchingThisRun=' + seedTags.length);

  async function fetchTags(tags, seedMode) {
    var got = [];
    for (var off = 0; off < tags.length; off += CHUNK) {
      var slice = tags.slice(off, off + CHUNK);
      var resps = await Promise.all(slice.map(function (t) {
        return fetch(PROXY + '/players/' + encodeURIComponent(t) + '/battlelog', { headers: headers })
          .then(async function (r) { return { ok: r.status === 200, body: r.status === 200 ? await r.json() : null }; })
          .catch(function () { return { ok: false, body: null }; });
      }));
      resps.forEach(function (res, i) {
        if (res.ok) { got.push(slice[i]); try { processLog(res.body, slice[i], seedMode); } catch (e) {} }
      });
      await sleep(300);
    }
    return got;
  }

  var got1 = await fetchTags(allTags);
  var miss = allTags.filter(function (t) { return got1.indexOf(t) < 0; });
  if (miss.length) { await sleep(1200); await fetchTags(miss); }
  console.log('typeSeen ' + JSON.stringify(typeSeen));

  // ★seed（Top1000以外）を少しずつ追加収集。PoLメタは汚さず、trophy eventのみ拾う。
  if (seedTags.length) {
    try {
      var gotSeed = await fetchTags(seedTags, true);
      var nowMs = Date.now();
      // ★試行した全seedの lastFetch を進める＝不達tagでローテーションが止まらない。
      seedAll.slice(0, SEED_PER_RUN).forEach(function (t) {
        if (hist.oppSeeds[t]) hist.oppSeeds[t].lastFetch = nowMs;
      });
      // ★成功tagは別途 lastOk を記録（将来の品質フィルタ用）。
      gotSeed.forEach(function (raw) {
        var t = String(raw).toUpperCase().replace(/[^0-9A-Z]/g, '');
        if (hist.oppSeeds[t]) hist.oppSeeds[t].lastOk = nowMs;
      });
      console.log('seed fetched=' + gotSeed.length + '/' + seedTags.length);
    } catch (e) { console.log('seed fetch error ' + ((e && e.message) || e)); }
  }

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

  // PoL試合内容も上位デッキ（dkNow）分だけスナップショットへ（compact）
  var polSnap = {};
  Object.keys(dkNow).forEach(function (sig) { if (polNow[sig]) polSnap[sig] = polNow[sig]; });
  // 履歴へ追加し、3日より古いスナップショットを捨てる
  hist.snaps.push({ t: now, players: aggregated, use: useNow, bat: batNow, dk: dkNow, pol: polSnap, polMu: polMuNow, oppCard: polOppCardNow, polElo: polEloNow });
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
  var W7D = WINDOW_DAYS >= 7 ? buildWindow(7 * DAY, WIN_MIN_3D) : null;
  var WDEF = W7D || W3D;
  var W1D = buildWindow(1 * DAY, 40);           // 1日（少サンプルなので閾値を下げる）
  var W1H = buildWindow(1 * HOUR, 10);          // 1時間（超新鮮・最も少サンプル）
  var players3d = WDEF.players;
  console.log('windows default(decks ' + WDEF.decks.length + '/win ' + WDEF.winDecks.length + '/uniq ' + WDEF.uniquePlayers + ') 3d(' + W3D.decks.length + '/' + W3D.winDecks.length + '/' + W3D.uniquePlayers + ') 1d(' + W1D.decks.length + '/' + W1D.winDecks.length + '/' + W1D.uniquePlayers + ') 1h(' + W1H.decks.length + '/' + W1H.winDecks.length + '/' + W1H.uniquePlayers + ')');

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

    // ★2枚組シナジー（月別sighistを最大12か月ぶん利用）
    // P(A+B) / (P(A)*P(B)) で「使用率が高いだけ」を補正し、
    // top1デッキ集中度で「特定テンプレの一部」か「広い本質シナジー」かを分ける。
    try {
      function monthKeyOffset_(off) {
        var d = new Date();
        d.setUTCDate(1);
        d.setUTCMonth(d.getUTCMonth() + off);
        return d.toISOString().slice(0, 7);
      }
      var pairMonths = [];
      for (var mo = 0; mo > -12; mo--) pairMonths.push(monthKeyOffset_(mo));
      var shByMonth = {};
      shByMonth[mkey2] = sh; // 今月は更新済みをそのまま使う
      for (var mi = 0; mi < pairMonths.length; mi++) {
        var pmk = pairMonths[mi];
        if (shByMonth[pmk]) continue;
        var ps = await ghReadJson_(ghSiblingPath_(ghPath, 'sighist-' + pmk + '.json'));
        if (ps && ps.cards && ps.sigs) shByMonth[pmk] = ps;
      }
      var tagJson = await ghReadJson_(ghSiblingPath_(ghPath, 'card-tags.json')) || {};
      var winJson = await ghReadJson_(ghSiblingPath_(ghPath, 'wincon-policy.json')) || {};
      var tagCards = tagJson.cards || {};
      var winCards = winJson.cards || {};
      var SPELL_NAMES = { 'ザップ':1, '巨大雪玉':1, 'ローリングバーバリアン':1, 'ローリングウッド':1, 'レイジ':1, 'ゴブリンの呪い':1, '矢の雨':1, 'トルネード':1, 'アースクエイク':1, 'ロイヤルデリバリー':1, 'ゴブリンバレル':1, 'クローン':1, 'ヴァイン':1, 'ボイド':1, 'ミラー':1, 'ファイアボール':1, 'フリーズ':1, 'ポイズン':1, 'スケルトンラッシュ':1, 'ロケット':1, 'ライトニング':1 };
      var BUILDING_NAMES = { '大砲':1, '墓石':1, 'ゴブリンの檻':1, 'ゴブリンの小屋':1, 'ボムタワー':1, 'テスラ':1, '迫撃砲':1, 'オーブン':1, 'インフェルノタワー':1, 'エリクサーポンプ':1, 'バーバリアンの小屋':1, '巨大クロスボウ':1 };
      function clamp01_(x) { return x < 0 ? 0 : x > 1 ? 1 : x; }
      function round2_(x) { return Math.round(x * 100) / 100; }
      function round3_(x) { return Math.round(x * 1000) / 1000; }
      function tagsFor_(name) { var r = tagCards[name] || {}; return r.tags || []; }
      function hasTag_(name, tag) { return tagsFor_(name).indexOf(tag) >= 0; }
      function winClass_(name) { var r = winCards[name] || {}; return r.class || ''; }
      function roleFlags_(name) {
        var cls = winClass_(name), cost = COST[name] || 0;
        return {
          main: cls === '勝ち筋',
          secondary: cls === '第2勝ち筋' || cls === '補助勝ち筋',
          cycle: cls === 'サイクル札' || cost <= 2,
          spell: !!SPELL_NAMES[name],
          smallSpell: !!SPELL_NAMES[name] && cost <= 3,
          bigSpell: !!SPELL_NAMES[name] && cost >= 5,
          building: !!BUILDING_NAMES[name],
          air: hasTag_(name, 'air') || hasTag_(name, 'flying'),
          splash: hasTag_(name, 'splash'),
          tankKiller: hasTag_(name, 'tankKiller') || hasTag_(name, 'ramp'),
          tank: hasTag_(name, 'tgHp') || hasTag_(name, 'minitank') || cost >= 6,
          bait: hasTag_(name, 'spellBait'),
          bridge: hasTag_(name, 'bridgeSpam') || hasTag_(name, 'dash'),
          control: hasTag_(name, 'stun') || hasTag_(name, 'stop') || hasTag_(name, 'pull') || hasTag_(name, 'slow') || hasTag_(name, 'knockback')
        };
      }
      function roleComplement_(a, b) {
        var A = roleFlags_(a), B = roleFlags_(b), s = 0;
        function one(x, y, v) { if ((A[x] && B[y]) || (B[x] && A[y])) s += v; }
        one('main', 'smallSpell', 0.32);
        one('main', 'control', 0.22);
        one('main', 'splash', 0.18);
        one('main', 'tankKiller', 0.14);
        one('main', 'secondary', 0.16);
        one('tank', 'air', 0.18);
        one('tank', 'splash', 0.20);
        one('tank', 'tankKiller', 0.12);
        one('bait', 'bait', 0.22);
        one('building', 'tankKiller', 0.16);
        one('building', 'air', 0.12);
        one('bridge', 'smallSpell', 0.18);
        one('secondary', 'smallSpell', 0.10);
        if (A.spell && B.spell) s -= 0.18;
        if (A.building && B.building) s -= 0.22;
        if (A.bigSpell && B.bigSpell) s -= 0.20;
        if (A.main && B.main && (COST[a] || 0) >= 5 && (COST[b] || 0) >= 5) s -= 0.18;
        return Math.max(-0.35, Math.min(1, s));
      }
      function pairRoleExtension_(a, b, c) {
        var A = roleFlags_(a), B = roleFlags_(b), C = roleFlags_(c);
        var P = {};
        Object.keys(A).forEach(function (k) { P[k] = !!(A[k] || B[k]); });
        var s = (roleComplement_(a, c) + roleComplement_(b, c)) * 0.5;
        if (P.main && C.smallSpell) s += 0.26;
        if (P.main && C.control) s += 0.20;
        if (P.main && C.splash) s += 0.14;
        if (P.main && C.secondary) s += 0.12;
        if (P.tank && C.air) s += 0.20;
        if (P.tank && C.splash) s += 0.18;
        if (P.tank && C.tankKiller) s += 0.10;
        if (P.bait && (C.bait || C.smallSpell)) s += 0.18;
        if (P.bridge && C.smallSpell) s += 0.18;
        if (!P.air && C.air) s += 0.18;
        if (!P.splash && C.splash) s += 0.14;
        if (!P.tankKiller && C.tankKiller) s += 0.14;
        if (!P.building && C.building) s += 0.10;
        if (P.spell && C.spell) s -= 0.14;
        if (P.building && C.building) s -= 0.18;
        if (P.bigSpell && C.bigSpell) s -= 0.18;
        return Math.max(-0.35, Math.min(1, s));
      }
      function mean_(arr) { return arr.length ? arr.reduce(function (s, v) { return s + v; }, 0) / arr.length : 0; }
      function std_(arr) { if (arr.length < 2) return 0; var m = mean_(arr); return Math.sqrt(mean_(arr.map(function (v) { return Math.pow(v - m, 2); }))); }
      var totalUse = 0, cardUse = {}, cardGames = {}, cardWins = {}, pairUse = {}, pairGames = {}, pairWins = {}, pairDecks = {}, pairTop = {}, tripleUse = {}, tripleGames = {}, tripleWins = {}, tripleDecks = {}, tripleTop = {}, monthAgg = {};
      Object.keys(shByMonth).forEach(function (mk2) {
        var ss = shByMonth[mk2], cardsL = ss.cards || [], sigsL = ss.sigs || {};
        var ms = monthAgg[mk2] || (monthAgg[mk2] = { totalUse: 0, cardUse: {}, pairUse: {}, tripleUse: {} });
        Object.keys(sigsL).forEach(function (key) {
          var ids = String(key).split('|')[0].split('.').map(function (x) { return parseInt(x, 10); }).filter(function (x) { return !isNaN(x); });
          var names = [];
          ids.forEach(function (id) { var n = cardsL[id]; if (n && names.indexOf(n) < 0) names.push(n); });
          if (names.length < 2) return;
          var v = sigsL[key] || [], use = v[0] || v[1] || 0, games = v[1] || 0, wins = v[2] || 0;
          if (!use) return;
          totalUse += use;
          ms.totalUse += use;
          names.forEach(function (n) {
            cardUse[n] = (cardUse[n] || 0) + use;
            cardGames[n] = (cardGames[n] || 0) + games;
            cardWins[n] = (cardWins[n] || 0) + wins;
            ms.cardUse[n] = (ms.cardUse[n] || 0) + use;
          });
          for (var ai = 0; ai < names.length; ai++) for (var bi = ai + 1; bi < names.length; bi++) {
            var pk = names[ai] < names[bi] ? names[ai] + '|' + names[bi] : names[bi] + '|' + names[ai];
            pairUse[pk] = (pairUse[pk] || 0) + use;
            pairGames[pk] = (pairGames[pk] || 0) + games;
            pairWins[pk] = (pairWins[pk] || 0) + wins;
            pairDecks[pk] = (pairDecks[pk] || 0) + 1;
            pairTop[pk] = Math.max(pairTop[pk] || 0, use);
            ms.pairUse[pk] = (ms.pairUse[pk] || 0) + use;
            if (names.length >= 3) for (var ci = 0; ci < names.length; ci++) {
              if (ci === ai || ci === bi) continue;
              var tk = pk + '|' + names[ci];
              tripleUse[tk] = (tripleUse[tk] || 0) + use;
              tripleGames[tk] = (tripleGames[tk] || 0) + games;
              tripleWins[tk] = (tripleWins[tk] || 0) + wins;
              tripleDecks[tk] = (tripleDecks[tk] || 0) + 1;
              tripleTop[tk] = Math.max(tripleTop[tk] || 0, use);
              ms.tripleUse[tk] = (ms.tripleUse[tk] || 0) + use;
            }
          }
        });
      });
      var MIN_PAIR_USE = parseInt(prop('PAIR_MIN_USE', '5'), 10);
      var pairsOut = [];
      Object.keys(pairUse).forEach(function (pk) {
        var use = pairUse[pk]; if (use < MIN_PAIR_USE || !totalUse) return;
        var sp = pk.split('|'), a = sp[0], b = sp[1];
        var exp = (cardUse[a] || 0) * (cardUse[b] || 0) / totalUse;
        if (exp <= 0) return;
        var lift = use / exp, games = pairGames[pk] || 0, wins = pairWins[pk] || 0;
        var wr = games ? wins / games : null;
        var awr = cardGames[a] ? cardWins[a] / cardGames[a] : null;
        var bwr = cardGames[b] ? cardWins[b] / cardGames[b] : null;
        var baseWr = (awr != null && bwr != null) ? (awr + bwr) / 2 : null;
        var winLift = (wr != null && baseWr != null) ? wr - baseWr : null;
        var concentration = use ? (pairTop[pk] || 0) / use : 1;
        var broadness = 1 - Math.min(1, Math.max(0, concentration - 0.35) / 0.65);
        var monthlyLifts = [], monthlyUses = [];
        pairMonths.forEach(function (mk3) {
          var ms2 = monthAgg[mk3]; if (!ms2 || !ms2.totalUse || !ms2.pairUse[pk]) return;
          var ex2 = ((ms2.cardUse[a] || 0) * (ms2.cardUse[b] || 0)) / ms2.totalUse;
          if (ex2 <= 0) return;
          monthlyLifts.push(ms2.pairUse[pk] / ex2);
          monthlyUses.push(ms2.pairUse[pk]);
        });
        var logL = monthlyLifts.map(function (x) { return Math.log(Math.max(0.01, x)); });
        var activeMonths = monthlyLifts.length;
        var liftStability = activeMonths >= 3 ? clamp01_(1 - std_(logL) / 0.55) : clamp01_(activeMonths / 3 * 0.65);
        var currentLift = monthlyLifts.length ? monthlyLifts[0] : lift;
        var priorLift = monthlyLifts.length > 1 ? mean_(monthlyLifts.slice(1)) : lift;
        var trend = priorLift ? (currentLift - priorLift) / priorLift : 0;
        var cardUseRateA = (cardUse[a] || 0) / totalUse, cardUseRateB = (cardUse[b] || 0) / totalUse;
        var utilityIndex = Math.max(0, cardUseRateA - 0.25) + Math.max(0, cardUseRateB - 0.25);
        var utilityPenalty = utilityIndex * (lift < 1.25 ? 34 : 18);
        var templateLockPenalty = concentration > 0.70 ? (concentration - 0.70) * 42 : 0;
        var sampleConfidence = clamp01_(Math.sqrt(use / (use + 25)) * (games ? Math.sqrt(games / (games + 60)) : 0.72));
        var roleComp = roleComplement_(a, b);
        var liftScore = Math.log(Math.max(1, lift)) * 42;
        var winLiftScore = winLift == null ? 0 : winLift * 120;
        var broadnessScore = broadness * 16;
        var confidenceScore = sampleConfidence * 13;
        var roleScore = roleComp * 18;
        var stabilityScore = liftStability * 12;
        var trendScore = Math.max(-8, Math.min(8, trend * 10));
        var components = {
          lift: round2_(liftScore), winLift: round2_(winLiftScore), broadness: round2_(broadnessScore),
          confidence: round2_(confidenceScore), roleComplement: round2_(roleScore),
          stability: round2_(stabilityScore), trend: round2_(trendScore),
          utilityPenalty: round2_(utilityPenalty), templatePenalty: round2_(templateLockPenalty)
        };
        var synergyScore = round2_(liftScore + winLiftScore + broadnessScore + confidenceScore + roleScore + stabilityScore + trendScore - utilityPenalty - templateLockPenalty);
        var kind = sampleConfidence < 0.35 || use < MIN_PAIR_USE * 2 ? 'provisional'
          : lift >= 1.45 && (winLift == null || winLift >= 0) && concentration <= 0.55 && (pairDecks[pk] || 0) >= 5 && liftStability >= 0.45 && utilityPenalty < 8 ? 'broadSynergy'
          : lift >= 1.45 && concentration > 0.70 ? 'templateCore'
          : lift <= 1.15 && utilityIndex > 0 ? 'utilityOrCommon'
          : winLift != null && winLift >= 0.015 && lift >= 1.15 ? 'hiddenWinLift'
          : 'softSynergy';
        pairsOut.push({
          a: a, b: b, use: Math.round(use * 10) / 10, expected: Math.round(exp * 10) / 10,
          lift: Math.round(lift * 100) / 100, games: games, wr: wr == null ? null : Math.round(wr * 1000) / 10,
          winLift: winLift == null ? null : Math.round(winLift * 1000) / 10,
          deckVariants: pairDecks[pk] || 0, concentration: round3_(concentration),
          broadness: round3_(broadness), sampleConfidence: round3_(sampleConfidence),
          activeMonths: activeMonths, liftStability: round3_(liftStability), currentLift: round2_(currentLift), trend: round3_(trend),
          utilityIndex: round3_(utilityIndex), roleComplement: round3_(roleComp),
          kind: kind, score: synergyScore, components: components
        });
      });
      pairsOut.sort(function (x, y) { return y.score - x.score || y.use - x.use; });
      var pairScoreByKey = {};
      pairsOut.forEach(function (p) { pairScoreByKey[p.a + '|' + p.b] = p; });
      var byCard = {};
      pairsOut.slice(0, 3000).forEach(function (p) {
        [p.a, p.b].forEach(function (n) {
          var other = n === p.a ? p.b : p.a;
          var row = Object.assign({ other: other }, p);
          delete row.a; delete row.b;
          var list = byCard[n] || (byCard[n] = []);
          if (list.length < 40) list.push(row);
        });
      });
      await ghWriteJson_(ghSiblingPath_(ghPath, 'card-pair-synergy-v1.json'),
        { updated: new Date().toISOString(), source: 'sighist monthly digest', months: pairMonths.filter(function (m) { return !!shByMonth[m]; }),
          minUse: MIN_PAIR_USE, totalDeckUse: Math.round(totalUse * 10) / 10,
          scoring: {
            score: 'lift + winLift + broadness + sampleConfidence + roleComplement + liftStability + trend - utilityPenalty - templatePenalty',
            lift: 'P(A+B)/(P(A)*P(B))。単純共起ではなく期待共起との差を見る',
            winLift: 'pair勝率 - 単体2枚の平均勝率',
            concentration: 'pair総使用のうち最大1テンプレが占める比率。高いほどテンプレ依存',
            liftStability: '月別liftの安定度。短期だけ跳ねたpairを下げる',
            roleComplement: '勝ち方/呪文/対空/範囲/建物などの役割補完',
            utilityPenalty: '単体使用率が高すぎる便利カードの過大評価補正'
          },
          notes: ['表示の鮮度は1h/1d/3d、シナジー判定は月別sighist最大12か月で統計的に見る。', 'lift高・concentration低・月間安定・便利枠補正を抜けたpairほど本質シナジー。'],
          count: pairsOut.length, pairs: pairsOut.slice(0, 1000), byCard: byCard },
        'chore: update card-pair-synergy-v1.json');
      console.log('card-pair-synergy ' + pairsOut.length + ' pairs');

      var MIN_EXT_USE = parseInt(prop('PAIR_EXT_MIN_USE', '8'), 10);
      var extOut = [];
      Object.keys(tripleUse).forEach(function (tk) {
        var sp3 = tk.split('|'), a3 = sp3[0], b3 = sp3[1], c3 = sp3[2], pk3 = a3 + '|' + b3;
        var use3 = tripleUse[tk], pairBaseUse = pairUse[pk3] || 0, candUse = cardUse[c3] || 0;
        if (use3 < MIN_EXT_USE || pairBaseUse < Math.max(MIN_PAIR_USE, 10) || !candUse || !totalUse) return;
        var expected3 = pairBaseUse * candUse / totalUse;
        if (expected3 <= 0) return;
        var conditionalLift = use3 / expected3;
        var games3 = tripleGames[tk] || 0, wins3 = tripleWins[tk] || 0;
        var wr3 = games3 ? wins3 / games3 : null;
        var pairWr = pairGames[pk3] ? pairWins[pk3] / pairGames[pk3] : null;
        var pairExtWinLift = (wr3 != null && pairWr != null) ? wr3 - pairWr : null;
        var concentration3 = use3 ? (tripleTop[tk] || 0) / use3 : 1;
        var diversity3 = 1 - Math.min(1, Math.max(0, concentration3 - 0.35) / 0.65);
        var monthlyExtLifts = [];
        pairMonths.forEach(function (mk4) {
          var ms3 = monthAgg[mk4];
          if (!ms3 || !ms3.totalUse || !ms3.tripleUse[tk] || !ms3.pairUse[pk3] || !ms3.cardUse[c3]) return;
          var ex3 = ms3.pairUse[pk3] * ms3.cardUse[c3] / ms3.totalUse;
          if (ex3 <= 0) return;
          monthlyExtLifts.push(ms3.tripleUse[tk] / ex3);
        });
        var logE = monthlyExtLifts.map(function (x) { return Math.log(Math.max(0.01, x)); });
        var activeExtMonths = monthlyExtLifts.length;
        var extStability = activeExtMonths >= 3 ? clamp01_(1 - std_(logE) / 0.60) : clamp01_(activeExtMonths / 3 * 0.65);
        var currentExtLift = monthlyExtLifts.length ? monthlyExtLifts[0] : conditionalLift;
        var priorExtLift = monthlyExtLifts.length > 1 ? mean_(monthlyExtLifts.slice(1)) : conditionalLift;
        var extTrend = priorExtLift ? (currentExtLift - priorExtLift) / priorExtLift : 0;
        var sampleConfidence3 = clamp01_(Math.sqrt(use3 / (use3 + 22)) * (games3 ? Math.sqrt(games3 / (games3 + 55)) : 0.70));
        var roleExt = pairRoleExtension_(a3, b3, c3);
        var basePair = pairScoreByKey[pk3] || null;
        var pairQualityScore = Math.min(16, Math.max(0, basePair ? (basePair.score || 0) : 0) * 0.20);
        var candUseRate = candUse / totalUse;
        var commonPenalty = Math.max(0, candUseRate - 0.28) * (conditionalLift < 1.20 ? 30 : 14);
        var templatePenalty3 = concentration3 > 0.72 ? (concentration3 - 0.72) * 38 : 0;
        if (basePair && basePair.kind === 'utilityOrCommon') commonPenalty += 8;
        var conditionalScore = Math.min(58, Math.log(Math.max(1, conditionalLift)) * 32);
        var winExtScore = pairExtWinLift == null ? 0 : pairExtWinLift * 150;
        var diversityScore = diversity3 * 12;
        var confidenceScore3 = sampleConfidence3 * 12;
        var roleExtScore = roleExt * 20;
        var stabilityScore3 = extStability * 10;
        var trendScore3 = Math.max(-7, Math.min(7, extTrend * 9));
        var extScore = round2_(conditionalScore + winExtScore + diversityScore + confidenceScore3 + roleExtScore + stabilityScore3 + trendScore3 + pairQualityScore - commonPenalty - templatePenalty3);
        if (extScore < 10) return;
        var extKind = sampleConfidence3 < 0.34 || use3 < MIN_EXT_USE * 2 ? 'provisional'
          : conditionalLift >= 1.35 && (pairExtWinLift == null || pairExtWinLift >= -0.006) && concentration3 <= 0.66 && roleExt >= 0.16 ? 'pairEnabler'
          : pairExtWinLift != null && pairExtWinLift >= 0.015 && conditionalLift >= 1.10 ? 'resultLift'
          : roleExt >= 0.24 && conditionalLift >= 1.05 ? 'coveragePatch'
          : conditionalLift >= 1.35 && concentration3 > 0.72 ? 'templateExtension'
          : 'softExtension';
        extOut.push({
          a: a3, b: b3, c: c3, use: Math.round(use3 * 10) / 10, pairUse: Math.round(pairBaseUse * 10) / 10,
          expected: Math.round(expected3 * 10) / 10, conditionalLift: round2_(conditionalLift), games: games3,
          wr: wr3 == null ? null : Math.round(wr3 * 1000) / 10,
          pairWr: pairWr == null ? null : Math.round(pairWr * 1000) / 10,
          pairExtWinLift: pairExtWinLift == null ? null : Math.round(pairExtWinLift * 1000) / 10,
          deckVariants: tripleDecks[tk] || 0, concentration: round3_(concentration3), diversity: round3_(diversity3),
          sampleConfidence: round3_(sampleConfidence3), activeMonths: activeExtMonths, liftStability: round3_(extStability),
          currentLift: round2_(currentExtLift), trend: round3_(extTrend), roleExtension: round3_(roleExt),
          basePairKind: basePair ? basePair.kind : '', basePairScore: basePair ? basePair.score : null,
          kind: extKind, score: extScore,
          components: {
            conditionalLift: round2_(conditionalScore), winLift: round2_(winExtScore), diversity: round2_(diversityScore),
            confidence: round2_(confidenceScore3), roleExtension: round2_(roleExtScore), stability: round2_(stabilityScore3),
            trend: round2_(trendScore3), pairQuality: round2_(pairQualityScore), commonPenalty: round2_(commonPenalty), templatePenalty: round2_(templatePenalty3)
          }
        });
      });
      extOut.sort(function (x, y) { return y.score - x.score || y.use - x.use; });
      var byPair = {};
      extOut.slice(0, 4000).forEach(function (e3) {
        var k3 = e3.a + '|' + e3.b;
        var list3 = byPair[k3] || (byPair[k3] = []);
        if (list3.length < 12) list3.push({
          card: e3.c, kind: e3.kind, score: e3.score, use: e3.use, games: e3.games,
          conditionalLift: e3.conditionalLift, pairExtWinLift: e3.pairExtWinLift,
          roleExtension: e3.roleExtension, basePairKind: e3.basePairKind
        });
      });
      function slimExt_(e3) {
        return {
          a: e3.a, b: e3.b, c: e3.c, kind: e3.kind, score: e3.score, use: e3.use, pairUse: e3.pairUse,
          conditionalLift: e3.conditionalLift, games: e3.games, pairExtWinLift: e3.pairExtWinLift,
          deckVariants: e3.deckVariants, concentration: e3.concentration, roleExtension: e3.roleExtension,
          basePairKind: e3.basePairKind, basePairScore: e3.basePairScore
        };
      }
      await ghWriteJson_(ghSiblingPath_(ghPath, 'card-pair-extension-synergy-v1.json'),
        { updated: new Date().toISOString(), source: 'sighist monthly digest', months: pairMonths.filter(function (m) { return !!shByMonth[m]; }),
          minUse: MIN_EXT_USE, totalDeckUse: Math.round(totalUse * 10) / 10,
          scoring: {
            score: 'conditionalLift + pairExtWinLift + diversity + sampleConfidence + roleExtension + liftStability + trend + basePairQuality - commonPenalty - templatePenalty',
            conditionalLift: 'P(C|A+B)/P(C)。2枚組A+Bに対してCがどれだけ足されやすいかを見る',
            pairExtWinLift: 'A+B+C勝率 - A+B勝率。3枚全体ではなく、2枚に足した時の上乗せを見る',
            diversity: '最大1テンプレ集中を避ける補正。高いほどいろいろな形に足されている',
            roleExtension: 'A+Bの勝ち方・受け方をCがどれだけ通しやすく/埋めやすくするか',
            commonPenalty: '単体使用率が高すぎる便利カードの過大評価補正'
          },
          notes: ['3枚組テンプレではなく、2枚組A+Bに対する3枚目Cの候補。', 'UIでは「この2枚を通しやすくする1枚」「この形の弱点を埋める1枚」として使う。'],
          count: extOut.length, extensions: extOut.slice(0, 500).map(slimExt_), byPair: byPair },
        'chore: update card-pair-extension-synergy-v1.json');
      console.log('card-pair-extension-synergy ' + extOut.length + ' extensions');
    } catch (e2) { console.log('card-pair-synergy error ' + ((e2 && e2.message) || e2)); }
  } catch (e) { console.log('sighist error ' + ((e && e.message) || e)); }

  // ★PoL試合内容インテリジェンス：3日窓でデッキ単位に集計（支配度/勝ち方の質/扱いやすさ/トロフィー効率）
  try {
    var polAgg = {};
    hist.snaps.forEach(function (s) {
      var pl = s.pol || {};
      Object.keys(pl).forEach(function (sig) {
        var a = polAgg[sig] || (polAgg[sig] = [0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0]);
        var v = pl[sig]; for (var i = 0; i < 15; i++) a[i] += (v[i] || 0);
      });
    });
    var polDecks = {};
    Object.keys(polAgg).forEach(function (sig) {
      var a = polAgg[sig], g = a[0]; if (g < 1) return;
      var d = renderSig(sig); if (!d) return;
      var wins = a[9] + a[10] + a[11]; // cleanWin+stableWin+fragileWin
      var lb = wilson_(wins, g), domAvg = a[1] / g, crownAvg = a[2] / g;
      var leakAdvAvg = a[6] ? a[5] / a[6] : null, troAvg = a[8] ? a[7] / a[8] : null;
      var cleanWinRate = a[9] / g, fragileWinRate = a[11] / g, pressureLossRate = a[12] / g, collapseLossRate = a[14] / g;
      var stability = cleanWinRate - fragileWinRate - collapseLossRate;
      var pilotFit = leakAdvAvg != null ? clampN_(leakAdvAvg / POL_NORM.leak) : 0;
      var truePower = Math.round((0.46 * lb + 0.27 * ((clampN_(domAvg) + 1) / 2) + 0.13 * ((clampN_(crownAvg / 3) + 1) / 2) + 0.09 * ((clampN_(stability) + 1) / 2) + 0.05 * ((pilotFit + 1) / 2)) * 1000) / 10;
      polDecks[sig] = {
        name: d.name, slots: d.slots, forms: d.forms, archs: archsOfSig_(sig),
        games: g, wins: wins, wr: Math.round(wins / g * 1000) / 10, lb: Math.round(lb * 1000) / 10,
        dominanceAvg: Math.round(domAvg * 1000) / 1000, crownMarginAvg: Math.round(crownAvg * 100) / 100,
        cleanWinRate: Math.round(cleanWinRate * 1000) / 10, fragileWinRate: Math.round(fragileWinRate * 1000) / 10,
        pressureLossRate: Math.round(pressureLossRate * 1000) / 10, collapseLossRate: Math.round(collapseLossRate * 1000) / 10,
        leakAdvantageAvg: leakAdvAvg != null ? Math.round(leakAdvAvg * 100) / 100 : null,
        trophyChangeAvg: troAvg != null ? Math.round(troAvg * 100) / 100 : null,
        truePower: truePower
      };
    });
    var durationFields = ['duration', 'durationSeconds', 'gameDuration', 'matchDuration', 'endTime'].filter(function (f) { return !!schemaSample.present[f]; });
    await ghWriteJson_(ghSiblingPath_(ghPath, 'pol-battle-intel-v1.json'),
      { updated: new Date().toISOString(), windowDays: WINDOW_DAYS, source: 'pathOfLegend battlelog',
        schema: { hasTowerHp: !!(schemaSample.present.kingTowerHitPoints && schemaSample.present.princessTowersHitPoints), hasElixirLeaked: !!schemaSample.present.elixirLeaked, hasTrophyChange: !!schemaSample.present.trophyChange, hasSupportCards: !!schemaSample.present.supportCards, hasGlobalRank: !!schemaSample.present.globalRank, hasBattleTime: !!schemaSample.present.battleTime, hasDuration: durationFields.length > 0, durationFields: durationFields },
        presentCounts: schemaSample.present,
        normalizers: POL_NORM, count: Object.keys(polDecks).length, decks: polDecks },
      'chore: update pol-battle-intel-v1.json');
    console.log('pol-battle-intel ' + Object.keys(polDecks).length + ' decks');
  } catch (e) { console.log('pol-battle-intel error ' + ((e && e.message) || e)); }

  // ★PoL対面別インテリジェンス：勝率だけでなく、相手勝ち筋ごとの支配度/崩壊負け率を出す。
  try {
    var polMuAgg = {};
    hist.snaps.forEach(function (s) {
      var pm = s.polMu || {};
      Object.keys(pm).forEach(function (k) {
        var a = polMuAgg[k] || (polMuAgg[k] = [0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0]);
        var v = pm[k]; for (var i = 0; i < 15; i++) a[i] += (v[i] || 0);
      });
    });
    var pairs = {}, bySelf = {};
    Object.keys(polMuAgg).forEach(function (k) {
      var s = polSummary_(polMuAgg[k]); if (!s) return;
      var p = k.split('|'), self = p[0] || 'その他', opponent = p[1] || 'その他';
      var row = Object.assign({ self: self, opponent: opponent }, s);
      pairs[k] = row;
      var list = bySelf[self] || (bySelf[self] = []);
      list.push(row);
    });
    Object.keys(bySelf).forEach(function (self) {
      bySelf[self].sort(function (a, b) { return a.dominanceAvg - b.dominanceAvg || b.games - a.games; });
      bySelf[self] = bySelf[self].slice(0, 80);
    });
    await ghWriteJson_(ghSiblingPath_(ghPath, 'pol-matchup-intel-v1.json'),
      { updated: new Date().toISOString(), windowDays: WINDOW_DAYS, source: 'pathOfLegend battlelog',
        normalizers: POL_NORM, count: Object.keys(pairs).length, pairs: pairs, bySelf: bySelf },
      'chore: update pol-matchup-intel-v1.json');
    console.log('pol-matchup-intel ' + Object.keys(pairs).length + ' pairs');
  } catch (e) { console.log('pol-matchup-intel error ' + ((e && e.message) || e)); }

  // ★PoLカード別インテリジェンス：相手にそのカードがいた時の勝率/支配度/崩壊負け率。
  // 生ログは保存せず、3日窓の集計だけ保存する＝カードページの統計的裏付けに使う。
  try {
    var cardAgg = {};
    hist.snaps.forEach(function (s) {
      var oc = s.oppCard || {};
      Object.keys(oc).forEach(function (name) {
        var a = cardAgg[name] || (cardAgg[name] = [0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0]);
        var v = oc[name]; for (var i = 0; i < 15; i++) a[i] += (v[i] || 0);
      });
    });
    var byOpponentCard = {};
    Object.keys(cardAgg).forEach(function (name) {
      var s = polSummary_(cardAgg[name]); if (!s) return;
      byOpponentCard[name] = Object.assign({ name: name }, s);
    });
    await ghWriteJson_(ghSiblingPath_(ghPath, 'pol-card-intel-v1.json'),
      { updated: new Date().toISOString(), windowDays: WINDOW_DAYS, source: 'pathOfLegend battlelog',
        perspective: 'tracked-player vs opponent card', normalizers: POL_NORM,
        count: Object.keys(byOpponentCard).length, byOpponentCard: byOpponentCard },
      'chore: update pol-card-intel-v1.json');
    console.log('pol-card-intel ' + Object.keys(byOpponentCard).length + ' cards');
  } catch (e) { console.log('pol-card-intel error ' + ((e && e.message) || e)); }

  // ★ランク戦トロフィ(eloRating)別インテリジェンス：eloRatingが存在するTop1000範囲を最大限使う。
  try {
    function addArr15_(dst, src) { for (var i = 0; i < 15; i++) dst[i] += (src && src[i]) || 0; }
    var eloAgg = {};
    hist.snaps.forEach(function (s) {
      var pe = s.polElo || {};
      Object.keys(pe).forEach(function (band) {
        var src = pe[band], dst = eloAgg[band] || (eloAgg[band] = { players: {}, rankMin: src.rankMin, rankMax: src.rankMax, eloMin: src.eloMin, eloMax: src.eloMax, all: [0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0], decks: {}, cards: {} });
        Object.keys(src.players || {}).forEach(function (t) { dst.players[t] = 1; });
        if (typeof src.rankMin === 'number') dst.rankMin = Math.min(dst.rankMin == null ? src.rankMin : dst.rankMin, src.rankMin);
        if (typeof src.rankMax === 'number') dst.rankMax = Math.max(dst.rankMax == null ? src.rankMax : dst.rankMax, src.rankMax);
        if (typeof src.eloMin === 'number') dst.eloMin = Math.min(dst.eloMin == null ? src.eloMin : dst.eloMin, src.eloMin);
        if (typeof src.eloMax === 'number') dst.eloMax = Math.max(dst.eloMax == null ? src.eloMax : dst.eloMax, src.eloMax);
        addArr15_(dst.all, src.all);
        Object.keys(src.decks || {}).forEach(function (sig) {
          var a = dst.decks[sig] || (dst.decks[sig] = [0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0]);
          addArr15_(a, src.decks[sig]);
        });
        Object.keys(src.cards || {}).forEach(function (name) {
          var c = dst.cards[name] || (dst.cards[name] = [0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0]);
          addArr15_(c, src.cards[name]);
        });
      });
    });
    var byBand = {};
    Object.keys(eloAgg).sort().forEach(function (band) {
      var a = eloAgg[band], cards = {}, decks = {};
      Object.keys(a.cards).forEach(function (name) { var s = polSummary_(a.cards[name]); if (s) cards[name] = Object.assign({ name: name }, s); });
      Object.keys(a.decks).forEach(function (sig) {
        var s = polSummary_(a.decks[sig]); if (!s) return;
        var d = renderSig(sig);
        decks[sig] = Object.assign({ sig: sig, name: d && d.name, slots: d && d.slots, forms: d && d.forms, archs: archsOfSig_(sig) }, s);
      });
      byBand[band] = Object.assign({
        band: band,
        players: Object.keys(a.players).length,
        rankRange: { min: a.rankMin, max: a.rankMax },
        eloRange: { min: a.eloMin, max: a.eloMax },
        cards: cards,
        decks: decks
      }, polSummary_(a.all) || {});
    });
    await ghWriteJson_(ghSiblingPath_(ghPath, 'pol-elo-intel-v1.json'),
      { updated: new Date().toISOString(), windowDays: WINDOW_DAYS,
        source: 'global pathoflegend ranking battlelog', ratingField: 'eloRating',
        bandSize: parseInt(prop('ELO_BAND_SIZE', '200'), 10) || 200,
        bands: byBand },
      'chore: update pol-elo-intel-v1.json');
    console.log('pol-elo-intel bands=' + Object.keys(byBand).length);
  } catch (e) { console.log('pol-elo-intel error ' + ((e && e.message) || e)); }

  // ★10000〜14000トロフィー戦イベントDB：試合時点startingTrophiesで抽出し、7日分の軽量eventを保持。
  try {
    var evPath = ghSiblingPath_(ghPath, 'trophy-battle-events-v1.json');
    var oldEv = (await ghReadJson_(evPath)) || { events: [] };
    var seenEv = {}, events = [];
    (oldEv.events || []).concat(trophyEventsNow).forEach(function (e) {
      if (!e || !e.id || seenEv[e.id]) return;
      seenEv[e.id] = 1; events.push(e);
    });
    var eventCut = now - 7 * 864e5;
    events = events.filter(function (e) { var t = parseBattleTimeMs_(e.battleTime); return t && t >= eventCut; })
      .sort(function (a, b) { return parseBattleTimeMs_(b.battleTime) - parseBattleTimeMs_(a.battleTime); })
      .slice(0, parseInt(prop('TROPHY_EVENT_KEEP', '20000'), 10));

    function playerFromEvent_(e, side) {
      var p = side === 'team' ? e.team : e.opponent;
      return {
        crowns: p.crowns,
        kingTowerHitPoints: p.kingTowerHitPoints,
        princessTowersHitPoints: p.princessTowersHitPoints,
        elixirLeaked: p.elixirLeaked
      };
    }
    function addEventSideStats_(map, key, e, side) {
      var mine = playerFromEvent_(e, side), opp = playerFromEvent_(e, side === 'team' ? 'opponent' : 'team');
      addPolStats_(map, key, mine, opp, mine.crowns, opp.crowns);
    }
    var cardAgg = {}, bandAgg = {}, triple = { known: 0, reached: 0, notReached: 0 };
    events.forEach(function (e) {
      var band = Math.floor(e.trophyMid / 300) * 300;
      var bandKey = band + '-' + (band + 299);
      var b = bandAgg[bandKey] || (bandAgg[bandKey] = { games: 0, cards: {} });
      b.games++;
      if (e.reachedTripleElixir === true) { triple.known++; triple.reached++; }
      else if (e.reachedTripleElixir === false) { triple.known++; triple.notReached++; }
      [['team', e.team], ['opponent', e.opponent]].forEach(function (pair) {
        var side = pair[0], p = pair[1], unique = {};
        (p.deck || []).forEach(function (name) {
          if (unique[name]) return; unique[name] = 1;
          addEventSideStats_(cardAgg, name, e, side);
          var ba = b.cards[name] || (b.cards[name] = [0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0]);
          var tmp = {}; addEventSideStats_(tmp, name, e, side);
          var v = tmp[name]; for (var i = 0; i < 15; i++) ba[i] += (v[i] || 0);
        });
      });
    });
    var byCard = {};
    Object.keys(cardAgg).forEach(function (name) { var s = polSummary_(cardAgg[name]); if (s) byCard[name] = Object.assign({ name: name }, s); });
    var byBand = {};
    Object.keys(bandAgg).forEach(function (bk) {
      var cards = {};
      Object.keys(bandAgg[bk].cards).forEach(function (name) { var s = polSummary_(bandAgg[bk].cards[name]); if (s) cards[name] = Object.assign({ name: name }, s); });
      byBand[bk] = { games: bandAgg[bk].games, cards: cards };
    });
    await ghWriteJson_(evPath,
      { updated: new Date().toISOString(), windowDays: 7, trophyRange: { min: trophyEventMin, max: trophyEventMax },
        count: events.length, duration: triple, events: events },
      'chore: update trophy-battle-events-v1.json');
    await ghWriteJson_(ghSiblingPath_(ghPath, 'trophy-band-card-intel-v1.json'),
      { updated: new Date().toISOString(), windowDays: 7, trophyRange: { min: trophyEventMin, max: trophyEventMax },
        count: events.length, duration: triple, byCard: byCard, byBand: byBand },
      'chore: update trophy-band-card-intel-v1.json');
    console.log('trophy-events ' + events.length + ' events / cards ' + Object.keys(byCard).length);
  } catch (e) { console.log('trophy-events error ' + ((e && e.message) || e)); }

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

  // ★今回出会った10000〜14000帯の相手tagをseed母集団へ登録（上限つき＝肥大化防止）。
  try {
    var seedNowMs = Date.now();
    Object.keys(oppSeedNow).forEach(function (t) {
      if (TAGSET[t]) return; // Top1000は別経路で取得済み
      var e = hist.oppSeeds[t] || (hist.oppSeeds[t] = { lastFetch: 0 });
      e.tr = oppSeedNow[t];
      e.lastSeen = seedNowMs;
    });
    var SEED_MAX = parseInt(prop('SEED_MAX', '8000'), 10);
    var seedKeys = Object.keys(hist.oppSeeds);
    if (seedKeys.length > SEED_MAX) {
      // 直近で見かけた順に残す＝鮮度の高い母集団を保持。
      seedKeys.sort(function (a, b) { return (hist.oppSeeds[b].lastSeen || 0) - (hist.oppSeeds[a].lastSeen || 0); });
      var keep = {};
      seedKeys.slice(0, SEED_MAX).forEach(function (t) { keep[t] = hist.oppSeeds[t]; });
      hist.oppSeeds = keep;
    }
    console.log('opp seeds stored=' + Object.keys(hist.oppSeeds).length);
  } catch (e) { console.log('opp seed store error ' + ((e && e.message) || e)); }

  var windowsOut = {
    '1h': { players: W1H.players, uniquePlayers: W1H.uniquePlayers, games: W1H.games, decks: W1H.decks, winDecks: W1H.winDecks, trending: W1H.trending, cards: W1H.cards, meta: W1H.meta },
    '1d': { players: W1D.players, uniquePlayers: W1D.uniquePlayers, games: W1D.games, decks: W1D.decks, winDecks: W1D.winDecks, trending: W1D.trending, cards: W1D.cards, meta: W1D.meta },
    '3d': { players: W3D.players, uniquePlayers: W3D.uniquePlayers, games: W3D.games, decks: W3D.decks, winDecks: W3D.winDecks, trending: W3D.trending, cards: W3D.cards, meta: W3D.meta }
  };
  if (W7D) windowsOut['7d'] = { players: W7D.players, uniquePlayers: W7D.uniquePlayers, games: W7D.games, decks: W7D.decks, winDecks: W7D.winDecks, trending: W7D.trending, cards: W7D.cards, meta: W7D.meta };

  await ghWriteJson_(ghPath, {
    updated: new Date().toISOString(),
    source: rankingSource,
    trophyRange: rankingSource === 'trophy' ? { min: trophyMin, max: trophyMax } : null,
    players: WDEF.players,
    playersPerRun: aggregated,
    uniquePlayers: WDEF.uniquePlayers,  // ★既定窓の総ユニーク人数（収集頻度に依存しない）
    games: WDEF.games,                  // ★既定窓の総戦数
    topPlayers: players.length,
    intervalHours: intervalHours,
    windowDays: WINDOW_DAYS,
    cardsWindowDays: WINDOW_DAYS,
    defaultWindow: W7D ? '7d' : '3d',
    // 既定窓をトップレベルにも置く＝後方互換（旧フロントもそのまま動く）
    decks: WDEF.decks,
    winDecks: WDEF.winDecks,
    trending: WDEF.trending,
    cards: WDEF.cards,
    meta: WDEF.meta,
    winMin: WIN_MIN_3D,
    // ★窓別（1h / 1日 / 3日）＝フロントのセレクタで切替。既定は 3d。
    windows: windowsOut
  }, 'chore: update decks.json');
  await ghWriteJson_(histPath, hist, 'chore: update cardhist.json'); // 履歴

  console.log('✅ done. players3d=' + players3d + ' decks=' + W3D.decks.length + ' winDecks=' + W3D.winDecks.length);
}

updateDecks().catch(function (e) {
  console.error('❌ collect failed: ' + ((e && e.stack) || e));
  process.exit(1);
}).then(function () {
  if (process.exitCode) return;
  if (String(prop('RUN_TROPHY_SIDELOAD', '0')) !== '1') return;
  if (String(prop('RANKING_SOURCE', 'pol')).toLowerCase() !== 'pol') return;
  console.log('▶ trophy side collect 10000-14000 start (experimental seedless ranking mode)');
  var env = Object.assign({}, process.env, {
    RANKING_SOURCE: 'trophy',
    TROPHY_MIN: '10000',
    TROPHY_MAX: '14000',
    WINDOW_DAYS: '7',
    DECKS_PATH: 'trophy-10000-14000/decks.json',
    RUN_TROPHY_SIDELOAD: '0'
  });
  var r = spawnSync(process.execPath, [__filename], { env: env, stdio: 'inherit' });
  if (r.status) process.exit(r.status);
});
