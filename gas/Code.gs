/**
 * CR Deck Builders – 人気デッキ自動更新 (Google Apps Script)
 * トップ層プレイヤーの currentDeck / battlelog を集計し、人気デッキ・勝率デッキ・
 * カードメタを decks.json として GitHub リポジトリ(data ブランチ)へコミットする。
 *
 * ★この版の要点：
 *   - 各カードを実データから「進化(evo) / ヒーロー(hero) / チャンピオン(champ) / 通常(norm)」に分類。
 *   - デッキごとに形を多数決で確定し slots[]/forms[] を出力。
 *   - ★★3日ローリング：デッキ(使用/勝率)もカードも全て「3日間の合算データ」で出す。
 *       戦闘データ量＝信頼性なので、1回ぶんではなく3日分を貯めて集計する。
 *       各スナップショットに「デッキ署名→[使用人数p, 試合数g, 勝ち数w]」を保存（上位250件）。
 *       3日合算して使用率(延べ使用人数)・勝率を 100位 まで出力。
 *       デッキは count(延べ使用人数) と games(試合数) の両方を載せる。
 *   履歴は cardhist.json として data ブランチに保存（3日より古いスナップショットは捨てる）。
 *
 * スクリプトのプロパティ:
 *   CR_TOKEN, GITHUB_TOKEN, GITHUB_REPO("owner/repo"),
 *   GITHUB_PATH("decks.json"), GITHUB_BRANCH("data"),
 *   TOP_PLAYERS("1000"), INTERVAL_HOURS("6"), WIN_MIN_GAMES_3D("100")
 */

var PROXY = 'https://proxy.royaleapi.dev/v1';
var WINDOW_DAYS = 3; // ローリング期間（日）。デッキ・カード共通。

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

function prop(k, def) {
  var v = PropertiesService.getScriptProperties().getProperty(k);
  return (v === null || v === '') ? (def === undefined ? null : def) : v;
}

function normSlug(name) {
  return String(name).toLowerCase()
    .replace(/\./g, '').replace(/'/g, '').replace(/&/g, 'and')
    .replace(/[^a-z0-9]+/g, '-').replace(/^-+|-+$/g, '');
}

function apiCardToJp(card) { return SLUG2JP[normSlug(card.name)] || null; }

function crGet(path, token) {
  var res = UrlFetchApp.fetch(PROXY + path, {
    method: 'get', headers: { Authorization: 'Bearer ' + token, Accept: 'application/json' }, muteHttpExceptions: true
  });
  var code = res.getResponseCode();
  if (code !== 200) throw new Error('CR API ' + code + ' for ' + path + ' :: ' + res.getContentText().slice(0, 300));
  return JSON.parse(res.getContentText());
}

function deckNameGuess(slots) {
  var wins = ['ホグライダー', 'ロイヤルジャイアント', 'エアバルーン', '巨大クロスボウ', '迫撃砲', 'ゴーレム', 'ラヴァハウンド', 'ペッカ', 'メガナイト', 'ロイヤルホグ', '三銃士', 'スケルトンラッシュ', 'ディガー', 'ゴブリンドリル'];
  for (var i = 0; i < slots.length; i++) { if (wins.indexOf(slots[i]) >= 0) return slots[i] + ' デッキ'; }
  return 'おすすめデッキ';
}

// ★勝ち筋（アーキタイプ）判定。配列の順序＝優先度（上から先に見つかったカード＝そのデッキの勝ち筋）。
//   調整したくなったらこの配列を並べ替え・追加するだけ。該当なしは「その他」。
// 2026-06-11 オーナー監修の36枚（重ビートダウン→攻城→空→ホグ/橋前→サブ勝ち筋の順。下ほど「他に無い時だけ主軸」）
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
// ★形態つき勝ち筋：同じカードでも 通常 / ⚡限界突破 / 👑ヒーロー を別の勝ち筋として返す
//   （フォーム不明 both はヒーロー扱い＝finalizeDeck と同じタイブレーク）
// ★複数勝ち筋カウント版：デッキに含まれる勝ち筋を「全部」返す（形態サフィックス付き）。
//   優先順位は不要＝37枚の正当な順序維持から解放。なければ ['その他']。
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

// ★Wilson下限（95%）：少サンプルの「まぐれ勝率」を統計的に抑えた保証値。勝率ランキングの並び替えに使う。
function wilson_(w, g) {
  if (!g) return 0;
  var z = 1.96, p = w / g, n = g;
  return (p + z * z / (2 * n) - z * Math.sqrt((p * (1 - p) + z * z / (4 * n)) / n)) / (1 + z * z / n);
}

// ★回転係数：cyc=最安4枚の合計（理論上の最速回転）/ hvy=最高4枚の合計（最も重い回り）。
//   表示用ではなく分析用の素データとして各デッキに付与（勝率×回転速度の相関分析などに使う）。
function cycHvy_(slots) {
  var cs = (slots || []).map(function (n) { return COST[n] || 0; }).sort(function (a, b) { return a - b; });
  var cyc = 0, hvy = 0;
  for (var i = 0; i < 4 && i < cs.length; i++) cyc += cs[i];
  for (var j = Math.max(0, cs.length - 4); j < cs.length; j++) hvy += cs[j];
  return { cyc: cyc, hvy: hvy };
}

function updateDecks() {
  var token = (prop('CR_TOKEN') || '').replace(/[^A-Za-z0-9._-]/g, '');
  if (!token) throw new Error('CR_TOKEN 未設定');
  var topN = parseInt(prop('TOP_PLAYERS', '1000'), 10);
  var intervalHours = parseInt(prop('INTERVAL_HOURS', '6'), 10);

  var ranking = crGet('/locations/global/pathoflegend/players?limit=' + topN, token);
  var players = (ranking.items || []).slice(0, topN);
  var headers = { Authorization: 'Bearer ' + token, Accept: 'application/json' };

  // ---- 履歴を先に読む（対戦の二重カウント防止用 lastT を使うため） ----
  var ghPath = prop('GITHUB_PATH', 'decks.json');
  var histPath = ghSiblingPath_(ghPath, 'cardhist.json');
  var hist = ghReadJson_(histPath);
  if (!hist) {
    // ★上書き事故ガード：ファイルが「存在するのに読めない」場合は履歴を消さないよう実行を中断。
    //   （存在しない＝初回だけ新規作成を許可。復旧はgitのコミット履歴から前バージョンを書き戻せばよい）
    var chk = UrlFetchApp.fetch('https://api.github.com/repos/' + prop('GITHUB_REPO') + '/contents/' + histPath + '?ref=' + prop('GITHUB_BRANCH', 'data'),
      { method: 'get', headers: { Authorization: 'token ' + prop('GITHUB_TOKEN'), Accept: 'application/vnd.github.object' }, muteHttpExceptions: true });
    if (chk.getResponseCode() === 200) throw new Error('cardhist.json が存在するのに読めない＝上書き防止のため中断（要調査）');
    hist = { snaps: [], dinfo: {} };
  }
  if (!hist.dinfo) hist.dinfo = {};
  var lastT = hist.lastT || {};   // tag → 前回処理した最新の battleTime
  var newLastT = {};

  // ---- バトルログから集計（pop=各プレイヤーの直前デッキ1個 / win=決着した全試合の勝敗）----
  // ★2026-06-11改修：
  //   - ランク戦のみ集計（type/gameMode で判定。観測したモード名は typeSeen でログ出力）
  //   - battleTime で「前回より新しい試合」だけ勝敗カウント＝6hごとの取得での二重カウント排除
  //   - 完全ミラー（同一8枚）は勝率系から除外（必ず1勝1敗＝勝率を50%に薄めるだけのノイズ）
  //   - 王冠数を集計（3クラウン率・平均クラウン差）
  //   - 相手デッキとのアーキタイプ別 相性（matchups.json に月別累積）
  var pop = {}, win = {}, unmapped = {}, CHUNK = 40;
  var muNow = {};       // ' 自分arch|相手arch' → [試合数, 勝ち数]（今回ぶん）
  var typeSeen = {};    // 観測した type/gameMode の分布（ランク判定の検証用ログ）

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
        // ★形態は evolutionLevel の値で per-battle 判別（実データ診断で確認）：
        //   標準進化＝Lv1（evolutionMedium）／ヒーロー＝Lv2以上（heroMedium）。
        //   両方持ち（ナイト=L1/2・マスケット銃士=L1/3 等）は同一カードが試合ごとに切替＝Lvで振り分ける。
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
      e.cf += tc; e.ca += oc;                     // 王冠（自分/相手）の合計
      if (won === true && tc === 3) e.c3++;       // 3クラウン勝利の数
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
      var tk = (b.type || '?') + '/' + ((b.gameMode && b.gameMode.name) || '?');
      typeSeen[tk] = (typeSeen[tk] || 0) + 1;
      if (!isRanked_(b)) continue;                 // ★ランク戦のみ
      var cards = b.team[0].cards;
      if (evoCnt(cards) > 4) continue; // ★進化とヒーローがevolutionLevelを共有＝特殊枠は最大4まで許容（旧2では正規デッキを弾いてpopが約1/3になっていた）
      var d = classifyDeck(cards);
      if (!d) continue;
      if (!gotPop) { if (tally(pop, d, null)) gotPop = true; }
      var bt = b.battleTime || '';
      if (bt && bt > maxT) maxT = bt;
      if (seenT && bt && bt <= seenT) continue;    // ★前回までに処理済みの試合＝二重カウントしない
      var tc = b.team[0].crowns, oc = b.opponent[0].crowns;
      if (typeof tc !== 'number' || typeof oc !== 'number' || tc === oc) continue;
      var oppCards = b.opponent[0].cards || [];
      var od = (oppCards.length === 8) ? classifyDeck(oppCards) : null;
      if (od && sameSig_(d.jp, od.jp)) continue;   // ★完全ミラー除外
      tally(win, d, tc > oc, tc, oc);
      if (od) {                                     // ★相性（勝ち筋は複数あれば全組み合わせにカウント）
        var aa = archsForm_(d.jp, d.fm), bb = archsForm_(od.jp, od.fm);
        // 相手が追跡対象（上位ランカー）なら、逆向きは相手自身のログ側で必ず記録される＝ここで書くと二重計上。相手が追跡外の時だけ逆向きも書く。
        var oppTag = (b.opponent[0].tag ? String(b.opponent[0].tag).toUpperCase().replace(/[^0-9A-Z]/g, '') : '');
        var oppTracked = !!(oppTag && TAGSET[oppTag]);
        for (var ai = 0; ai < aa.length; ai++) for (var bi = 0; bi < bb.length; bi++) {
          var k = aa[ai] + '|' + bb[bi];            // 自分視点：自分の勝ち筋 vs 相手の勝ち筋（自分が勝てば1勝）
          var mm = muNow[k] || (muNow[k] = [0, 0]);
          mm[0]++; if (tc > oc) mm[1]++;
          if (!oppTracked) {                        // ★相手が追跡外の時だけ相手視点も記録＝勝ちは勝ち。ランカー外の型にもデータが貯まり、A対B/B対Aが裏表で揃う（二重計上なし）
            var k2 = bb[bi] + '|' + aa[ai];
            var mm2 = muNow[k2] || (muNow[k2] = [0, 0]);
            mm2[0]++; if (oc > tc) mm2[1]++;
          }
        }
      }
    }
    if (maxT) newLastT[tag] = maxT;
  }
  function fetchTags(tags) {
    var got = [];
    for (var off = 0; off < tags.length; off += CHUNK) {
      var slice = tags.slice(off, off + CHUNK);
      var batch = slice.map(function (t) {
        return { url: PROXY + '/players/' + encodeURIComponent(t) + '/battlelog', method: 'get', headers: headers, muteHttpExceptions: true };
      });
      var resps = UrlFetchApp.fetchAll(batch);
      resps.forEach(function (res, i) {
        if (res.getResponseCode() === 200) { got.push(slice[i]); try { processLog(JSON.parse(res.getContentText()), slice[i]); } catch (e) {} }
      });
      Utilities.sleep(300);
    }
    return got;
  }
  var allTags = players.map(function (p) { return p.tag; });
  var TAGSET = {}; allTags.forEach(function (t) { TAGSET[String(t).toUpperCase().replace(/[^0-9A-Z]/g, '')] = 1; }); // 追跡中タグ集合＝相性の逆向き記録で「相手も追跡対象か」を判定し二重計上を防ぐ
  // 取得に失敗したタグの lastT は引き継ぐ（次回その人の試合を取りこぼさない）
  allTags.forEach(function (t) { if (lastT[t]) newLastT[t] = newLastT[t] || lastT[t]; });
  var got1 = fetchTags(allTags);
  var miss = allTags.filter(function (t) { return got1.indexOf(t) < 0; });
  if (miss.length) { Utilities.sleep(1200); fetchTags(miss); }
  Logger.log('typeSeen ' + JSON.stringify(typeSeen));

  var aggregated = Object.keys(pop).reduce(function (s, k) { return s + pop[k].count; }, 0);
  var winBattles = Object.keys(win).reduce(function (s, k) { return s + win[k].count; }, 0);
  Logger.log('ranking ' + players.length + ' / players(pop) ' + aggregated + ' / win-battles ' + winBattles + ' / unmapped ' + JSON.stringify(unmapped));
  if (!Object.keys(pop).length) throw new Error('集計0件 unmapped=' + JSON.stringify(unmapped)); // API失敗時は履歴を汚さない

  // ---- デッキ確定（形＋ゲームと同じスロット配置）。pop/win共通 ----
  function finalizeDeck(r) {
    var champName = null, champBest = 0;
    r.cards.forEach(function (n) { var c = (r.votes[n] || {}).champ || 0; if (c > champBest) { champBest = c; champName = n; } });
    var thr = Math.max(1, r.count * 0.25);
    var cardForm = {};
    r.cards.forEach(function (n) { cardForm[n] = 'norm'; });
    if (champName) cardForm[champName] = 'champ';
    // ★旧「特殊形は上位2枚まで(slice(0,2))」を撤廃。実使用どおり表示する。
    //   進化はゲーム仕様で最大2枠 → 投票上位2枚だけ。ヒーロー/チャンピオンは枚数制限なし。
    var evoC = [];
    r.cards.forEach(function (n) {
      if (n === champName) return;
      var v = r.votes[n] || {};
      var ev = (v.evo || 0) + (v.both || 0), he = (v.hero || 0);   // 旧スナップショットのboth票は進化に合算
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

  // ===== 3日ローリング：デッキもカードも3日分の合算で出す =====
  var now = Date.now();
  var DECK_TOP = 100;   // 使用率・勝率ランキングを100位まで
  var DK_KEEP = 250;    // 1スナップショットに保存するデッキ署名の上限（cardhist.jsonを1MB未満に保つ安全策）
  // ★Wilson下限で並べるようになったので最低試合数は30に緩和（まぐれは統計側で抑える）
  var WIN_MIN_3D = parseInt(prop('WIN_MIN_GAMES_3D', '30'), 10);

  // カード単体の素（★形態別：n=ノーマル+チャンピオン / n|e=限界突破 / n|h=ヒーロー。
  //   フォーム不明(both)は e/h に半々で按分。旧スナップショット(形態なしキー)とも共存できる）
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

  // デッキの素：署名→[使用人数p, 試合数g, 勝ち数w]。pop/win両方の署名を統合し上位DK_KEEP件に絞る。
  var sigSet = {};
  Object.keys(pop).forEach(function (s) { sigSet[s] = 1; });
  Object.keys(win).forEach(function (s) { sigSet[s] = 1; });
  var dkArr = Object.keys(sigSet).map(function (sig) {
    var W = win[sig] || {};
    return { sig: sig, p: (pop[sig] ? pop[sig].count : 0), g: W.count || 0, w: W.wins || 0, c3: W.c3 || 0, cf: W.cf || 0, ca: W.ca || 0 };
  });
  dkArr.sort(function (a, b) { return (b.p + b.g) - (a.p + a.g); });
  var dkNow = {};
  dkArr.slice(0, DK_KEEP).forEach(function (x) { dkNow[x.sig] = [x.p, x.g, x.w, x.c3, x.cf, x.ca]; }); // ★王冠つき6要素（旧3要素とも共存）

  // 履歴へ追加し、3日より古いスナップショットを捨てる（histは冒頭で読み込み済み）
  hist.snaps.push({ t: now, players: aggregated, use: useNow, bat: batNow, dk: dkNow });
  hist.snaps = hist.snaps.filter(function (s) { return s.t >= now - WINDOW_DAYS * 864e5; });

  // 3日合算（署名ごとに 延べ使用人数P / 試合数G / 勝ち数W）
  var agg = {}, players3d = 0;
  hist.snaps.forEach(function (s) {
    players3d += (s.players || 0);
    var dk = s.dk || {};
    Object.keys(dk).forEach(function (sig) {
      var a = agg[sig] || (agg[sig] = { P: 0, G: 0, W: 0, C3: 0, CF: 0, CA: 0 });
      a.P += dk[sig][0] || 0; a.G += dk[sig][1] || 0; a.W += dk[sig][2] || 0;
      a.C3 += dk[sig][3] || 0; a.CF += dk[sig][4] || 0; a.CA += dk[sig][5] || 0; // ★旧3要素スナップは0扱い
    });
  });

  // ★署名→アーキタイプ（勝ち筋・形態つき）。確定済みの絵柄（forms）があれば ⚡/👑 を付けて返す
  function archOfSig_(sig) {
    var d = renderSig(sig);
    if (d && d.slots && d.forms) return archForm_(d.slots, d.forms);
    return archOf_(sig.split('#')[0].split('|'));
  }
  // ★複数勝ち筋版（メタシェア・デッキのarchs用）
  function archsOfSig_(sig) {
    var d = renderSig(sig);
    if (d && d.slots && d.forms) return archsForm_(d.slots, d.forms);
    var jp = sig.split('#')[0].split('|');
    var out = [];
    for (var i = 0; i < ARCH_WINCONS.length; i++) if (jp.indexOf(ARCH_WINCONS[i]) >= 0) out.push(ARCH_WINCONS[i]);
    return out.length ? out : ['その他'];
  }
  // ★王冠系の表示値：c3=勝利のうち3クラウンだった割合(%) / cd=1試合あたりの平均クラウン差
  function crownOut_(a) {
    if (!a.G || (a.CF + a.CA) <= 0) return null;
    return { c3: a.W ? Math.round(a.C3 / a.W * 1000) / 10 : null, cd: Math.round((a.CF - a.CA) / a.G * 100) / 100 };
  }

  // 表示用の絵柄：今回の集計(pop/win)から確定。無ければ過去に確定した絵柄(dinfo)を使う。
  function renderSig(sig) {
    if (pop[sig]) return finalizeDeck(pop[sig]);
    if (win[sig]) return finalizeDeck(win[sig]);
    if (hist.dinfo[sig]) return hist.dinfo[sig];
    return null;
  }
  // dinfo更新（今回見た署名は最新の絵柄で上書き）＋窓外の署名を掃除
  Object.keys(dkNow).forEach(function (sig) { var d = renderSig(sig); if (d) hist.dinfo[sig] = { name: d.name, slots: d.slots, forms: d.forms }; });
  var live = {}; hist.snaps.forEach(function (s) { Object.keys(s.dk || {}).forEach(function (sig) { live[sig] = 1; }); });
  Object.keys(hist.dinfo).forEach(function (sig) { if (!live[sig]) delete hist.dinfo[sig]; });

  // 使用率ランキング（3日の延べ使用人数P順・100位）。count=延べ使用人数, games=試合数。
  var popDecks = Object.keys(agg).sort(function (a, b) { return agg[b].P - agg[a].P; })
    .map(function (sig) {
      var d = renderSig(sig); if (!d) return null;
      var a = agg[sig], cr = crownOut_(a);
      var o = { name: d.name, slots: d.slots, forms: d.forms, count: a.P, games: a.G, arch: archOfSig_(sig), archs: archsOfSig_(sig) };
      var ch = cycHvy_(d.slots); o.cyc = ch.cyc; o.hvy = ch.hvy;
      if (a.G > 0) o.winRate = Math.round(a.W / a.G * 1000) / 10;
      if (cr) { o.c3 = cr.c3; o.cd = cr.cd; }
      return o;
    })
    .filter(Boolean).slice(0, DECK_TOP);

  // 勝率ランキング（3日合計WIN_MIN_3D戦以上・勝率順・100位）。games=試合数, count=延べ使用人数。
  // ★勝率ランキングは Wilson下限（95%）で並べ替え＝「30戦のまぐれ60%」より「300戦の54%」が上に来る
  var winDecks = Object.keys(agg).filter(function (sig) { return agg[sig].G >= WIN_MIN_3D; })
    .sort(function (a, b) { return wilson_(agg[b].W, agg[b].G) - wilson_(agg[a].W, agg[a].G) || (agg[b].G - agg[a].G); })
    .map(function (sig) {
      var d = renderSig(sig); if (!d) return null;
      var a = agg[sig], cr = crownOut_(a);
      var o = { name: d.name, slots: d.slots, forms: d.forms, games: a.G, wins: a.W,
        winRate: Math.round(a.W / a.G * 1000) / 10, lb: Math.round(wilson_(a.W, a.G) * 1000) / 10,
        count: a.P, arch: archOfSig_(sig), archs: archsOfSig_(sig) };
      var ch = cycHvy_(d.slots); o.cyc = ch.cyc; o.hvy = ch.hvy;
      if (cr) { o.c3 = cr.c3; o.cd = cr.cd; }
      return o;
    })
    .filter(Boolean).slice(0, DECK_TOP);

  Logger.log('popDecks ' + popDecks.length + ' / winDecks ' + winDecks.length + ' (winMin3d ' + WIN_MIN_3D + ') / sigs ' + Object.keys(agg).length);

  // カード単体（3日ローリング・従来どおり）
  var cards = aggregateCards_(hist.snaps);

  // 急上昇：今回 vs 過去3日（dkベース）
  var trending = [];
  var prior = hist.snaps.slice(0, -1);
  if (prior.length >= 1) {
    var baseCount = {}, basePlayers = 0;
    prior.forEach(function (s) { basePlayers += (s.players || 0); var dk = s.dk || {}; Object.keys(dk).forEach(function (sig) { baseCount[sig] = (baseCount[sig] || 0) + (dk[sig][0] || 0); }); });
    var curPlayers = aggregated || 1;
    Object.keys(pop).forEach(function (sig) {
      var cur = pop[sig].count;
      if (cur < 2) return;
      var rise = (cur / curPlayers) - (basePlayers > 0 ? (baseCount[sig] || 0) / basePlayers : 0);
      if (rise > 0) { var d = finalizeDeck(pop[sig]); trending.push({ name: d.name, slots: d.slots, forms: d.forms, count: cur, delta: Math.round(rise * 1000) / 10 }); }
    });
    trending.sort(function (a, b) { return b.delta - a.delta || b.count - a.count; });
    trending = trending.slice(0, 15);
  }
  Logger.log('cards ' + cards.length + ' / trending ' + trending.length + ' / snaps ' + hist.snaps.length);

  // ★メタシェア：アーキタイプ（勝ち筋）ごとの環境占有率と勝率（3日合算・上位デッキ署名ベース）
  var metaAgg = {};
  var sigTotalP = 0;
  Object.keys(agg).forEach(function (sig) {
    sigTotalP += agg[sig].P;
    archsOfSig_(sig).forEach(function (k) {
      var m = metaAgg[k] || (metaAgg[k] = { P: 0, G: 0, W: 0 });
      m.P += agg[sig].P; m.G += agg[sig].G; m.W += agg[sig].W;
    });
  });
  var totalP = sigTotalP || 1; // ★分母＝延べ使用人数（各デッキ1回）→「その勝ち筋を含むデッキの割合」。複数持ちは重複カウント＝合計100%超えは仕様
  var meta = Object.keys(metaAgg).map(function (k) {
    var m = metaAgg[k];
    return { k: k, share: Math.round(m.P / totalP * 1000) / 10, win: m.G ? Math.round(m.W / m.G * 1000) / 10 : null, games: m.G };
  }).sort(function (a, b) { return b.share - a.share; });

  // ★相性（アーキタイプ×アーキタイプ）：matchups.json に月別で累積（3日窓と独立・どんどん貯まる・軽い）
  //   形式: { months: { "2026-06": { "自分arch|相手arch": [試合数, 勝ち数] } } }
  if (Object.keys(muNow).length) {
    var muPath = ghSiblingPath_(ghPath, 'matchups.json');
    var mu = ghReadJson_(muPath) || { months: {} };
    if (!mu.months) mu.months = {};
    var mk = new Date().toISOString().slice(0, 7);
    var bucket = mu.months[mk] || (mu.months[mk] = {});
    Object.keys(muNow).forEach(function (k) {
      var t = bucket[k] || (bucket[k] = [0, 0]);
      t[0] += muNow[k][0]; t[1] += muNow[k][1];
    });
    mu.updated = new Date().toISOString();
    ghWriteJson_(muPath, mu);
    Logger.log('matchups +' + Object.keys(muNow).length + ' pairs');
  }

  // ★月次署名ダイジェスト（長期リフト/バージョン比較分析用）：sigごとの[使用人数,試合数,勝ち数]を月別ファイルへ累積。
  //   表示は3日窓のまま。キーはカードをインデックス化して圧縮（"3.17.45..|nnehnncn" 形式・形態1文字つき）。
  //   ファイルは月ごとに分割（sighist-YYYY-MM.json）＝読み書きが常に小さい。
  try {
    var mkey2 = new Date().toISOString().slice(0, 7);
    var shPath = ghSiblingPath_(ghPath, 'sighist-' + mkey2 + '.json');
    var sh = ghReadJson_(shPath) || { cards: [], sigs: {} };
    if (!sh.cards) sh.cards = [];
    if (!sh.sigs) sh.sigs = {};
    var cidx = {};
    sh.cards.forEach(function (n, i) { cidx[n] = i; });
    Object.keys(dkNow).forEach(function (sig) {
      var d = renderSig(sig); if (!d || !d.slots) return;
      var pairs = d.slots.map(function (n, i) {
        if (cidx[n] == null) { cidx[n] = sh.cards.length; sh.cards.push(n); }
        return { x: cidx[n], f: ((d.forms && d.forms[i]) || 'norm').charAt(0) }; // n/e/h/c
      });
      pairs.sort(function (a, b) { return a.x - b.x; });
      var key = pairs.map(function (q) { return q.x; }).join('.') + '|' + pairs.map(function (q) { return q.f; }).join('');
      var v = dkNow[sig];
      var t = sh.sigs[key] || (sh.sigs[key] = [0, 0, 0]);
      t[0] += v[0] || 0; t[1] += v[1] || 0; t[2] += v[2] || 0;
    });
    sh.updated = new Date().toISOString();
    ghWriteJson_(shPath, sh);
    Logger.log('sighist ' + Object.keys(sh.sigs).length + ' sigs');
  } catch (e) { Logger.log('sighist error ' + ((e && e.message) || e)); }

  hist.lastT = newLastT; // ★対戦の二重カウント防止のしおりを保存

  commitToGithub({
    updated: new Date().toISOString(),
    players: players3d,          // 3日間の延べ集計人数（使用率の分母）
    playersPerRun: aggregated,   // 今回1回ぶんの集計人数（参考）
    topPlayers: players.length,
    intervalHours: intervalHours,
    windowDays: WINDOW_DAYS,
    cardsWindowDays: WINDOW_DAYS,
    decks: popDecks,
    winDecks: winDecks,
    trending: trending,
    cards: cards,
    meta: meta,
    winMin: WIN_MIN_3D
  });
  ghWriteJson_(histPath, hist); // 履歴を更新（別ファイル）
}

// 窓内のスナップショットからカード単体を集計
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

function ghSiblingPath_(mainPath, name) {
  var i = mainPath.lastIndexOf('/');
  return (i >= 0 ? mainPath.slice(0, i + 1) : '') + name;
}

function ghReadJson_(path) {
  if (r2Enabled_()) {
    try {
      var r2 = r2ReadJson_(path);
      if (r2) return r2;
    } catch (e) { Logger.log('R2 read fallback ' + path + ' :: ' + e.message); }
  }
  var ghToken = prop('GITHUB_TOKEN'), repo = prop('GITHUB_REPO'), branch = prop('GITHUB_BRANCH', 'data');
  if (!ghToken || !repo) return null;
  // ★rawメディアタイプで取得。旧来のbase64型はファイルが1MBを超えるとcontentが空になり、
  //   cardhist.jsonの3日履歴が毎回リセットされる事故が起きた（2026-06-12発覚）。rawなら100MBまでOK。
  var headers = { Authorization: 'token ' + ghToken, Accept: 'application/vnd.github.raw' };
  var res = UrlFetchApp.fetch('https://api.github.com/repos/' + repo + '/contents/' + path + '?ref=' + branch,
    { method: 'get', headers: headers, muteHttpExceptions: true });
  if (res.getResponseCode() !== 200) return null;
  try { return JSON.parse(res.getContentText()); } catch (e) { return null; }
}

function ghWriteJson_(path, obj) {
  dataWriteJson_(path, obj);
}

function ghWriteJsonDirect_(path, obj) {
  var ghToken = prop('GITHUB_TOKEN'), repo = prop('GITHUB_REPO'), branch = prop('GITHUB_BRANCH', 'data');
  if (!ghToken || !repo) throw new Error('GITHUB_TOKEN / GITHUB_REPO 未設定');
  var headers = { Authorization: 'token ' + ghToken, Accept: 'application/vnd.github+json' };
  var api = 'https://api.github.com/repos/' + repo + '/contents/' + path;
  var sha = null;
  // ★objectメディアタイプ＝1MB超ファイルでもshaが取れる（base64型は1MB超でエラーになる）
  var curHeaders = { Authorization: 'token ' + ghToken, Accept: 'application/vnd.github.object' };
  var cur = UrlFetchApp.fetch(api + '?ref=' + branch, { method: 'get', headers: curHeaders, muteHttpExceptions: true });
  if (cur.getResponseCode() === 200) sha = JSON.parse(cur.getContentText()).sha;
  var content = Utilities.base64Encode(Utilities.newBlob(JSON.stringify(obj)).getBytes());
  var body = { message: 'chore: update ' + path, content: content, branch: branch };
  if (sha) body.sha = sha;
  var put = UrlFetchApp.fetch(api, {
    method: 'put', headers: headers, contentType: 'application/json',
    payload: JSON.stringify(body), muteHttpExceptions: true
  });
  var code = put.getResponseCode();
  if (code !== 200 && code !== 201) throw new Error('GitHub write ' + path + ' ' + code + ' :: ' + put.getContentText().slice(0, 200));
}

function r2Enabled_() {
  return !!(prop('R2_ACCOUNT_ID') && prop('R2_ACCESS_KEY_ID') && prop('R2_SECRET_ACCESS_KEY') && prop('R2_BUCKET', 'crdb-data-private'));
}
function r2ObjectKey_(path) {
  var prefix = String(prop('R2_PRIVATE_PREFIX', 'private/') || '').replace(/^\/+/, '');
  if (prefix && prefix.charAt(prefix.length - 1) !== '/') prefix += '/';
  return prefix + String(path || '').replace(/^\/+/, '');
}
function r2EncodeKey_(key) {
  return String(key || '').split('/').map(encodeURIComponent).join('/');
}
function r2IsoStamp_() {
  return new Date().toISOString().replace(/[:-]|\.\d{3}/g, '');
}
function r2BytesToHex_(bytes) {
  return bytes.map(function (b) { var v = b < 0 ? b + 256 : b; return ('0' + v.toString(16)).slice(-2); }).join('');
}
function r2Sha256Hex_(s) {
  return r2BytesToHex_(Utilities.computeDigest(Utilities.DigestAlgorithm.SHA_256, s || '', Utilities.Charset.UTF_8));
}
function r2Hmac_(key, msg) {
  return Utilities.computeHmacSha256Signature(msg, key);
}
function r2SigningKey_(date) {
  var secret = prop('R2_SECRET_ACCESS_KEY');
  var kDate = r2Hmac_('AWS4' + secret, date);
  var kRegion = r2Hmac_(kDate, 'auto');
  var kService = r2Hmac_(kRegion, 's3');
  return r2Hmac_(kService, 'aws4_request');
}
function r2Request_(method, path, payload, contentType) {
  var accountId = prop('R2_ACCOUNT_ID');
  var accessKey = prop('R2_ACCESS_KEY_ID');
  var bucket = prop('R2_BUCKET', 'crdb-data-private');
  var key = r2ObjectKey_(path);
  var host = accountId + '.r2.cloudflarestorage.com';
  var pathname = '/' + encodeURIComponent(bucket) + '/' + r2EncodeKey_(key);
  var body = payload == null ? '' : payload;
  var payloadHash = r2Sha256Hex_(body);
  var amzDate = r2IsoStamp_();
  var date = amzDate.slice(0, 8);
  var headers = { host: host, 'x-amz-content-sha256': payloadHash, 'x-amz-date': amzDate };
  if (contentType) headers['content-type'] = contentType;
  var names = Object.keys(headers).sort();
  var signedHeaders = names.join(';');
  var canonicalHeaders = names.map(function (h) { return h + ':' + headers[h] + '\n'; }).join('');
  var canonicalRequest = [method, pathname, '', canonicalHeaders, signedHeaders, payloadHash].join('\n');
  var scope = date + '/auto/s3/aws4_request';
  var stringToSign = ['AWS4-HMAC-SHA256', amzDate, scope, r2Sha256Hex_(canonicalRequest)].join('\n');
  var signature = r2BytesToHex_(r2Hmac_(r2SigningKey_(date), stringToSign));
  headers.Authorization = 'AWS4-HMAC-SHA256 Credential=' + accessKey + '/' + scope + ', SignedHeaders=' + signedHeaders + ', Signature=' + signature;
  var opts = { method: method.toLowerCase(), headers: headers, muteHttpExceptions: true };
  if (payload != null) { opts.payload = body; opts.contentType = contentType || 'application/octet-stream'; }
  return UrlFetchApp.fetch('https://' + host + pathname, opts);
}
function r2ReadJson_(path) {
  if (!r2Enabled_()) return null;
  var res = r2Request_('GET', path, null, null);
  var code = res.getResponseCode();
  if (code === 404) return null;
  if (code !== 200) throw new Error('R2 read ' + path + ' ' + code + ' :: ' + res.getContentText().slice(0, 200));
  try { return JSON.parse(res.getContentText()); } catch (e) { return null; }
}
function r2WriteJson_(path, obj) {
  var res = r2Request_('PUT', path, JSON.stringify(obj), 'application/json; charset=utf-8');
  var code = res.getResponseCode();
  if (code < 200 || code >= 300) throw new Error('R2 write ' + path + ' ' + code + ' :: ' + res.getContentText().slice(0, 200));
  Logger.log('R2 write ' + r2ObjectKey_(path));
}
function publicJsonPath_(path) {
  var name = String(path || '').split('/').pop();
  return /-public-v\d+\.json$/.test(name) || ['card-stats.json', 'card-tags.json', 'card-potential.json'].indexOf(name) >= 0;
}
function githubOnlyJsonPath_(path) {
  var name = String(path || '').split('/').pop();
  return name === 'card-ids.json' || name === 'collect-freshness.json';
}
function dataWriteJson_(path, obj) {
  if (r2Enabled_() && !githubOnlyJsonPath_(path)) {
    r2WriteJson_(path, obj);
    var mirror = publicJsonPath_(path) ? prop('PUBLIC_GH_MIRROR', '0') === '1' : prop('PRIVATE_GH_MIRROR', '0') === '1';
    if (!mirror) return;
  }
  ghWriteJsonDirect_(path, obj);
}

function commitToGithub(payload) {
  var path = prop('GITHUB_PATH', 'decks.json');
  dataWriteJson_(path, payload);
}

function createTriggers() {
  ScriptApp.getProjectTriggers().forEach(function (t) {
    if (t.getHandlerFunction() === 'updateDecks') ScriptApp.deleteTrigger(t);
  });
  ScriptApp.newTrigger('updateDecks').timeBased().everyHours(6).create();
}


// （旧v1のタグ表生成/出力は2026-06-12に削除＝タグ表v2系に一本化。シート1も不要）

/** =============== タグ表v2 エクスポート（2026-06-12追加） ===============
 * 「タグ表v2」タブ（日本語ヘッダー40列）を読んで card-tags.json をdataブランチへ出力。
 * v1の exportTagSheet は旧シート1用にそのまま残置。今後はこちらを実行する。 */
function exportTagSheetV2() {
  var id = PropertiesService.getScriptProperties().getProperty('TAG_SHEET_ID') || '1cjX3ptT0g0qjfwhoTBKbzRfXGZUNGLy_jspMSRCDPyU';
  var ss = SpreadsheetApp.openById(id);
  var sh = ss.getSheetByName('タグ表v2') || ss.getSheetByName('タグ');
  if (!sh) throw new Error('シート「タグ表v2」または「タグ」が見つかりません');
  var vals = sh.getDataRange().getValues();
  var head = vals[0].map(function(h){ return String(h).trim(); });
  var KEY = {
    'タゲ取り:高HP':'tgHp','タゲ取り:振り向き':'tgKite','タゲ取り:建物':'tgBuilding','タゲ取り:施設':'tgBuilding',
    'タンク':'tank','中型タンク':'minitank','橋前スパム':'bridgeSpam','橋前特攻':'bridgeSpam','群れ':'swarm',
    'タンクキラー':'tankKiller','防衛建物':'defBuilding','防衛施設':'defBuilding','呪文釣り':'spellBait','呪文枯渇':'spellBait',
    'ユニット生成':'spawner','エリクサー生成':'collector','スタン':'stun',
    '凍結・停止':'stop','減速':'slow','ノックバック':'knockback','引き寄せ':'pull',
    '突進':'charge','盾持ち':'shield','回復':'heal','バフ':'buff',
    'デス時生成':'deathSpawn','ダッシュ':'dash','透明':'invisible',
    '範囲攻撃':'splash','対空':'air','飛行':'flying','ランプ(生存強化)':'ramp'
  };
  var nameCol = head.indexOf('カード名');
  var memoCol = head.indexOf('メモ');
  var tagCols = [];
  head.forEach(function(h,i){ if (KEY[h]) tagCols.push([i, KEY[h]]); });
  var cards = {};
  for (var r=1; r<vals.length; r++) {
    var nm = String(vals[r][nameCol]||'').trim(); if (!nm) continue;
    var tags = [];
    tagCols.forEach(function(tc){
      var v = String(vals[r][tc[0]]||'').trim();
      if (v==='○'||v==='◯'||v.toLowerCase()==='o'||v==='1'||v==='true') tags.push(tc[1]);
    });
    var memo = memoCol>=0 ? String(vals[r][memoCol]||'').trim() : '';
    cards[nm] = memo ? {tags:tags, memo:memo} : {tags:tags};
  }
  var out = { updated:new Date().toISOString(), source:'タグ表v2', count:Object.keys(cards).length, cards:cards };
  ghWriteJson_('card-tags.json', out);
  Logger.log('card-tags.json exported (v2): ' + out.count + ' cards');
}

/** =============== ポテンシャル係数 エクスポート（2026-06-12追加） ===============
 * 「ポテンシャル」タブを読んで card-potential.json をdataブランチへ出力。
 * 列は名前で探すので、勝ち筋フラグ/被ダメ許容などの追記列があれば自動で拾う（無ければ無視）。
 * 分析UIは card-tags.json（タグ表v2）と card-potential.json の両方を読む設計。 */
function exportPotentialV1() {
  var id = PropertiesService.getScriptProperties().getProperty('TAG_SHEET_ID') || '1cjX3ptT0g0qjfwhoTBKbzRfXGZUNGLy_jspMSRCDPyU';
  var sh = SpreadsheetApp.openById(id).getSheetByName('ポテンシャル');
  if (!sh) throw new Error('シート「ポテンシャル」が見つかりません');
  var vals = sh.getDataRange().getValues();
  var head = vals[0].map(function(h){ return String(h).trim(); });
  function col(name){ for (var i=0;i<head.length;i++){ if (head[i].indexOf(name)===0) return i; } return -1; }
  var cName=col('カード名'), cHp=col('HP効率'), cDps=col('DPS効率'), cSp=col('呪文ダメ効率'), cCt=col('呪文タワー効率');
  var c1=col('1倍適性'), c2=col('2倍適性'), c3=col('3倍適性'), cKi=col('キラー'), cSc=col('スケーリング型'), cPa=col('噛み合う相手'), cSo=col('素出し適性'), cSep=col('セパレート適性'), cMe=col('メモ');
  // 追記列（勝ち筋の見える化・被ダメ許容・勝負所の式）。存在する時だけ読む（col()は無ければ-1）。
  var cWc=col('勝ち筋'), cWc2=col('第2勝ち筋'), cWc3=col('補助勝ち筋'), cWcCombo=col('組んだら勝ち筋'),
      cChip=col('削り役'), cBrk=col('突破補助'), cSpS=col('呪文勝ち筋補助'), cDefS=col('防衛起点'), cCnt=col('カウンター起点'),
      cTol=col('被ダメ許容'), cT1=col('1倍向き'), cT2=col('2倍向き'), cT3=col('延長向き');
  function flagOf(v){ var s=String(v==null?'':v).trim(); return (s==='〇'||s==='◯'||s==='○'||s==='●'||s==='✓'||s==='v'||s==='V'||s==='1'||s==='TRUE'||s==='true'); }
  function numOf(v){ var n=parseFloat(v); return isFinite(n)?n:null; }
  function strOf(v){ return String(v==null?'':v).trim(); }
  var cards={};
  for (var r=1;r<vals.length;r++){
    var nm=strOf(vals[r][cName]); if(!nm) continue;
    cards[nm]={
      hpEff:numOf(vals[r][cHp]), dpsEff:numOf(vals[r][cDps]), spellEff:numOf(vals[r][cSp]), towerEff:numOf(vals[r][cCt]),
      phase:[strOf(vals[r][c1]),strOf(vals[r][c2]),strOf(vals[r][c3])],
      killer:(cKi>=0?strOf(vals[r][cKi]):''), scaling:strOf(vals[r][cSc]), partner:strOf(vals[r][cPa]), solo:strOf(vals[r][cSo]), sep:(cSep>=0?strOf(vals[r][cSep]):'')
    };
    var memo=strOf(vals[r][cMe]); if(memo) cards[nm].memo=memo;
    // 勝ち筋の見える化（〇の付いた区分だけ配列に）。既存1倍/2倍/3倍(phase)は参考外＝別に式の勝負所列があれば拾う。
    var flags=[];
    if (cWc>=0 && flagOf(vals[r][cWc])) flags.push('勝ち筋');
    if (cWc2>=0 && flagOf(vals[r][cWc2])) flags.push('第2勝ち筋');
    if (cWc3>=0 && flagOf(vals[r][cWc3])) flags.push('補助勝ち筋');
    if (flags.length) cards[nm].winconFlags=flags;
    if (cWcCombo>=0 && flagOf(vals[r][cWcCombo])) cards[nm].comboWincon=true;
    if (cChip>=0 && flagOf(vals[r][cChip])) cards[nm].damageRole=true;
    if (cBrk>=0 && flagOf(vals[r][cBrk])) cards[nm].breakthroughSupport=true;
    if (cSpS>=0 && flagOf(vals[r][cSpS])) cards[nm].spellWinconSupport=true;
    if (cDefS>=0 && flagOf(vals[r][cDefS])) cards[nm].defenseStarter=true;
    if (cCnt>=0 && flagOf(vals[r][cCnt])) cards[nm].counterStarter=true;
    if (cTol>=0){ var tol=numOf(vals[r][cTol]); if(tol!=null) cards[nm].tolerance=tol; }
    // 勝負所は式列（数値）のみ採用。1倍/2倍/3倍適性(phase)は適当な手入力なので分析には使わない。
    if (cT1>=0){ var t1=numOf(vals[r][cT1]); if(t1!=null) cards[nm].timingEarly=t1; }
    if (cT2>=0){ var t2=numOf(vals[r][cT2]); if(t2!=null) cards[nm].timingMid=t2; }
    if (cT3>=0){ var t3=numOf(vals[r][cT3]); if(t3!=null) cards[nm].timingOvertime=t3; }
  }
  var out={ updated:new Date().toISOString(), source:'ポテンシャル', count:Object.keys(cards).length, cards:cards };
  ghWriteJson_('card-potential.json', out);
  Logger.log('card-potential.json exported: '+out.count+' cards');
}

/** =============== ポテンシャルに勝ち筋フラグを流し込む（source-of-truth種まき） ===============
 * wincon-policy.json（オーナー分類済み）を読んで「ポテンシャル」タブへ〇を書き込む。
 * ・列が無ければ メモ の後ろに追加する（勝ち筋/第2勝ち筋/補助勝ち筋/組んだら勝ち筋/削り役/突破補助/
 *   呪文勝ち筋補助/防衛起点/カウンター起点/被ダメ許容/1倍向き(式)/2倍向き(式)/延長向き(式)）。
 * ・被ダメ許容と各「向き(式)」列は“数値でオーナーが監修する枠”。空セルにだけ既定の式を足場として入れ、
 *   すでに手入力（数値でもオーナー修正の式でも）があるセルは一切触らない＝直接編集をいつでも維持できる。
 * ・何度実行してもOK（フラグ列は全消し→貼り直し。数値列は空セルのみ式で補完し、既存値は保持）。カード名はベース名(⚡👑除去)で突合。 */
function seedPotentialWinconFlags() {
  var id = PropertiesService.getScriptProperties().getProperty('TAG_SHEET_ID') || '1cjX3ptT0g0qjfwhoTBKbzRfXGZUNGLy_jspMSRCDPyU';
  var sh = SpreadsheetApp.openById(id).getSheetByName('ポテンシャル');
  if (!sh) throw new Error('シート「ポテンシャル」が見つかりません');
  var wp = ghReadJson_('wincon-policy.json');
  if (!wp || !wp.cards) throw new Error('wincon-policy.json を読めません（GITHUB_TOKEN/REPO/BRANCH か R2 設定を確認）');
  var pol = wp.cards;
  function has(arr, xs){ return (arr||[]).some(function(a){ return xs.indexOf(a) >= 0; }); }
  function atHas(at, xs){ return xs.some(function(x){ return String(at||'').indexOf(x) >= 0; }); }
  var FLAG_COLS = ['勝ち筋','第2勝ち筋','補助勝ち筋','組んだら勝ち筋','削り役','突破補助','呪文勝ち筋補助','防衛起点','カウンター起点'];
  var NUM_COLS = ['被ダメ許容','1倍向き(式)','2倍向き(式)','延長向き(式)'];
  function flagsFor(name){
    var c = pol[name]; if (!c) return null;
    var ax = c.axes || [], at = c.attackType || '', isSpell = c.sourceType === 'spell';
    return {
      '勝ち筋': c['class'] === '勝ち筋',
      '第2勝ち筋': c['class'] === '第2勝ち筋',
      '補助勝ち筋': c['class'] === '補助勝ち筋',
      '組んだら勝ち筋': c['class'] === '変数カード' || has(ax, ['variable','copy','contextDependent']),
      '削り役': atHas(at, ['chip']) || has(ax, ['chipDamage','towerChipIfConnected','bridgePoke']),
      '突破補助': atHas(at, ['siege','directPressure']) || has(ax, ['siege','directDamage']),
      '呪文勝ち筋補助': (isSpell && (c['class'] === '第2勝ち筋' || c['class'] === '補助勝ち筋')) || atHas(at, ['spellFinish']) || has(ax, ['spellFinish']),
      '防衛起点': c['class'] === '防衛札' || has(ax, ['defense','groundDefense','airDefense','survivability']),
      'カウンター起点': has(ax, ['kite','lanePull','pull','tempoControl','freeze','reset','surround']) || atHas(at, ['kite','cycleDefense'])
    };
  }
  var vals = sh.getDataRange().getValues();
  var head = vals[0].map(function(h){ return String(h).trim(); });
  function colIdx(name){ for (var i=0;i<head.length;i++){ if (head[i] === name) return i; } return -1; }
  // 足りない列を メモ の後ろ（無ければ末尾）に追加
  var want = FLAG_COLS.concat(NUM_COLS);
  var missing = want.filter(function(n){ return colIdx(n) < 0; });
  if (missing.length) {
    var lastCol = sh.getLastColumn();
    sh.getRange(1, lastCol + 1, 1, missing.length).setValues([missing]);
    vals = sh.getDataRange().getValues(); head = vals[0].map(function(h){ return String(h).trim(); });
  }
  var cName = colIdx('カード名');
  function baseOf(nm){ return String(nm||'').replace(/[\u26a1\ud83d\udc51]+$/, '').trim(); }
  // 数値式列(NUM_COLS)の“足場”式。行番号だけ差し替えて空セルに入れる（0〜10へ丸め）。
  // A列が空の行は空文字を返すので、余白行にゴミが出ない。既存の手入力/手直し式があるセルは上書きしない。
  var A1 = 'ABCDEFGHIJKLMNOPQRSTUVWXYZ';
  function colA1(idx){ var s=''; idx=idx+1; while(idx>0){ var m=(idx-1)%26; s=A1.charAt(m)+s; idx=Math.floor((idx-1)/26); } return s; }
  var LB=colA1(colIdx('コスト')), LC=colA1(colIdx('タイプ')), LD=colA1(colIdx('HP効率(÷コスト)')>=0?colIdx('HP効率(÷コスト)'):colIdx('HP効率')), LE=colA1(colIdx('DPS効率(÷コスト)')>=0?colIdx('DPS効率(÷コスト)'):colIdx('DPS効率')), LG=colA1(colIdx('呪文タワー効率')), LL=colA1(colIdx('素出し適性')), LM=colA1(colIdx('セパレート適性')), LA=colA1(cName);
  var LO=colA1(colIdx('勝ち筋')), LP=colA1(colIdx('第2勝ち筋')), LQ=colA1(colIdx('補助勝ち筋')), LS=colA1(colIdx('削り役')), LT=colA1(colIdx('突破補助')), LU=colA1(colIdx('呪文勝ち筋補助')), LV=colA1(colIdx('防衛起点')), LW=colA1(colIdx('カウンター起点'));
  function numFormula(name, r){
    var A=LA+r, B=LB+r, C=LC+r, D=LD+r, E=LE+r, G=LG+r, L=LL+r, M=LM+r, O=LO+r, P=LP+r, Q=LQ+r, S=LS+r, T=LT+r, U=LU+r, V=LV+r, W=LW+r;
    if (name === '被ダメ許容')
      return '=IF($'+A+'="","",ROUND(MAX(0,MIN(10,0.003*$'+D+'+0.004*$'+E+'+IF($'+C+'="Building",-1,0)+IF($'+B+'>=6,1.2,IF($'+B+'>=5,0.6,IF($'+B+'<=2,-0.4,0)))+IF($'+O+'="〇",0.7,0)+IF($'+P+'="〇",0.3,0)+IF($'+V+'="〇",-0.4,0)+IF($'+W+'="〇",0.5,0))),1))';
    if (name === '1倍向き(式)')
      return '=IF($'+A+'="","",ROUND(MAX(0,MIN(10,(7-$'+B+')/6*5+IF($'+L+'="◎",2,IF($'+L+'="○",1.2,IF($'+L+'="△",0.5,0)))+IF($'+C+'="Spell",1,0)+IF($'+V+'="〇",1.2,0)+IF($'+W+'="〇",0.8,0)-IF($'+B+'>=6,1.2,IF($'+B+'>=5,0.5,0)))),1))';
    if (name === '2倍向き(式)')
      return '=IF($'+A+'="","",ROUND(MAX(0,MIN(10,0.002*$'+D+'+0.003*$'+E+'+IF($'+O+'="〇",1.2,0)+IF($'+P+'="〇",0.9,0)+IF($'+Q+'="〇",0.6,0)+IF($'+S+'="〇",0.6,0)+IF($'+T+'="〇",0.8,0)+IF($'+M+'="○",0.4,0)+IF($'+B+'>=4,0.5,0))),1))';
    if (name === '延長向き(式)')
      return '=IF($'+A+'="","",ROUND(MAX(0,MIN(10,0.0025*$'+D+'+0.003*$'+E+'+0.01*$'+G+'+IF($'+O+'="〇",1.6,0)+IF($'+P+'="〇",1,0)+IF($'+Q+'="〇",0.5,0)+IF($'+S+'="〇",0.7,0)+IF($'+U+'="〇",1.2,0)+IF($'+B+'>=5,0.8,0)-IF($'+B+'<=2,0.4,0))),1))';
    return '';
  }
  var seeded = 0, filledFormula = 0;
  for (var r = 1; r < vals.length; r++) {
    var nm = baseOf(vals[r][cName]); if (!nm) continue;
    var f = flagsFor(nm);
    // フラグ列は毎回リセットして貼り直し（分類変更に追従）。
    for (var k = 0; k < FLAG_COLS.length; k++) {
      var ci = colIdx(FLAG_COLS[k]); if (ci < 0) continue;
      var on = f && f[FLAG_COLS[k]];
      sh.getRange(r + 1, ci + 1).setValue(on ? '\u3007' : '');
    }
    // 数値式列は“空セルだけ”式で足場を入れる（オーナーが数値/式で上書き済みなら保持）。
    for (var j = 0; j < NUM_COLS.length; j++) {
      var nj = colIdx(NUM_COLS[j]); if (nj < 0) continue;
      var cur = vals[r][nj];
      if (cur === '' || cur === null || typeof cur === 'undefined') {
        var fml = numFormula(NUM_COLS[j], r + 1);
        if (fml) { sh.getRange(r + 1, nj + 1).setFormula(fml); filledFormula++; }
      }
    }
    if (f) seeded++;
  }
  Logger.log('seedPotentialWinconFlags: ' + seeded + ' cards flagged / ' + filledFormula + ' formula cells seeded / policy ' + Object.keys(pol).length);
}


// ★タグ表v2/ポテンシャルの視認性整形（1回実行用・何度実行してもOK）
//   交互の縞・先頭行/列固定・フィルタ・記号の色分け（◎緑/○黄/△橙/要確認赤）
function formatTagSheets() {
  var id = prop('TAG_SHEET_ID', '');
  if (!id) throw new Error('TAG_SHEET_ID なし');
  var ss = SpreadsheetApp.openById(id);
  ss.getSheets().forEach(function (sh) {
    var name = sh.getName();
    if (name !== 'タグ表v2' && name !== 'ポテンシャル' && name !== 'ウェイト') return;
    var rng = sh.getDataRange();
    try { sh.getBandings().forEach(function (b) { b.remove(); }); } catch (e) {}
    try { rng.applyRowBanding(SpreadsheetApp.BandingTheme.LIGHT_GREY, true, false); } catch (e) {}
    sh.setFrozenRows(1);
    sh.setFrozenColumns(1);
    function rule(text, color) {
      return SpreadsheetApp.newConditionalFormatRule().whenTextEqualTo(text).setBackground(color).setRanges([rng]).build();
    }
    var rules = [rule('◎', '#b7e1cd'), rule('○', '#fce8b2'), rule('△', '#f7c8a0'),
      SpreadsheetApp.newConditionalFormatRule().whenTextContains('要確認').setBackground('#f4c7c3').setRanges([rng]).build()];
    sh.setConditionalFormatRules(rules);
    try { var f = sh.getFilter(); if (f) f.remove(); } catch (e) {}
    try { rng.createFilter(); } catch (e) {}
    sh.getRange(1, 1, 1, rng.getNumColumns()).setFontWeight('bold').setBackground('#e8eaf0');
  });
  Logger.log('formatted: タグ表v2 / ポテンシャル');
}

/** =============== ウェイト（軸別1〜5）ドラフト生成＋エクスポート（2026-06-12追加） ===============
 * buildWeightSheet(): card-stats/card-tagsから攻撃圧・地上防衛・対空・小物処理・妨害（各0〜5）を
 *   ヒューリスティックで自動ドラフト→シート「ウェイト」タブに書き出し→そのまま exportWeightsV1() も実行。
 *   ⚡/👑行はベース値のコピー（要赤入れ）。赤入れ後は exportWeightsV1 だけ再実行すればチャートに即反映。
 * 診断ページのレーダーチャートは card-weights.json を読む。 */
function buildWeightSheet() {
  var stats = ghReadJson_('card-stats.json');
  var tagsJ = ghReadJson_('card-tags.json') || { cards: {} };
  if (!stats || !stats.cards) throw new Error('card-stats.json が読めない');
  var byJp = {};
  stats.cards.forEach(function (c) { byJp[c.jp] = c; });
  function tagsOf(nm) { var e = tagsJ.cards[nm]; return (e && e.tags) || []; }
  function clamp(v, a, b) { return Math.max(a, Math.min(b, Math.round(v))); }
  function draft(nm) {
    var base = nm.replace(/[⚡👑]+$/, '');
    var c = byJp[base]; if (!c) return null;
    var n = c.n || {}, t = tagsOf(nm).concat(tagsOf(base));
    function ht(k) { return t.indexOf(k) >= 0; }
    var isSp = n.type === 'Spell', isBld = n.type === 'Building';
    var dps = c.dps16 || 0;
    var autoT = (c.tags || []);
    var atk = 0, dg = 0, da = 0, sw = 0, ct = 0;
    if (ARCH_WINCONS.indexOf(base) >= 0) atk = (n.cost >= 6 ? 5 : n.cost >= 4 ? 4 : 3);
    else if (ht('bridgeSpam')) atk = 3;
    else if (isSp) atk = (autoT.indexOf('大呪文') >= 0 ? 3 : autoT.indexOf('中呪文') >= 0 ? 2 : 1);
    else if (dps >= 300 && !isBld) atk = 2;
    else atk = 1;
    if (isSp) dg = (autoT.indexOf('小呪文') >= 0 || autoT.indexOf('中呪文') >= 0) ? 2 : 1;
    else if (ht('defBuilding')) dg = 4;
    else if (isBld) dg = 2;
    else {
      dg = clamp(dps / 130, 1, 4);
      if (ht('tank') || ht('minitank') || ht('shield')) dg += 1;
      if (ht('swarm')) dg += 1;
      if (n.bld) dg = 1;
      dg = clamp(dg, 0, 5);
    }
    var hitsAir = ht('air') || n.air;
    if (!hitsAir) da = 0;
    else if (isSp) da = 2;
    else { da = clamp(dps / 110, 1, 4); if (n.splash || ht('splash')) da += 1; da = clamp(da, 1, 5); }
    if (isSp) sw = (autoT.indexOf('小呪文') >= 0 ? 4 : autoT.indexOf('中呪文') >= 0 ? 3 : 2);
    else if (n.splash || ht('splash')) sw = clamp(dps / 90, 2, 5);
    else if (ht('swarm')) sw = 2;
    else sw = 0;
    ct = (ht('stun') ? 2 : 0) + (ht('stop') ? 2 : 0) + (ht('knockback') ? 1 : 0)
       + (ht('pull') ? 2 : 0) + (ht('slow') ? 1 : 0) + (ht('heal') ? 1 : 0) + (ht('buff') ? 1 : 0);
    ct = clamp(ct, 0, 5);
    return [atk, dg, da, sw, ct];
  }
  var names = Object.keys(tagsJ.cards || {});
  if (!names.length) names = stats.cards.map(function (c) { return c.jp; });
  var head = ['カード名', 'コスト', '攻撃圧', '地上防衛', '対空', '小物処理', '妨害', 'メモ'];
  var rows = [];
  names.forEach(function (nm) {
    var d = draft(nm); if (!d) return;
    var base = nm.replace(/[⚡👑]+$/, '');
    var cost = byJp[base] && byJp[base].n ? byJp[base].n.cost : '';
    var memo = (nm === base) ? '自動ドラフト・要赤入れ' : '形態行：ベースのコピー・要赤入れ';
    rows.push([nm, cost, d[0], d[1], d[2], d[3], d[4], memo]);
  });
  var id = prop('TAG_SHEET_ID', '');
  var ss = SpreadsheetApp.openById(id);
  var sh = ss.getSheetByName('ウェイト') || ss.insertSheet('ウェイト');
  sh.clear();
  sh.getRange(1, 1, 1, head.length).setValues([head]).setFontWeight('bold').setBackground('#e8eaf0');
  sh.getRange(2, 1, rows.length, head.length).setValues(rows);
  sh.setFrozenRows(1); sh.setFrozenColumns(1);
  Logger.log('ウェイト ' + rows.length + '行を生成。続けてエクスポートします');
  exportWeightsV1();
}

function exportWeightsV1() {
  var id = prop('TAG_SHEET_ID', '');
  var sh = SpreadsheetApp.openById(id).getSheetByName('ウェイト');
  if (!sh) throw new Error('シート「ウェイト」がありません（先に buildWeightSheet）');
  var vals = sh.getDataRange().getValues();
  var cards = {};
  for (var r = 1; r < vals.length; r++) {
    var nm = String(vals[r][0] || '').trim(); if (!nm) continue;
    var a = parseFloat(vals[r][2]), g = parseFloat(vals[r][3]), v = parseFloat(vals[r][4]), w = parseFloat(vals[r][5]), k = parseFloat(vals[r][6]);
    cards[nm] = { atk: isFinite(a) ? a : 0, defG: isFinite(g) ? g : 0, defA: isFinite(v) ? v : 0, swarm: isFinite(w) ? w : 0, ctrl: isFinite(k) ? k : 0 };
  }
  var out = { updated: new Date().toISOString(), source: 'ウェイト（軸別1〜5・オーナー監修）', count: Object.keys(cards).length, cards: cards };
  ghWriteJson_('card-weights.json', out);
  Logger.log('card-weights.json exported: ' + out.count + ' cards');
}

/** =============== エリクサー価値ベクトル（9軸＋細分サブ値）ドラフト生成＋エクスポート（2026-06-30追加） ===============
 * 設計思想（オーナー討議2026-06-30）：
 *   「このカードは1エリクサーで“どんな局面をどれだけ片づけられるか”」を9つの価値ベクトルに圧縮する。
 *   呪文のように HP/DPS が無くても価値の高い札（例：ローリングウッド＝小物処理・制御・ノックバック・回転・攻め支援）を、
 *   生数値ではなく「エリクサー当たりの解決力」で測るのが狙い。
 * ソースは card-eval.json（既に17項目を“生スコア×÷コスト効率”で全カード相対1-10化済み＝エリクサー効率の塊）。
 *   ＝ここを土台にすれば、呪文の価値も既に正しく入っている（card-eval側で手当て済み）。
 * 9ベクトル：火力 / 耐久 / 処理 / 制御 / 範囲 / 到達 / 防衛 / 回転 / 柔軟性。
 *   回転価値はここでは「単体の軽さ」=文脈なしの素点。実際の“今のデッキを軽くできるか”はフロントで平均コスト文脈に対して再計算する。
 * 細分サブ値：小物処理/中型処理/群れ処理/空中処理/タンク処理 ・ ノックバック/リセット/スタン/スロー ・ 対空/大型受け/速攻受け/建物受け。
 * 使い方：buildElixirVectorSheet() を1回実行 → シート「エリクサー価値」に自動ドラフト＋そのまま card-elixir-vectors-v1.json も出力。
 *   赤入れ後は exportElixirVectorsV1() だけ再実行すればフロントに即反映。列はヘッダー名で照合＝列を足しても壊れない。 */
function buildElixirVectorSheet() {
  var evalJ = ghReadJson_('card-eval.json');
  if (!evalJ || !evalJ.cards) throw new Error('card-eval.json が読めない（先に buildCardEvalV1 を実行）');
  var tagsJ = ghReadJson_('card-tags.json') || { cards: {} };
  var potJ = ghReadJson_('card-potential.json') || { cards: {} };
  var stats = ghReadJson_('card-stats.json') || { cards: [] };
  var byJp = {}; (stats.cards || []).forEach(function (c) { byJp[c.jp] = c; });
  var EC = evalJ.cards, TC = tagsJ.cards || {}, PC = potJ.cards || {};
  var TOP = [['火力', 'fire'], ['耐久', 'dur'], ['処理', 'clear'], ['制御', 'ctrl'], ['範囲', 'area'],
    ['到達', 'reach'], ['防衛', 'def'], ['回転', 'cycle'], ['柔軟', 'flex']];
  var SUB = [['小物処理', 'small'], ['中型処理', 'mid'], ['群れ処理', 'swarm'], ['空中処理', 'airClear'], ['タンク処理', 'tank'],
    ['ノックバック', 'knock'], ['リセット', 'reset'], ['スタン', 'stun'], ['スロー', 'slow'], ['対空', 'antiAir'],
    ['大型受け', 'bigBlock'], ['速攻受け', 'fastBlock'], ['建物受け', 'bldBlock'], ['射程圧', 'range'], ['手数圧', 'tempo'], ['レイジ適性', 'rage']];
  function baseOf(nm) { return String(nm || '').replace(/[⚡👑]+$/, ''); }
  function formOf(nm) { return /⚡$/.test(nm) ? '進化' : /👑$/.test(nm) ? 'ヒーロー/特殊' : '通常'; }
  function num(v) { var n = parseFloat(v); return isFinite(n) ? Math.round(n * 10) / 10 : ''; }
  function statNum(v) { if (typeof v === 'number') return v; var s = String(v || '').trim(); var m = s.match(/\((-?[0-9.]+)\)/); var n = parseFloat(m ? m[1] : s); return isFinite(n) ? Math.round(n * 10) / 10 : ''; }
  function phaseNum(v) { if (typeof v === 'number') return v; var s = String(v || '').trim(); if (s === '◎') return 9; if (s === '○') return 6; if (s === '△') return 3; if (s === '—' || s === '-') return 0; return num(s); }
  function soloNum(v) { if (typeof v === 'number') return v; var s = String(v || '').trim(); if (s === '◎') return 5; if (s === '○') return 3; if (s === '△') return 1; if (s === '—' || s === '-') return 0; return num(s); }
  function a1(n) { var s = ''; while (n > 0) { var r = (n - 1) % 26; s = String.fromCharCode(65 + r) + s; n = Math.floor((n - 1) / 26); } return s; }
  function addTriplet(row, label, val, rowNo, key) {
    var c = row.length + 1;
    row.push(adjustedValueFormula_(num(val), key, rowNo), '', '=IF(' + a1(c + 1) + rowNo + '="",' + a1(c) + rowNo + ',' + a1(c + 1) + rowNo + ')');
  }
  function addAdjusted(row, raw, rowNo, mode) {
    var c = row.length + 1;
    row.push(raw == null ? '' : raw, '');
    if (mode === 'divide') row.push('=IF(' + a1(c + 1) + rowNo + '="",' + a1(c) + rowNo + ',' + a1(c) + rowNo + '/(1+' + a1(c + 1) + rowNo + '))');
    else if (mode === 'add') row.push('=IF(' + a1(c + 1) + rowNo + '="",' + a1(c) + rowNo + ',' + a1(c) + rowNo + '+' + a1(c + 1) + rowNo + ')');
    else row.push('=IF(' + a1(c + 1) + rowNo + '="",' + a1(c) + rowNo + ',' + a1(c) + rowNo + '*(1+' + a1(c + 1) + rowNo + '))');
  }
  var head = ['カード名', '形態', 'コスト', '種別', '役割', '確認状態', '私のメモ', '調整理由'];
  TOP.forEach(function (p) { head.push(p[0] + ' 自動', p[0] + ' 調整', p[0] + ' 最終'); });
  SUB.forEach(function (p) { head.push(p[0] + ' 自動', p[0] + ' 調整', p[0] + ' 最終'); });
  head = head.concat(['HP16', 'HP補正%', '補正HP16', 'DPS16', 'DPS補正%', '補正DPS16', '単発ダメ16', '攻撃速度', '発射速度補正%', '補正攻撃速度',
    '射程', '射程補正', '補正射程', '移動速度', '移動速度補正%', '補正移動速度', '体数', '攻撃対象', '主要タグ',
    'HP効率', 'DPS効率', '呪文ダメ効率', '呪文タワー効率', '1倍適性', '2倍適性', '3倍適性', '素出し適性', 'キラー',
    'レイジ後DPS(+30%)', 'レイジ後攻撃/生成間隔(+30%)', 'レイジ後移動速度(+30%)', '素材メモ']);

  function cell(rowNo, label) { var idx = head.indexOf(label); return idx >= 0 ? a1(idx + 1) + rowNo : ''; }
  function ratioExpr(rowNo, adjustedLabel, rawLabel) {
    var adj = cell(rowNo, adjustedLabel), raw = cell(rowNo, rawLabel);
    return 'IF(OR(' + raw + '="",' + raw + '=0,' + adj + '=""),1,' + adj + '/' + raw + ')';
  }
  function diffExpr(rowNo, adjustedLabel, rawLabel) {
    var adj = cell(rowNo, adjustedLabel), raw = cell(rowNo, rawLabel);
    return 'IF(OR(' + raw + '="",' + adj + '=""),0,' + adj + '-' + raw + ')';
  }
  function adjustedValueFormula_(base, key, rowNo) {
    if (base === '') return '';
    var hp = '(' + ratioExpr(rowNo, '補正HP16', 'HP16') + ')';
    var dpsRaw = '(' + ratioExpr(rowNo, '補正DPS16', 'DPS16') + ')';
    var speedFire = '(' + ratioExpr(rowNo, '攻撃速度', '補正攻撃速度') + ')';
    var dps = '(' + dpsRaw + '*' + speedFire + ')';
    var rangeDelta = '(' + diffExpr(rowNo, '補正射程', '射程') + ')';
    var move = '(' + ratioExpr(rowNo, '補正移動速度', '移動速度') + ')';
    var expr = String(base);
    if (key === 'fire') expr = base + '*(0.25+0.75*' + dps + ')';
    else if (key === 'dur') expr = base + '*' + hp;
    else if (key === 'clear') expr = base + '*(0.25+0.75*' + dps + ')';
    else if (key === 'area') expr = base + '*(0.35+0.65*' + dps + ')';
    else if (key === 'reach') expr = base + '+' + rangeDelta + '*0.7+' + '((' + move + ')-1)*1.2';
    else if (key === 'def') expr = base + '*(0.15+0.45*' + hp + '+0.40*' + dps + ')+' + rangeDelta + '*0.2';
    else if (key === 'flex') expr = base + '+' + rangeDelta + '*0.2+((' + move + ')-1)*1.5';
    else if (key === 'small' || key === 'mid' || key === 'swarm' || key === 'airClear' || key === 'tank' || key === 'antiAir' || key === 'tempo') expr = base + '*(0.25+0.75*' + dps + ')';
    else if (key === 'bigBlock') expr = base + '*(0.55*' + hp + '+0.45*' + dps + ')';
    else if (key === 'fastBlock') expr = base + '*(0.30*' + hp + '+0.45*' + dps + '+0.25*' + move + ')';
    else if (key === 'bldBlock') expr = base + '*' + hp;
    else if (key === 'range') expr = base + '+' + rangeDelta + '*1.2';
    else if (key === 'rage') expr = base + '*(0.20+0.50*' + dps + '+0.30*' + move + ')';
    return '=MAX(0,MIN(10,ROUND((' + expr + ')*10)/10))';
  }

  var rows = [];
  Object.keys(EC).forEach(function (nm) {
    var base = baseOf(nm), st = byJp[base] || {}, n = st.n || {}, p = PC[base] || {}, ph = p.phase || [];
    var tags = ((TC[nm] || TC[base] || {}).tags || []), v = elixirVectorDraft_(EC[nm], tags, st);
    var rowNo = rows.length + 2;
    var row = [nm, formOf(nm), n.cost || '', n.type || '', '', '未確認', '', ''];
    TOP.forEach(function (x) { addTriplet(row, x[0], v[x[1]], rowNo, x[1]); });
    SUB.forEach(function (x) { addTriplet(row, x[0], v.sub[x[1]], rowNo, x[1]); });
    addAdjusted(row, st.hp16 || '', rowNo, 'multiply');
    addAdjusted(row, st.dps16 || '', rowNo, 'multiply');
    row.push(st.dmg16 || '');
    addAdjusted(row, statNum(n.hitSpeed) || '', rowNo, 'divide');
    addAdjusted(row, statNum(n.range) || '', rowNo, 'add');
    addAdjusted(row, statNum(n.speed) || '', rowNo, 'multiply');
    row.push(n.count || 1, n.type === 'Building' ? '建物' : (n.air ? '両方' : '地上'), tags.join(' / '), num(p.hpEff), num(p.dpsEff), num(p.spellEff), num(p.towerEff),
      phaseNum(ph[0]), phaseNum(ph[1]), phaseNum(ph[2]), soloNum(p.solo), p.killer || '',
      '=IF(' + a1(head.indexOf('補正DPS16') + 1) + rowNo + '="","",' + a1(head.indexOf('補正DPS16') + 1) + rowNo + '*1.3)',
      '=IF(' + a1(head.indexOf('補正攻撃速度') + 1) + rowNo + '="","",' + a1(head.indexOf('補正攻撃速度') + 1) + rowNo + '/1.3)',
      '=IF(' + a1(head.indexOf('補正移動速度') + 1) + rowNo + '="","",' + a1(head.indexOf('補正移動速度') + 1) + rowNo + '*1.3)',
      'HP/DPS/攻撃速度/射程/移動速度の補正は左側の自動/最終列へ連動。さらに変えたい時だけ各 調整 列で上書き。');
    rows.push(row);
  });

  var id = prop('TAG_SHEET_ID', '1cjX3ptT0g0qjfwhoTBKbzRfXGZUNGLy_jspMSRCDPyU');
  var ss = SpreadsheetApp.openById(id);
  var sh = ss.getSheetByName('エリクサー価値') || ss.insertSheet('エリクサー価値');
  sh.clear();
  sh.getRange(1, 1, 1, head.length).setValues([head]).setFontWeight('bold').setBackground('#e8eaf0');
  if (rows.length) sh.getRange(2, 1, rows.length, head.length).setValues(rows);
  sh.setFrozenRows(1); sh.setFrozenColumns(8);
  try { sh.getRange(1, 1, sh.getLastRow(), sh.getLastColumn()).createFilter(); } catch (e) {}
  try { buildElixirVectorUsageSheet(); } catch (e) { Logger.log('使い方タブ生成 skip: ' + e); }
  Logger.log('エリクサー価値 ' + rows.length + '行を生成。続けてエクスポートします');
  exportElixirVectorsV1();
}

/** シート「使い方」を作り直す。エリクサー価値タブの編集導線をシート内に残すための案内。 */
function buildElixirVectorUsageSheet() {
  var id = prop('TAG_SHEET_ID', '1cjX3ptT0g0qjfwhoTBKbzRfXGZUNGLy_jspMSRCDPyU');
  var ss = SpreadsheetApp.openById(id);
  var sh = ss.getSheetByName('使い方') || ss.insertSheet('使い方');
  var rows = [
    ['CRDB エリクサー価値の使い方', '', '', ''],
    ['目的', 'カードを1エリクサー当たりの解決力として整理し、デッキ作成アシストの候補・苦しい相手・次に伸ばす方向へつなげます。', '', ''],
    ['編集する場所', '基本は「エリクサー価値」タブの 補正% と 調整 列だけ編集します。式が読む素材列は数値だけに寄せます。最終列がJSONへ出ます。', '', ''],
    ['見る素材', 'タグ: 対空/範囲/タンクキラー/建物受け/生成/バフ/ランプなど。ポテンシャル: HP効率/DPS効率/倍速適性/素出し/キラー。エリクサー価値側では必要分を数値化して見ます。', '', ''],
    ['バランス調整', 'HP補正%・DPS補正%・発射速度補正%・射程補正・移動速度補正%で、次の調整を仮置きして確認します。+10%は0.1、-5%は-0.05。補正は左側の自動/最終列へ連動します。', '', ''],
    ['レイジ前提', 'レイジは30%速度ブーストとして扱います。移動速度、発射速度、建物/生成系のテンポが伸びる前提で見ます。発射速度+30%は攻撃/生成間隔÷1.3として見ます。', '', ''],
    ['公開手順', 'タグ/ポテンシャルを直したら exportTagSheetV2() → exportPotentialV1() → buildCardEvalV1() → buildElixirVectorSheet()。赤入れ後は exportElixirVectorsV1()。勝ち筋フラグは seedPotentialWinconFlags() でwincon-policyから流し込めます（数値の被ダメ許容/向き列は手監修）。', '', ''],
    ['Node導線', 'ローカルからは node tools/export-elixir-vectors-from-sheet.js --out /tmp/card-elixir-vectors-v1.json --publish --verify', '', ''],
    ['フロント反映', 'サイト側は card-elixir-vectors-public-v1.json だけを直接読みます。深い材料はR2/Workerへ移す方針です。', '', ''],
    ['文言ルール', 'ユーザー向けには裏側の言い方を出さず、「受けを作りやすい」「攻めを通しやすい」「手札を回し直しやすい」のように自然に出します。', '', ''],
    ['今後足す軸', '5枚目以降は 空受け/小物処理/中型処理/大型処理/射程支援/手数/速度で伸びる札/回転力 を細かく見ます。', '', '']
  ];
  sh.clear();
  sh.getRange(1, 1, rows.length, 4).setValues(rows);
  sh.getRange(1, 1, 1, 4).merge().setFontWeight('bold').setFontSize(14).setBackground('#e8eaf0');
  sh.getRange(2, 1, rows.length - 1, 1).setFontWeight('bold').setBackground('#f5f6fa');
  sh.getRange(2, 2, rows.length - 1, 3).mergeAcross();
  sh.getRange(1, 1, rows.length, 4).setWrap(true).setVerticalAlignment('middle');
  sh.setColumnWidths(1, 1, 140);
  sh.setColumnWidths(2, 3, 260);
  Logger.log('使い方タブを生成: ' + rows.length + '行');
}

/** シート「エリクサー価値」→ card-elixir-vectors-v1.json（dataブランチ）。
 *  ヘッダー名→ascii キーで照合＝列の増減/並び替えに強い。サブ値は sub:{} にネスト。 */
function exportElixirVectorsV1() {
  var id = prop('TAG_SHEET_ID', '1cjX3ptT0g0qjfwhoTBKbzRfXGZUNGLy_jspMSRCDPyU');
  var sh = SpreadsheetApp.openById(id).getSheetByName('エリクサー価値');
  if (!sh) throw new Error('シート「エリクサー価値」がありません（先に buildElixirVectorSheet）');
  // 日本語ヘッダー → JSONキー対応（前方一致で解決）。topは9ベクトル、subは細分値。
  var TOP = [['火力', 'fire'], ['耐久', 'dur'], ['処理', 'clear'], ['制御', 'ctrl'], ['範囲', 'area'],
    ['到達', 'reach'], ['防衛', 'def'], ['回転', 'cycle'], ['柔軟', 'flex']];
  var SUB = [['小物', 'small'], ['中型', 'mid'], ['群れ', 'swarm'], ['空中', 'airClear'], ['タンク', 'tank'],
    ['ノックバック', 'knock'], ['リセット', 'reset'], ['スタン', 'stun'], ['スロー', 'slow'],
    ['対空', 'antiAir'], ['大型受け', 'bigBlock'], ['速攻受け', 'fastBlock'], ['建物受け', 'bldBlock'],
    ['射程圧', 'range'], ['手数圧', 'tempo'], ['レイジ適性', 'rage']];
  var vals = sh.getDataRange().getValues();
  var head = vals[0].map(function (h) { return String(h).trim(); });
  function colByPrefix(label) { for (var i = 0; i < head.length; i++) { if (head[i].indexOf(label) === 0) return i; } return -1; }
  function colValue(label) {
    for (var i = 0; i < head.length; i++) { if (head[i] === label + ' 最終') return i; }
    for (var j = 0; j < head.length; j++) { if (head[j].indexOf(label) === 0 && head[j].indexOf('最終') >= 0) return j; }
    for (var k = 0; k < head.length; k++) { if (head[k] === label + '価値' || head[k] === label) return k; }
    return colByPrefix(label);
  }
  var cName = colByPrefix('カード名');
  var topCol = {}, subCol = {};
  TOP.forEach(function (p) { topCol[p[1]] = colValue(p[0]); });
  SUB.forEach(function (p) { subCol[p[1]] = colValue(p[0]); });
  function num(v) { var n = parseFloat(v); return isFinite(n) ? Math.round(n * 10) / 10 : 0; }
  var cards = {};
  for (var r = 1; r < vals.length; r++) {
    var nm = String(vals[r][cName] || '').trim(); if (!nm) continue;
    var row = {};
    TOP.forEach(function (p) { row[p[1]] = topCol[p[1]] >= 0 ? num(vals[r][topCol[p[1]]]) : 0; });
    var sub = {};
    SUB.forEach(function (p) { sub[p[1]] = subCol[p[1]] >= 0 ? num(vals[r][subCol[p[1]]]) : 0; });
    row.sub = sub;
    cards[nm] = row;
  }
  var out = {
    updated: new Date().toISOString(),
    source: 'エリクサー価値（9ベクトル・自動ドラフト＋オーナー監修）',
    scale: '0-10',
    note: '1エリクサー当たりの解決力。回転価値は単体の軽さ＝素点で、実デッキの平均コスト文脈での価値はフロントで再計算する。',
    vectors: ['fire', 'dur', 'clear', 'ctrl', 'area', 'reach', 'def', 'cycle', 'flex'],
    subs: ['small', 'mid', 'swarm', 'airClear', 'tank', 'knock', 'reset', 'stun', 'slow', 'antiAir', 'bigBlock', 'fastBlock', 'bldBlock', 'range', 'tempo', 'rage'],
    count: Object.keys(cards).length,
    cards: cards
  };
  ghWriteJson_('card-elixir-vectors-v1.json', out);
  ghWriteJson_('card-elixir-vectors-public-v1.json', {
    updated: out.updated,
    version: 1,
    visibility: 'public-display',
    scale: out.scale,
    vectors: out.vectors,
    subs: out.subs,
    count: out.count,
    cards: out.cards
  });
  Logger.log('card-elixir-vectors-v1.json exported: ' + out.count + ' cards');
}

/** 9ベクトル＋サブ値の自動ドラフト。card-eval(17項目0-10)＋タグ＋実数値から算出。
 *  ※フロント(js/builder.js)の deriveElixirVector() と同じ式。片方を直したら必ず両方そろえる。 */
function elixirVectorDraft_(e, tags, st) {
  var T = {}; (tags || []).forEach(function (t) { T[t] = 1; });
  function has(k) { return !!T[k]; }
  function ev(k) { var x = e ? e[k] : 0; return (typeof x === 'number' && isFinite(x)) ? x : 0; }
  function cl(x) { return Math.max(0, Math.min(10, Math.round(x * 10) / 10)); }
  function rangeNum(v) { if (typeof v === 'number') return v; var s = String(v || ''); var m = s.match(/\(([0-9.]+)\)/); var n = parseFloat(m ? m[1] : s); return isFinite(n) ? n : 0; }
  var n = st && st.n ? st.n : {};
  var cost = n.cost || 5;
  var canAir = !!n.air;
  var splash = !!n.splash || has('splash');
  var defBld = has('defBuilding');
  var minitank = has('minitank');
  var rng = rangeNum(n.range);
  var rangeBonus = rng >= 5 ? 3 : rng >= 4 ? 2.2 : rng >= 3 ? 1.4 : 0;

  var tankProc = ev('タンク処理'), midProc = ev('中型タンク処理');
  var airSingle = ev('対空単体処理'), grdSwarm = ev('地上群れ処理'), airSwarm = ev('対空群れ処理');
  var wall = ev('壁性能'), spellRes = ev('呪文耐性');
  var towerDmg = ev('タワーダメージ力'), towerFin = ev('タワーダメージ決定力'), bldDmg = ev('施設破壊力'), bldBreak = ev('施設突破力');
  var solo = ev('素出し適正'); // 1倍/2倍/3倍適性は仮置き扱いのためベクトル導出に使わない（フロントの deriveElixirVector と一致させる）
  var rangePress = ev('射程圧'), tempoPress = ev('手数圧'), rageFit = ev('レイジ適性');
  var cheap = (7 - cost) / 6 * 10; // cost1→10, cost7→0

  var fire = cl(0.38 * towerDmg + 0.30 * towerFin + 0.22 * bldDmg + 0.10 * tempoPress);
  var dur = cl(0.62 * wall + 0.38 * spellRes);
  var clear = cl(0.23 * tankProc + 0.17 * midProc + 0.17 * airSingle + 0.22 * grdSwarm + 0.15 * airSwarm + 0.06 * tempoPress);
  var ctrl = cl((has('stun') ? 3.4 : 0) + (has('stop') ? 3.8 : 0) + (has('slow') ? 2.6 : 0) + (has('knockback') ? 2.4 : 0) + (has('pull') ? 3.2 : 0));
  var area = splash ? cl(Math.max(6, Math.max(grdSwarm, airSwarm))) : cl(0.5 * Math.max(grdSwarm, airSwarm));
  var reach = cl(0.40 * bldBreak + 0.18 * rangePress + (canAir ? 2.2 : 0) + ((has('bridgeSpam') || has('dash') || has('charge')) ? 2.3 : 0) + rangeBonus);
  var def = cl(0.34 * wall + 0.28 * Math.max(airSingle, airSwarm) + 0.23 * Math.max(tankProc, midProc) + 0.08 * rangePress + (defBld ? 2.5 : 0) + (minitank ? 1 : 0));
  var cycle = cl(cheap);
  var flex = cl(0.30 * solo + ((canAir) ? 2.0 : 0) + 0.18 * clear + 0.17 * rangePress + 0.17 * tempoPress + 0.10 * rageFit + 0.08 * def);

  function tagCtl(on) { return on ? cl(5 + (7 - cost) / 6 * 5) : 0; }
  var sub = {
    small: cl(Math.max(grdSwarm, airSwarm)),
    mid: cl(midProc),
    swarm: cl(grdSwarm),
    airClear: cl(Math.max(airSingle, airSwarm)),
    tank: cl(tankProc),
    knock: tagCtl(has('knockback')),
    reset: tagCtl(has('stun') || has('stop')),
    stun: tagCtl(has('stun')),
    slow: tagCtl(has('slow')),
    antiAir: cl(Math.max(airSingle, airSwarm)),
    bigBlock: cl(0.6 * wall + 0.4 * Math.max(tankProc, midProc)),
    fastBlock: cl((7 - cost) / 6 * 6 + 0.4 * Math.max(tankProc, midProc) + (defBld ? 2 : 0)),
    bldBlock: defBld ? cl(6 + 0.4 * wall) : 0,
    range: cl(rangePress),
    tempo: cl(tempoPress),
    rage: cl(rageFit)
  };
  return { fire: fire, dur: dur, clear: clear, ctrl: ctrl, area: area, reach: reach, def: def, cycle: cycle, flex: flex, sub: sub };
}

/** =============== シート1（旧v1）→タグ表v2 全量合算（チェックタブ廃止版） ===============
 * シート1のオーナー記入（○・メモ）を全部v2へ取り込む。v2の「空セル」にしか書かない。
 * 曖昧だった列は card-stats の属性で機械判別して振り分け：
 *  - スタン/凍結/減速○ → attrs に Stun/Freeze/Slow があるかで スタン/凍結・停止/減速 へ
 *  - 回復/サポート○ → attrs に Boost があれば バフ、なければ 回復
 *  - タゲ取り適性○ → Building→タゲ取り:建物 / hp16≥2400→タゲ取り:高HP / それ以外→タゲ取り:振り向き
 * 実行後はシート1を完全削除してOK（呪文圏内などの自動タグは card-stats.json 由来＝シート不要）。 */
function mergeV1IntoV2() {
  var id = prop('TAG_SHEET_ID', '');
  var ss = SpreadsheetApp.openById(id);
  var s1 = ss.getSheetByName('シート1');
  var v2 = ss.getSheetByName('タグ表v2');
  if (!s1 || !v2) throw new Error('シート1またはタグ表v2が見つかりません');
  var stats = ghReadJson_('card-stats.json');
  var byJp = {};
  (stats && stats.cards || []).forEach(function (c) { byJp[c.jp] = c; });
  var a = s1.getDataRange().getValues();
  var b = v2.getDataRange().getValues();
  var h1 = a[0].map(String), h2 = b[0].map(String);
  function c1(n) { for (var i = 0; i < h1.length; i++) if (h1[i].indexOf(n) >= 0) return i; return -1; }
  function c2(n) { for (var i = 0; i < h2.length; i++) if (h2[i].indexOf(n) >= 0) return i; return -1; }
  var rowV2 = {};
  for (var r = 1; r < b.length; r++) { var nm = String(b[r][0] || '').trim(); if (nm) rowV2[nm] = r; }
  var applied = 0, skipped = [];
  function setIfEmpty(vr, col, val) {
    if (col < 0) return;
    var cur = String(b[vr][col] || '').trim();
    if (!cur) { v2.getRange(vr + 1, col + 1).setValue(val); applied++; }
  }
  function marked(r, col) { return col >= 0 && String(a[r][col] || '').trim() !== ''; }
  var iTK = c1('タンクキラー'), iCh = c1('突進'), iSp = c1('スポーン持続'), iRe = c1('リセット持ち'),
      iSt = c1('スタン'), iHe = c1('回復'), iTg = c1('タゲ取り適性'), iMe = c1('メモ');
  var jTK = c2('タンクキラー'), jCh = c2('突進'), jUn = c2('ユニット生成'), jSt = c2('スタン'),
      jFr = c2('凍結'), jSl = c2('減速'), jBu = c2('バフ'), jHe = c2('回復'),
      jTgB = c2('タゲ取り:建物'), jTgH = c2('タゲ取り:高HP'), jTgK = c2('タゲ取り:振り向き'), jMe = c2('メモ');
  for (var r = 1; r < a.length; r++) {
    var nm = String(a[r][0] || '').trim(); if (!nm) continue;
    var vr = rowV2[nm]; if (vr == null) { skipped.push(nm); continue; }
    var st = byJp[nm] || {};
    var attrKeys = Object.keys((st.attrs) || {}).join('|');
    if (marked(r, iTK)) setIfEmpty(vr, jTK, '○');
    if (marked(r, iCh)) setIfEmpty(vr, jCh, '○');
    if (marked(r, iSp)) setIfEmpty(vr, jUn, '○');
    if (marked(r, iRe)) setIfEmpty(vr, jSt, '○');
    if (marked(r, iSt)) {
      if (/Stun/i.test(attrKeys)) setIfEmpty(vr, jSt, '○');
      else if (/Freeze/i.test(attrKeys)) setIfEmpty(vr, jFr, '○');
      else if (/Slow/i.test(attrKeys)) setIfEmpty(vr, jSl, '○');
      else setIfEmpty(vr, jSt, '○');
    }
    if (marked(r, iHe)) {
      if (/Boost/i.test(attrKeys)) setIfEmpty(vr, jBu, '○');
      else setIfEmpty(vr, jHe, '○');
    }
    if (marked(r, iTg)) {
      var typ = (st.n && st.n.type) || '';
      if (typ === 'Building') setIfEmpty(vr, jTgB, '○');
      else if ((st.hp16 || 0) >= 2400) setIfEmpty(vr, jTgH, '○');
      else setIfEmpty(vr, jTgK, '○');
    }
    if (iMe >= 0 && jMe >= 0) {
      var mv = String(a[r][iMe] || '').trim();
      if (mv && mv.indexOf('要確認') < 0) {
        var cur2 = String(b[vr][jMe] || '').trim();
        if (cur2.indexOf(mv) < 0) {
          v2.getRange(vr + 1, jMe + 1).setValue(cur2 ? (cur2 + ' ／[v1] ' + mv) : ('[v1] ' + mv));
          applied++;
        }
      }
    }
  }
  Logger.log('全量合算 ' + applied + '件。v2に行がなかった: [' + skipped.join(',') + ']。シート1は削除してOK');
}
/** =============== カード評価マトリクス（2026-06-12追加・多段評価の土台①） ===============
 * オーナー設計：①カード単位の多項目評価（理論側＝タグ×ウェイト×ポテンシャル×実数値）
 *   → ②環境実績と掛けてデッキ構築 → ③デッキ自体の評価、の積み上げ。
 * シート「カード評価」＝A列に評価項目、1行目にカード名（タグ表v2と同じ並び・176枚）。
 * セルは0〜10のグラデーション（実数値ベースの自動ドラフト。オーナー赤入れ前提）。
 *
 * 使い方：
 *   buildCardEvalSheet()  … 自動ドラフト生成＋整形（★再実行すると赤入れが消える。ウェイトと同じ運用）
 *   exportCardEvalV1()    … シート → card-eval.json をdataブランチへ（赤入れ後はこれだけ再実行）
 * 式は全部この中の EVAL_ITEMS に閉じている＝しきい値の調整はここを直すだけ。
 */
function buildCardEvalSheet() {
  var stats = ghReadJson_('card-stats.json');
  var tagsJ = ghReadJson_('card-tags.json') || { cards: {} };
  var potJ = ghReadJson_('card-potential.json') || { cards: {} };
  if (!stats || !stats.cards) throw new Error('card-stats.json が読めない');
  var byJp = {};
  stats.cards.forEach(function (c) { byJp[c.jp] = c; });

  var id = prop('TAG_SHEET_ID', '1cjX3ptT0g0qjfwhoTBKbzRfXGZUNGLy_jspMSRCDPyU');
  var ss = SpreadsheetApp.openById(id);
  var v2 = ss.getSheetByName('タグ表v2');
  if (!v2) throw new Error('タグ表v2 がない');
  var names = v2.getRange(2, 1, v2.getLastRow() - 1, 1).getValues()
    .map(function (r) { return String(r[0] || '').trim(); }).filter(String);

  function baseOf(nm) { return nm.replace(/[⚡👑]+$/, ''); }
  function tagsOf(nm) {
    var e = tagsJ.cards[nm], b = tagsJ.cards[baseOf(nm)];
    return ((e && e.tags) || []).concat((b && b.tags) || []);
  }
  function potOf(nm) { return potJ.cards[nm] || potJ.cards[baseOf(nm)] || {}; }
  function statOf(nm) { return byJp[baseOf(nm)] || null; }
  function clamp(v, a, b) { return Math.max(a, Math.min(b, Math.round(v))); }
  function band(v, steps) { for (var i = 0; i < steps.length; i++) if (v >= steps[i][0]) return steps[i][1]; return 0; }
  function mk(s) { return s === '◎' ? 3 : s === '○' ? 2 : s === '△' ? 1 : 0; }
  function hitDmg(s) { // 単発ダメ16（"x5"系はper値）
    var keys = ['Damage', 'Area Damage', 'Damage per hit'];
    for (var i = 0; i < keys.length; i++) {
      var d = s.s16 && s.s16[keys[i]];
      if (d != null) return (typeof d === 'object' && d) ? (d.per || d.total || 0) : d;
    }
    return null;
  }
  function ctx(nm) {
    var s = statOf(nm);
    return {
      s: s, n: (s && s.n) || {}, t: tagsOf(nm), autoT: (s && s.tags) || [], p: potOf(nm),
      isSp: s && s.n && s.n.type === 'Spell', isBld: s && s.n && s.n.type === 'Building',
      dpsT: s ? (s.dps16 || 0) * ((s.n && s.n.count) || 1) : 0
    };
  }
  function ht(c, k) { return c.t.indexOf(k) >= 0; }

  // ---- 評価項目（A列）。fn(nm, c) → 0〜10 or '' ----
  var EVAL_ITEMS = [
    ['コスト(参考)', function (nm, c) { return c.n.cost != null && isFinite(parseFloat(c.n.cost)) ? c.n.cost : ''; }],
    ['タンク処理', function (nm, c) {
      if (!c.s) return '';
      if (c.isSp) return c.autoT.indexOf('大呪文') >= 0 ? 3 : c.autoT.indexOf('中呪文') >= 0 ? 2 : 1;
      var sc = band(c.dpsT, [[1500, 9], [1000, 8], [700, 7], [500, 6], [400, 5], [300, 4], [200, 2], [1, 1]]);
      if (ht(c, 'tankKiller')) sc = Math.max(sc + 2, 6);
      if (ht(c, 'ramp')) sc += 1;       // 生存強化（インフェ系）
      if (ht(c, 'pull')) sc += 1;       // 引き寄せで処理位置を作れる
      return clamp(sc, 0, 10);
    }],
    ['対空処理', function (nm, c) {
      if (!c.s) return '';
      if (!(ht(c, 'air') || c.n.air)) return 0;
      if (c.isSp) return c.autoT.indexOf('大呪文') >= 0 ? 4 : c.autoT.indexOf('中呪文') >= 0 ? 3 : 2;
      var sc = band(c.dpsT, [[1200, 9], [700, 7], [500, 6], [350, 5], [250, 4], [150, 3], [1, 2]]);
      if (c.n.splash || ht(c, 'splash')) sc += 1;
      return clamp(sc, 0, 10);
    }],
    ['小物処理(対群れ)', function (nm, c) {
      if (!c.s) return '';
      var dm = hitDmg(c.s) || 0;
      if (c.isSp) return band(dm, [[400, 7], [280, 5], [120, 3], [1, 1]]);
      if (c.n.splash || ht(c, 'splash')) return band(dm, [[450, 8], [330, 7], [180, 5], [120, 4], [1, 3]]);
      var hs = parseFloat(c.n.hitSpeed) || 2;
      return (c.n.count || 1) >= 3 ? 4 : (hs <= 1.1 ? 3 : 1);   // 群れ・手数で掃除
    }],
    ['地上受け・壁', function (nm, c) {
      if (!c.s || c.isSp) return c.isSp ? 0 : '';
      var sc = band(c.s.hp16 || 0, [[6000, 9], [4000, 8], [3000, 7], [2400, 6], [1500, 4], [800, 3], [300, 2], [1, 1]]);
      if (ht(c, 'tgHp') || ht(c, 'tgKite') || ht(c, 'tgBuilding')) sc += 1;
      if (ht(c, 'defBuilding')) sc += 2;
      if (ht(c, 'deathSpawn') || ht(c, 'shield')) sc += 1;
      if ((c.n.count || 1) >= 3) sc += 1;   // 取り囲み・分散受け
      return clamp(sc, 0, 10);
    }],
    ['攻撃圧(タワー脅威)', function (nm, c) {
      if (!c.s) return '';
      if (c.isSp) {
        var cost = parseFloat(c.n.cost);
        var tD = (c.p.towerEff != null && isFinite(cost)) ? c.p.towerEff * cost : 0;  // 呪文タワーダメ16
        return band(tD, [[500, 7], [400, 6], [280, 5], [140, 3], [1, 1]]);
      }
      var sc;
      if (ARCH_WINCONS.indexOf(baseOf(nm)) >= 0) sc = c.n.cost >= 7 ? 9 : c.n.cost >= 5 ? 8 : 7;
      else if (ht(c, 'bridgeSpam')) sc = 6;
      else if (c.n.bld) sc = 5;
      else sc = band(c.dpsT, [[700, 4], [400, 3], [1, 2]]);
      return clamp(sc, 0, 10);
    }],
    ['妨害・リセット', function (nm, c) {
      if (!c.s) return '';
      var sc = (ht(c, 'stop') ? 4 : 0) + (ht(c, 'stun') ? 3 : 0) + (ht(c, 'pull') ? 3 : 0)
             + (ht(c, 'knockback') ? 2 : 0) + (ht(c, 'slow') ? 2 : 0);
      return clamp(sc, 0, 10);
    }],
    ['呪文耐性', function (nm, c) {
      if (!c.s || c.isSp) return '';
      var sc = band(c.s.hp16 || 0, [[2400, 10], [1700, 8], [1180, 7], [1110, 6], [600, 5], [430, 4], [310, 3], [1, 1]]);
      if ((c.n.count || 1) >= 3) sc -= 2;   // まとめて消える
      if (ht(c, 'deathSpawn')) sc += 1;
      return clamp(sc, 1, 10);
    }],
    ['回転(軽さ)', function (nm, c) {
      var m = { 1: 10, 2: 9, 3: 7, 4: 6, 5: 4, 6: 3, 7: 2, 8: 1, 9: 1 };
      var cost = parseFloat(c.n.cost);
      return isFinite(cost) && m[cost] != null ? m[cost] : '';
    }],
    ['素出し安全度', function (nm, c) {
      var so = c.p.solo || '';
      if (so === '—' || so === '-') return '';
      var sc = so === '◎' ? 9 : so === '○' ? 6 : so === '△' ? 3 : '';
      if (sc === '') return '';
      if (c.p.sep === '◎' || c.p.sep === '○') sc += 1;   // 左右分割で素出し価値UP
      return clamp(sc, 0, 10);
    }],
    ['序盤適性(1倍)', function (nm, c) { var v = mk((c.p.phase || [])[0]); return v ? v * 3 : ''; }],
    ['終盤適性(2倍3倍)', function (nm, c) {
      var p = c.p.phase || []; var v = mk(p[1]) + mk(p[2]);
      return v ? Math.round(v * 1.5) : '';
    }],
    ['支援・強化', function (nm, c) {
      if (!c.s) return '';
      var sc = (ht(c, 'heal') ? 3 : 0) + (ht(c, 'buff') ? 3 : 0) + (ht(c, 'collector') ? 5 : 0)
             + (ht(c, 'spawner') ? 2 : 0) + (c.p.scaling ? 2 : 0);
      return clamp(sc, 0, 10);
    }],
    ['呪文釣り', function (nm, c) {
      if (!c.s) return '';
      if (!ht(c, 'spellBait')) return 0;
      var sc = 6 + (parseFloat(c.n.cost) <= 3 ? 1 : 0) + ((c.n.count || 1) >= 3 ? 1 : 0);
      return clamp(sc, 0, 10);
    }]
  ];

  // ---- マトリクス生成（行=項目、列=カード） ----
  var header = ['項目＼カード'].concat(names);
  var matrix = [header];
  EVAL_ITEMS.forEach(function (item) {
    var row = [item[0]];
    names.forEach(function (nm) {
      var c = ctx(nm);
      var v; try { v = item[1](nm, c); } catch (e) { v = ''; }
      row.push(v);
    });
    matrix.push(row);
  });
  var memoRow = ['備考'].concat(names.map(function (nm) {
    return nm === baseOf(nm) ? '自動ドラフト・要赤入れ' : '形態行：ベース準拠・要赤入れ';
  }));
  matrix.push(memoRow);

  var sh = ss.getSheetByName('カード評価') || ss.insertSheet('カード評価');
  sh.clear();
  try { sh.getConditionalFormatRules().length && sh.setConditionalFormatRules([]); } catch (e) {}
  sh.getRange(1, 1, matrix.length, header.length).setValues(matrix);
  sh.getRange(1, 1, 1, header.length).setFontWeight('bold').setBackground('#e8eaf0');
  sh.getRange(1, 1, matrix.length, 1).setFontWeight('bold');
  sh.setFrozenRows(1); sh.setFrozenColumns(1);
  // 0〜10のヒートマップ（コスト行・備考行は除外＝2行目〜項目最終行）
  var dataRange = sh.getRange(3, 2, EVAL_ITEMS.length - 1, names.length);
  var rule = SpreadsheetApp.newConditionalFormatRule()
    .setGradientMinpointWithValue('#ffffff', SpreadsheetApp.InterpolationType.NUMBER, '0')
    .setGradientMidpointWithValue('#fce8b2', SpreadsheetApp.InterpolationType.NUMBER, '5')
    .setGradientMaxpointWithValue('#57bb8a', SpreadsheetApp.InterpolationType.NUMBER, '10')
    .setRanges([dataRange]).build();
  sh.setConditionalFormatRules([rule]);
  Logger.log('カード評価: ' + (EVAL_ITEMS.length) + '項目 × ' + names.length + 'カードを生成。続けてエクスポートします');
  exportCardEvalV1();
}

/** カード評価シート → card-eval.json（dataブランチ）。行ラベルは前方一致で拾う＝ラベル微修正に強い */
function exportCardEvalV1() {
  var id = prop('TAG_SHEET_ID', '1cjX3ptT0g0qjfwhoTBKbzRfXGZUNGLy_jspMSRCDPyU');
  var sh = SpreadsheetApp.openById(id).getSheetByName('カード評価');
  if (!sh) throw new Error('シート「カード評価」がありません（先に buildCardEvalSheet）');
  var vals = sh.getDataRange().getValues();
  var names = vals[0].slice(1).map(function (v) { return String(v || '').trim(); });
  var KEY = [
    ['タンク処理', 'tank'], ['対空処理', 'air'], ['小物処理', 'swarm'], ['地上受け', 'wall'],
    ['攻撃圧', 'atk'], ['妨害', 'ctrl'], ['呪文耐性', 'spellRes'], ['回転', 'cycle'],
    ['素出し', 'solo'], ['序盤適性', 'early'], ['終盤適性', 'late'], ['支援', 'support'], ['呪文釣り', 'bait']
  ];
  var cards = {};
  names.forEach(function (nm) { if (nm) cards[nm] = {}; });
  for (var r = 1; r < vals.length; r++) {
    var label = String(vals[r][0] || '').trim();
    var key = null;
    KEY.forEach(function (k) { if (!key && label.indexOf(k[0]) === 0) key = k[1]; });
    if (!key) continue;
    for (var cIdx = 0; cIdx < names.length; cIdx++) {
      var nm = names[cIdx]; if (!nm) continue;
      var v = parseFloat(vals[r][cIdx + 1]);
      cards[nm][key] = isFinite(v) ? v : null;
    }
  }
  var out = { updated: new Date().toISOString(), source: 'カード評価（項目×カード・オーナー監修）', scale: '0-10', count: Object.keys(cards).length, cards: cards };
  ghWriteJson_('card-eval.json', out);
  Logger.log('card-eval.json exported: ' + out.count + ' cards');
}

// ===== タグ表v2「攻撃対象」列を自動記入（card-statsのn.air/n.bld由来＝地上/両方/建物）=====
// ヘッダー名で列を探すので位置非依存。空欄を埋め、オーナーは例外だけ赤入れ可。
function fillAttackTarget() {
  var stats = ghReadJson_('card-stats.json');
  if (!stats || !stats.cards) throw new Error('card-stats.json が読めない');
  var tgt = {};
  stats.cards.forEach(function (c) { var n = c.n || {}; tgt[c.jp] = n.bld ? '建物' : (n.air ? '両方' : '地上'); });
  var sid = prop('TAG_SHEET_ID', '1cjX3ptT0g0qjfwhoTBKbzRfXGZUNGLy_jspMSRCDPyU');
  var sh = SpreadsheetApp.openById(sid).getSheetByName('タグ表v2');
  if (!sh) throw new Error('タグ表v2 が無い');
  var vals = sh.getDataRange().getValues(), header = vals[0], jCol = -1;
  for (var c = 0; c < header.length; c++) { if (String(header[c] || '').trim() === '攻撃対象') { jCol = c; break; } }
  if (jCol < 0) throw new Error('「攻撃対象」列が見つからない');
  var colData = [], wrote = 0;
  for (var r = 1; r < vals.length; r++) {
    var existing = String(vals[r][jCol] || '').trim();
    if (existing) { colData.push([vals[r][jCol]]); continue; } // 既存(赤入れ)は保持＝空欄だけ埋める
    var name = String(vals[r][0] || '').trim(), base = name.replace(/[⚡👑]+$/, '');
    var v = name ? (tgt[name] || tgt[base] || '') : '';
    colData.push([v]); if (v) wrote++;
  }
  sh.getRange(2, jCol + 1, colData.length, 1).setValues(colData);
  Logger.log('fillAttackTarget: ' + wrote + '件記入 / 列' + (jCol + 1));
}

// ===== カード評価 v1（相対評価・自動導出）：ソース3種 → card-eval.json =====
// card-stats(実数値)＋card-tags(役割タグ)＋card-potential(係数)から17項目を
// 全カード相対(パーセンタイル)で1-10算出。人の赤入れはソース側だけ＝完全自動導出。
function buildCardEvalV1() {
  try { fillAttackTarget(); } catch (e) { Logger.log('attackTarget skip: ' + e); } // 攻撃対象(空欄)を先に自動記入
  var stats = ghReadJson_('card-stats.json');
  var tagsJ = ghReadJson_('card-tags.json') || { cards: {} };
  var potJ  = ghReadJson_('card-potential.json') || { cards: {} };
  if (!stats || !stats.cards) throw new Error('card-stats.json が読めない');
  var TC = tagsJ.cards || {}, PC = potJ.cards || {};
  var SIEGE = { '迫撃砲': 1, '巨大クロスボウ': 1 };
  function mp(s){ return s==='◎'?9 : s==='○'?6 : s==='△'?3 : 0; }
  function spd(s){ if (typeof s==='number') return s; var m=String(s||'').match(/\(([0-9.]+)\)/); var n=num(m ? m[1] : s); return n || 60; }
  function num(v){ var n = parseFloat(v); return isFinite(n) ? n : 0; }
  function rangeNum(v){ if (typeof v === 'number') return v; var s = String(v || ''); var m = s.match(/\(([0-9.]+)\)/); return m ? num(m[1]) : num(s); }
  var cards = stats.cards.map(function (c) {
    var n = c.n || {}, arr = ((TC[c.jp]||{}).tags)||[], tset = {};
    for (var i=0;i<arr.length;i++) tset[arr[i]] = 1;
    var p = PC[c.jp] || {}, ph = p.phase || [];
    return { name:c.jp, type:n.type, cnt:n.count||1, cost:n.cost||1, speed:spd(n.speed), air:!!n.air, splash:!!n.splash,
      bld:n.type==='Building', siege:!!SIEGE[c.jp], hp:c.hp16||0, dps:c.dps16||0, dmg:c.dmg16||0, hitSpeed:num(n.hitSpeed), range:rangeNum(n.range), t:tset,
      hpEff:p.hpEff||0, dpsEff:p.dpsEff||0, spellEff:p.spellEff||0, towerEff:p.towerEff||0,
      solo:p.solo, ph1:mp(ph[0]), ph2:mp(ph[1]), ph3:mp(ph[2]) };
  });
  function H(c,k){ return !!c.t[k]; }
  function SP(c){ return c.type==='Spell'; }
  function cap(c,m){ return Math.min(c.dps,m); }
  function offGate(c){ return SP(c)?true : (c.bld&&!c.siege)?false : true; } // 攻撃系：防衛建物を除外（攻城は可）
  var RAWF = {
    'タンク処理': function(c){ return SP(c)? c.towerEff*0.4 : c.dps*(H(c,'tankKiller')?1.6:1)*(H(c,'ramp')?1.3:1)*((c.splash&&!H(c,'tankKiller'))?0.55:1); },
    '中型タンク処理': function(c){ return SP(c)? c.spellEff*0.5 : c.dps*(H(c,'tankKiller')?1.2:1)+c.hp*0.012; },
    '対空単体処理': function(c){ return (!SP(c)&&c.air)? c.dps*(H(c,'tankKiller')?1.4:1) : 0; },
    '地上群れ処理': function(c){ return SP(c)? c.spellEff*0.8 : (c.splash? cap(c,450)*Math.min(c.cnt,3) : 0); },
    '対空群れ処理': function(c){ return (!SP(c)&&c.air&&c.splash)? cap(c,450)*Math.min(c.cnt,3) : ((SP(c)&&H(c,'air'))? c.spellEff*0.8 : 0); },
    'エリクサーアドバンテージ': function(c){ return c.hpEff/150 + c.dpsEff/45 + (H(c,'collector')?6:0) + (H(c,'spawner')?4:0) + (H(c,'shield')?1:0); },
    '壁性能': function(c){ return SP(c)?0 : c.hp*(H(c,'tank')?1.4:(H(c,'minitank')?1.1:1))*(H(c,'shield')?1.2:1); },
    'タワーダメージ力': function(c){ return !offGate(c)?0 : (SP(c)? c.towerEff : c.dps*(H(c,'bridgeSpam')?1.4:1)*((H(c,'charge')||H(c,'dash'))?1.25:1)); },
    'タワーダメージ決定力': function(c){ return !offGate(c)?0 : (SP(c)? c.towerEff*1.6 : c.dps*((H(c,'invisible')||H(c,'dash'))?1.4:1)); },
    '施設破壊力': function(c){ return c.bld?0 : (SP(c)? c.towerEff*0.9 : c.dps*(H(c,'tgBuilding')?1.8:0.6)); },
    '施設突破力': function(c){ return (H(c,'charge')?3:0)+(H(c,'dash')?3:0)+(H(c,'bridgeSpam')?2:0)+(H(c,'tgBuilding')?2:0); },
    '呪文枯渇': function(c){ return (H(c,'spellBait')?5:0)+(H(c,'spawner')?3:0)+(H(c,'swarm')?2:0)+(H(c,'collector')?1:0); },
    '射程圧': function(c){ return SP(c)?0 : c.range * (c.air?1.25:1) + (c.siege?4:0) + (H(c,'bridgeSpam')?1.5:0); },
    '手数圧': function(c){ if (SP(c)) return 0; var hs = c.hitSpeed || 1.5; return (1 / Math.max(0.25, hs)) * (c.cnt || 1) * (c.splash?1.25:1) * 100; },
    'レイジ適性': function(c){ if (SP(c)) return H(c,'buff') ? 350 : 0; var rageDpsGain = c.dps * 0.30; var moveGain = c.bld ? 0 : c.speed * 0.30; var spawnFireGain = (c.bld || H(c,'spawner')) ? 180 : 0; return rageDpsGain + moveGain + spawnFireGain + (H(c,'ramp')?80:0); }
  };
  function pctMap(arr){ var a=arr.filter(function(x){return x.r>0;}).sort(function(x,y){return x.r-y.r;}); var nn=a.length, m={}; for(var i=0;i<nn;i++) m[a[i].n]= nn>1? i/(nn-1):1; return m; }
  var norm = {};
  Object.keys(RAWF).forEach(function(it){
    var useBlend = (it !== 'エリクサーアドバンテージ'); // 効率は生スコアと÷コストを半々で。エリクサーアドバンテージは既に効率なので二重回避
    var pr = pctMap(cards.map(function(c){ return { n:c.name, r:RAWF[it](c) }; }));
    var pe = useBlend ? pctMap(cards.map(function(c){ return { n:c.name, r:RAWF[it](c)/(c.cost||1) }; })) : null;
    norm[it] = function(c){ var r=RAWF[it](c); if(r<=0) return 0; var p = useBlend ? (0.5*(pr[c.name]||0)+0.5*(pe[c.name]||0)) : (pr[c.name]||0); return Math.round((1+9*p)*10)/10; };
  });
  var SPB=[306,426,588,1100,1690,2372];
  function spellRes(c){ if(SP(c))return 0; var s=0; for(var i=0;i<SPB.length;i++) if(c.hp>SPB[i])s++; return Math.round((1+9*s/SPB.length)*10)/10; }
  function direct(v){ return v? Math.round((1+9*v/9)*10)/10 : 0; }
  function soloPts(c){ var s=c.solo; if(typeof s==='number')return s; if(s==='◎')return 5; if(s==='○')return 3; if(s==='△')return 1; var f=parseFloat(s); return isFinite(f)?f:0; }
  // 素出し適正＝評価(1-5,◎○△は5/3/1)×2 ＋ 遅いほど＋(120-速度) ＋ 安いほど＋(7-コスト) を全カード相対化
  var soloPctM = pctMap(cards.map(function(c){ return { n:c.name, r: soloPts(c)*2 + (120-c.speed)/120*3 + (7-(c.cost||1))/6*3 }; }));
  function soloScore(c){ var p=soloPctM[c.name]; return p==null?0 : Math.round((1+9*p)*10)/10; }
  var ITEMS = Object.keys(RAWF).concat(['呪文耐性','素出し適正','序盤適性(エリクサー1倍)','中盤適性(エリクサー2倍)','中盤適性(エリクサー3倍)']);
  var out = {};
  cards.forEach(function(c){
    var row = {};
    Object.keys(RAWF).forEach(function(it){ row[it]=norm[it](c); });
    row['呪文耐性']=spellRes(c);
    row['素出し適正']=soloScore(c);
    row['序盤適性(エリクサー1倍)']=direct(c.ph1);
    row['中盤適性(エリクサー2倍)']=direct(c.ph2);
    row['中盤適性(エリクサー3倍)']=direct(c.ph3);
    out[c.name]=row;
  });
  // 項目名の解決：セル1行目が項目名で始まれば一致（説明文の追記・改行・行移動・空白行に強い）
  function resolveItem(raw){ var label=String(raw||'').split('\n')[0].trim(); if(!label) return null; for(var i=0;i<ITEMS.length;i++){ if(label.indexOf(ITEMS[i])===0) return ITEMS[i]; } return null; }
  // --- ① カード評価シートへ記入（行は名前で照合＝位置非依存／空白行・無関係行はスキップ）---
  var sid = prop('TAG_SHEET_ID', '1cjX3ptT0g0qjfwhoTBKbzRfXGZUNGLy_jspMSRCDPyU');
  var sh = SpreadsheetApp.openById(sid).getSheetByName('カード評価');
  if (!sh) {
    ghWriteJson_('card-eval.json', { updated: new Date().toISOString(), scale: '1-10', method: 'relative-percentile', items: ITEMS, count: Object.keys(out).length, cards: out });
    Logger.log('buildCardEvalV1: カード評価シート無し→outから直接JSON ' + Object.keys(out).length); return;
  }
  var FORMULA = {
    'タンク処理': 'card-stats:DPS16 ×(タグ:tankKiller→1.6/ramp→1.3/範囲のみ→0.55) →[生0.5＋÷コスト効率0.5]で全カード相対(1-10)',
    '中型タンク処理': 'card-stats:DPS16 ×(tankKiller→1.2) ＋ HP16×0.012 →[生0.5＋÷コスト効率0.5]相対',
    '対空単体処理': '攻撃対象=空/両方のみ: DPS16 ×(tankKiller→1.4) →[生0.5＋÷コスト効率0.5]相対',
    '地上群れ処理': '範囲攻撃なら DPS16(上限450)×体数(最大3)＋ダメージ呪文 →[生0.5＋÷コスト効率0.5]相対',
    '対空群れ処理': '対空＋範囲: DPS16(上限450)×体数 ＋空に効く呪文 →[生0.5＋÷コスト効率0.5]相対',
    'エリクサーアドバンテージ': 'ポテンシャル:HP効率/150＋DPS効率/45 ＋(エリクサー生成6/ユニット生成4/盾1) →相対(既に効率なのでブレンド無し)',
    '壁性能': 'card-stats:HP16 ×(タグ:タンク1.4/中型1.1)×(盾1.2) →[生0.5＋÷コスト効率0.5]相対',
    'タワーダメージ力': '防衛建物除外。呪文=呪文タワーダメ / ユニット=DPS16×(橋前1.4)(突進1.25) →[生0.5＋÷コスト効率0.5]相対',
    'タワーダメージ決定力': '呪文=呪文タワーダメ×1.6 / ユニット=DPS16×(透明・ダッシュ1.4) →[生0.5＋÷コスト効率0.5]相対',
    '施設破壊力': 'ユニット=DPS16×(建物狙い1.8/他0.6)、呪文=呪文タワーダメ×0.9、建物カードは0 →[生0.5＋÷コスト効率0.5]相対',
    '施設突破力': 'タグ:突進3＋ダッシュ3＋橋前2＋建物狙い2 →[生0.5＋÷コスト効率0.5]相対',
    '呪文耐性': 'card-stats:HP16が各呪文威力(ログ426/ザップ306/矢588/ファイボ1100/ライト1690/ロケ2372)を超える本数→1-10',
    '呪文枯渇': 'タグ:呪文釣り5＋ユニット生成3＋群れ2＋エリクサー生成1 →[生0.5＋÷コスト効率0.5]相対',
    '射程圧': 'card-stats:射程×(対空1.25)＋攻城4＋橋前1.5 →[生0.5＋÷コスト効率0.5]相対',
    '手数圧': 'card-stats:1/攻撃速度×体数×範囲補正。細かい攻撃・多体・範囲の処理価値 →[生0.5＋÷コスト効率0.5]相対',
    'レイジ適性': 'レイジ30%速度ブースト前提。DPS増分(×0.30)＋移動速度増分＋建物/生成/ランプ補正 →[生0.5＋÷コスト効率0.5]相対',
    '素出し適正': 'ポテンシャル:素出し適性(1-5,◎○△は5/3/1)×2 ＋遅いほど＋(120-移動速度) ＋安いほど＋(7-コスト) →全カード相対(1-10)',
    '序盤適性(エリクサー1倍)': 'ポテンシャル:1倍適性 ◎9/○6/△3 →1-10',
    '中盤適性(エリクサー2倍)': 'ポテンシャル:2倍適性 ◎9/○6/△3 →1-10',
    '中盤適性(エリクサー3倍)': 'ポテンシャル:3倍適性 ◎9/○6/△3 →1-10'
  };
  var vals = sh.getDataRange().getValues(), header = vals[0];
  // 列を分類：カード列(ヘッダーがカード名)と計算式列。位置非依存＝列を挿入しても壊れない。
  var cardCols = [], formulaCol = -1;
  for (var ci = 0; ci < header.length; ci++) {
    var h = String(header[ci] || '').trim();
    if (h === '計算式') { formulaCol = ci; continue; }
    var hb = h.replace(/[⚡👑]+$/, '');
    if (h && (out[h] || out[hb])) cardCols.push(ci);
  }
  var firstCard = cardCols.length ? cardCols[0] : -1, lastCard = cardCols.length ? cardCols[cardCols.length - 1] : -1, wrote = 0;
  for (var r = 1; r < vals.length; r++) {
    var key = resolveItem(vals[r][0]); if (!key) continue;
    if (formulaCol >= 0 && FORMULA[key]) sh.getRange(r + 1, formulaCol + 1).setValue(FORMULA[key]);
    if (firstCard >= 0) {
      var rowVals = [];
      for (var ci = firstCard; ci <= lastCard; ci++) {
        var cn = String(header[ci] || '').trim(), base = cn.replace(/[⚡👑]+$/, ''), sc = out[cn] || out[base];
        rowVals.push((cn && sc && sc[key] != null) ? sc[key] : '');
      }
      sh.getRange(r + 1, firstCard + 1, 1, rowVals.length).setValues([rowVals]);
    }
    wrote++;
  }
  SpreadsheetApp.flush();
  // --- ② シートを読み戻して card-eval.json 化（カード列のみ＝計算式列は除外）---
  var v2 = sh.getDataRange().getValues(), h2 = v2[0], jcards = {};
  for (var ci2 = 0; ci2 < h2.length; ci2++) { var cn2 = String(h2[ci2] || '').trim(), b2 = cn2.replace(/[⚡👑]+$/, ''); if (cn2 && cn2 !== '計算式' && (out[cn2] || out[b2])) jcards[cn2] = {}; }
  for (var r2 = 1; r2 < v2.length; r2++) {
    var key2 = resolveItem(v2[r2][0]); if (!key2) continue;
    for (var ci3 = 0; ci3 < h2.length; ci3++) { var cn3 = String(h2[ci3] || '').trim(); if (!jcards[cn3]) continue; var num = parseFloat(v2[r2][ci3]); jcards[cn3][key2] = isFinite(num) ? num : null; }
  }
  ghWriteJson_('card-eval.json', { updated: new Date().toISOString(), scale: '1-10', method: 'relative-percentile(sheet経由)', items: ITEMS, count: Object.keys(jcards).length, cards: jcards });
  Logger.log('buildCardEvalV1: カード列' + cardCols.length + ' / 記入' + wrote + '行 / JSON ' + Object.keys(jcards).length + '枚 / 計算式列' + (formulaCol + 1));
}

// ── 2026-06-20 追記: 公式カードIDの取得（サイトの「📋 コピー」= link.clashroyale.com/deck 用）。
//    既存の crGet / normSlug / SLUG2JP / ghWriteJson_ を再利用。読み取り＋card-ids.json書き出しのみ＝updateDecks等には非干渉。
//    手動で1回実行すればOK（新カード追加時に再実行）。CR_TOKEN は既存のスクリプトプロパティを使用。
function dumpCardIds() {
  var token = prop('CR_TOKEN');
  if (!token) throw new Error('CR_TOKEN 未設定');
  var data = crGet('/cards', token);              // { items:[{name,id,...}], supportItems:[...] }
  var items = (data.items || []);
  var ids = {};            // slug -> 公式数値ID
  var unmapped = [];       // APIにあるがSLUG2JPに無い（タワー兵/新カード等。要確認）
  for (var i = 0; i < items.length; i++) {
    var slug = normSlug(items[i].name);
    if (ids[slug] === undefined) ids[slug] = items[i].id;
    if (!SLUG2JP[slug]) unmapped.push(slug + '=' + items[i].id + ' (' + items[i].name + ')');
  }
  var missing = Object.keys(SLUG2JP).filter(function (s) { return ids[s] === undefined; });
  var payload = { updated: new Date().toISOString(), count: Object.keys(ids).length, ids: ids };
  try { ghWriteJson_('card-ids.json', payload); Logger.log('OK: card-ids.json を data ブランチに書き出しました (' + payload.count + '枚)'); }
  catch (e) { Logger.log('card-ids.json 書き出しスキップ: ' + e.message); }
  Logger.log('=== CARD_IDS_JSON (バックアップ用・必要ならコピペでも可) ===');
  Logger.log(JSON.stringify(payload));
  Logger.log('=== unmapped (SLUG2JPに無いAPIカード=タワー兵/新カード, 要確認) ===');
  Logger.log(JSON.stringify(unmapped));
  Logger.log('=== missing (SLUG2JPにあるがAPIに無いslug, 通常は空) ===');
  Logger.log(JSON.stringify(missing));
  return payload;
}
