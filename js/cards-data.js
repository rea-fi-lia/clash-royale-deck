/* =============================================================
 *  カードデータ（単一ソース）
 *  - CARDS: 全122枚の定義（index のビルダーが直接使用）
 *  - CARD_INFO / CARD_YOMI: CARDS から自動導出（decks などが使用）
 *  ★カードを追加・修正するときはこのファイルの CARDS だけを編集する
 * ============================================================= */

/* ★進化(-ev1)・英雄(-hero)画像のフォールバック（2026-08-03）
 * 新しい進化/英雄が実装された直後は配布リポジトリに画像がまだ無く404になる。
 * 各描画箇所にonerrorを書くと追加のたびに漏れるので、ここで一括して面倒を見る。
 *   xxx-hero-ev1.png → xxx-hero.png → xxx.png の順に降りていく。
 * キャプチャ段階で拾うのは、img の error はバブリングしないため。 */
document.addEventListener('error', function (e) {
  var el = e.target;
  if (!el || el.tagName !== 'IMG') return;
  var src = el.getAttribute('src') || '';
  var next = src.replace(/-ev1(\.png)$/, '$1');
  if (next === src) next = src.replace(/-hero(\.png)$/, '$1');
  if (next === src) return;                 // これ以上たどれない＝通常画像自体が無い
  if (el.dataset.imgFallbackDone === next) return; // 同じ差し替えの繰り返しを防ぐ
  el.dataset.imgFallbackDone = next;
  el.src = next;
}, true);
const CARDS = [
  // 1コスト
  {name:"スケルトン", yomi:"スケルトン スケ", evolved:true, imgEvolved:"https://cdn.royaleapi.com/static/img/cards/skeletons-ev1.png",           cost:1, type:"troop",    role:"サイクル・防衛", img:"https://cdn.royaleapi.com/static/img/cards/skeletons.png"},
  {name:"アイススピリット", yomi:"アイススピリット アイスピ アイス", evolved:true, imgEvolved:"https://cdn.royaleapi.com/static/img/cards/ice-spirit-ev1.png",      cost:1, type:"troop",    role:"凍結・サイクル", img:"https://cdn.royaleapi.com/static/img/cards/ice-spirit.png"},
  {name:"ファイアスピリット", yomi:"ファイアスピリット ファイスピ ファイア",    cost:1, type:"troop",    role:"小型処理・対空", img:"https://cdn.royaleapi.com/static/img/cards/fire-spirit.png"},
  {name:"エレクトロスピリット", yomi:"エレクトロスピリット エレスピ エレクトロ",  cost:1, type:"troop",    role:"チェーン感電・サイクル", img:"https://cdn.royaleapi.com/static/img/cards/electro-spirit.png"},
  {name:"ヒールスピリット", yomi:"ヒールスピリット ヒースピ ヒルスピ ヒール",      cost:1, type:"troop",    role:"回復サポート", img:"https://cdn.royaleapi.com/static/img/cards/heal-spirit.png"},

  // 2コスト
  {name:"ゴブリン", yomi:"ゴブリン ゴブ", hero:true, imgHero:"https://cdn.royaleapi.com/static/img/cards/goblins-hero.png",              cost:2, type:"troop",    role:"小型高DPS", img:"https://cdn.royaleapi.com/static/img/cards/goblins.png"},
  {name:"ボンバー", yomi:"ボンバー ボンバ", evolved:true, imgEvolved:"https://cdn.royaleapi.com/static/img/cards/bomber-ev1.png",              cost:2, type:"troop",    role:"範囲攻撃・防衛", img:"https://cdn.royaleapi.com/static/img/cards/bomber.png"},
  {name:"槍ゴブリン", yomi:"やりごぶりん やり ゴブ",            cost:2, type:"troop",    role:"対空・遠距離", img:"https://cdn.royaleapi.com/static/img/cards/spear-goblins.png"},
  {name:"コウモリの群れ", yomi:"コウモリの群れ コウモリ バット バツ", evolved:true, imgEvolved:"https://cdn.royaleapi.com/static/img/cards/bats-ev1.png",        cost:2, type:"troop",    role:"対空・サイクル", img:"https://cdn.royaleapi.com/static/img/cards/bats.png"},
  {name:"アイスゴーレム", yomi:"アイスゴーレム アイゴレ アイスゴレ", hero:true, imgHero:"https://cdn.royaleapi.com/static/img/cards/ice-golem-hero.png",        cost:2, type:"troop",    role:"タンク・デス凍結", img:"https://cdn.royaleapi.com/static/img/cards/ice-golem.png"},
  {name:"ウォールブレイカー", yomi:"ウォールブレイカー ウォールブレ ウォルブレ WB", evolved:true, imgEvolved:"https://cdn.royaleapi.com/static/img/cards/wall-breakers-ev1.png",    cost:2, type:"troop",    role:"建物狙い・サイクル", img:"https://cdn.royaleapi.com/static/img/cards/wall-breakers.png"},
  {name:"バーサーカー", yomi:"バーサーカー バーサカ",          cost:2, type:"troop",    role:"高速高DPS近接", img:"https://cdn.royaleapi.com/static/img/cards/berserker.png", hero:true, imgHero:"https://cdn.royaleapi.com/static/img/cards/berserker-hero.png"},
  {name:"ザップ", yomi:"ザップ", evolved:true, imgEvolved:"https://cdn.royaleapi.com/static/img/cards/zap-ev1.png",                cost:2, type:"spell",    role:"即時感電・リセット", img:"https://cdn.royaleapi.com/static/img/cards/zap.png"},
  {name:"巨大雪玉", yomi:"きょだいゆきだま ゆきだま 雪玉", evolved:true, imgEvolved:"https://cdn.royaleapi.com/static/img/cards/giant-snowball-ev1.png",              cost:2, type:"spell",    role:"ノックバック・減速", img:"https://cdn.royaleapi.com/static/img/cards/giant-snowball.png"},
  {name:"ローリングバーバリアン", yomi:"ローリングバーバリアン バーバレル ロリバーバ ロリババ", hero:true, imgHero:"https://cdn.royaleapi.com/static/img/cards/barbarian-barrel-hero.png", cost:2, type:"spell",    role:"転がし＋バーバリアン", img:"https://cdn.royaleapi.com/static/img/cards/barbarian-barrel.png"},
  {name:"ローリングウッド", yomi:"ローリングウッド ログ THE LOG",      cost:2, type:"spell",    role:"広範囲ローリング", img:"https://cdn.royaleapi.com/static/img/cards/the-log.png"},
  {name:"レイジ", yomi:"レイジ",                cost:2, type:"spell",    role:"速度・火力アップ", img:"https://cdn.royaleapi.com/static/img/cards/rage.png"},
  {name:"ステルスブッシュ", yomi:"ステルスブッシュ ブッシュ 茂み あやしいしげみ しげみ",  cost:2, type:"troop",    role:"茂みに隠れて潜伏", img:"https://cdn.royaleapi.com/static/img/cards/suspicious-bush.png"},
  {name:"ゴブリンの呪い", yomi:"ごぶりんののろい のろい カース ゴブカース",  cost:2, type:"spell",    role:"範囲呪い・倒すとゴブ化", img:"https://cdn.royaleapi.com/static/img/cards/goblin-curse.png"},

  // 3コスト
  {name:"ナイト", yomi:"ナイト", evolved:true, hero:true, imgEvolved:"https://cdn.royaleapi.com/static/img/cards/knight-ev1.png", imgHero:"https://cdn.royaleapi.com/static/img/cards/knight-hero.png",                cost:3, type:"troop",    role:"タンク・防衛", img:"https://cdn.royaleapi.com/static/img/cards/knight.png"},
  {name:"アーチャー", yomi:"アーチャー アチャ", evolved:true, imgEvolved:"https://cdn.royaleapi.com/static/img/cards/archers-ev1.png",            cost:3, type:"troop",    role:"対空・遠距離", img:"https://cdn.royaleapi.com/static/img/cards/archers.png"},
  {name:"ガーゴイル", yomi:"ガーゴイル ミニオン ガゴ",            cost:3, type:"troop",    role:"対空・高DPS", img:"https://cdn.royaleapi.com/static/img/cards/minions.png"},
  {name:"ゴブリンギャング", yomi:"ゴブリンギャング ゴブギャ ギャング",      cost:3, type:"troop",    role:"地上・対空mix", img:"https://cdn.royaleapi.com/static/img/cards/goblin-gang.png"},
  {name:"スケルトンバレル", yomi:"スケルトンバレル スケバレ", evolved:true, imgEvolved:"https://cdn.royaleapi.com/static/img/cards/skeleton-barrel-ev1.png",      cost:3, type:"troop",    role:"空中突撃・デス処理", img:"https://cdn.royaleapi.com/static/img/cards/skeleton-barrel.png"},
  {name:"ロケット砲士", yomi:"ロケット砲士 ロケホウ ロケコ ファイクラ ファイアクラッカー", evolved:true, imgEvolved:"https://cdn.royaleapi.com/static/img/cards/firecracker-ev1.png",          cost:3, type:"troop",    role:"遠距離・小型処理", img:"https://cdn.royaleapi.com/static/img/cards/firecracker.png"},
  {name:"メガガーゴイル", yomi:"メガガーゴイル メガゴ メガガゴ メガミニオン メガミニ", hero:true, imgHero:"https://cdn.royaleapi.com/static/img/cards/mega-minion-hero.png",        cost:3, type:"troop",    role:"対空高火力", img:"https://cdn.royaleapi.com/static/img/cards/mega-minion.png"},
  {name:"吹き矢ゴブリン", yomi:"ふきやごぶりん ふきや ダートゴブ ダーゴブ", evolved:true, imgEvolved:"https://cdn.royaleapi.com/static/img/cards/dart-goblin-ev1.png",        cost:3, type:"troop",    role:"超長射程・速射", img:"https://cdn.royaleapi.com/static/img/cards/dart-goblin.png"},
  {name:"エリクサーゴーレム", yomi:"エリクサーゴーレム エリゴレ",    cost:3, type:"troop",    role:"タンク・敵にエリ付与", img:"https://cdn.royaleapi.com/static/img/cards/elixir-golem.png"},
  {name:"アイスウィザード", yomi:"アイスウィザード アイウィザ アイスウィズ",      cost:3, type:"troop",    role:"全体減速", img:"https://cdn.royaleapi.com/static/img/cards/ice-wizard.png"},
  {name:"プリンセス", yomi:"ぷりんせす プリセス", evolved:true, imgEvolved:"https://cdn.royaleapi.com/static/img/cards/princess-ev1.png",            cost:3, type:"troop",    role:"超長射程・範囲", img:"https://cdn.royaleapi.com/static/img/cards/princess.png"},
  {name:"ディガー", yomi:"ディガー マイナー",              cost:3, type:"troop",    role:"建物狙い奇襲", img:"https://cdn.royaleapi.com/static/img/cards/miner.png"},
  {name:"スケルトン部隊", yomi:"スケルトン部隊 スケブ スケ部 スケアミ スケルトンアーミー", evolved:true, imgEvolved:"https://cdn.royaleapi.com/static/img/cards/skeleton-army-ev1.png",        cost:3, type:"troop",    role:"防衛・大量展開", img:"https://cdn.royaleapi.com/static/img/cards/skeleton-army.png"},
  {name:"盾の戦士", yomi:"たてのせんし たて ガーズ",              cost:3, type:"troop",    role:"盾持ち防衛", img:"https://cdn.royaleapi.com/static/img/cards/guards.png"},
  {name:"アサシン ユーノ", yomi:"アサシンユーノ ユーノ バンディット",       cost:3, type:"troop",    role:"ダッシュ高火力", img:"https://cdn.royaleapi.com/static/img/cards/bandit.png"},
  {name:"漁師トリトン", yomi:"りょうしとりとん トリトン フィッシャーマン フィッシャ",          cost:3, type:"troop",    role:"引き寄せ・妨害", img:"https://cdn.royaleapi.com/static/img/cards/fisherman.png"},
  {name:"ロイヤルゴースト", yomi:"ロイヤルゴースト ロイゴ", evolved:true, imgEvolved:"https://cdn.royaleapi.com/static/img/cards/royal-ghost-ev1.png",      cost:3, type:"troop",    role:"透明・奇襲", img:"https://cdn.royaleapi.com/static/img/cards/royal-ghost.png"},
  {name:"矢の雨", yomi:"やのあめ アロー 矢",                cost:3, type:"spell",    role:"範囲・対空", img:"https://cdn.royaleapi.com/static/img/cards/arrows.png"},
  {name:"トルネード", yomi:"トルネード トルネ",            cost:3, type:"spell",    role:"引き寄せ・集中", img:"https://cdn.royaleapi.com/static/img/cards/tornado.png"},
  {name:"アースクエイク", yomi:"アースクエイク 地震 じしん",        cost:3, type:"spell",    role:"建物特効ダメージ", img:"https://cdn.royaleapi.com/static/img/cards/earthquake.png"},
  {name:"ロイヤルデリバリー", yomi:"ろいやるでりばりー",    cost:3, type:"spell",    role:"範囲＋兵士展開", img:"https://cdn.royaleapi.com/static/img/cards/royal-delivery.png"},
  {name:"ゴブリンバレル", yomi:"ゴブリンバレル ゴブバレ", evolved:true, imgEvolved:"https://cdn.royaleapi.com/static/img/cards/goblin-barrel-ev1.png",        cost:3, type:"spell",    role:"奇襲ゴブリン3体", img:"https://cdn.royaleapi.com/static/img/cards/goblin-barrel.png"},
  {name:"クローン", yomi:"クローン",              cost:3, type:"spell",    role:"ユニット複製", img:"https://cdn.royaleapi.com/static/img/cards/clone.png"},
  {name:"ヴァイン", yomi:"ヴァイン バイン ツタ つた",              cost:3, type:"spell",    role:"高HP3体を拘束・空→地", img:"https://cdn.royaleapi.com/static/img/cards/vines.png"},
  {name:"ボイド", yomi:"ボイド ぼいど",              cost:3, type:"spell",    role:"少数ほど高ダメージ", img:"https://cdn.royaleapi.com/static/img/cards/void.png"},
  {name:"ミラー", yomi:"ミラー みらー",              cost:1, type:"spell",    role:"直前カードを+1コスで複製", img:"https://cdn.royaleapi.com/static/img/cards/mirror.png"},
  {name:"大砲", yomi:"おおづつ たいほう 大砲 キャノン", evolved:true, imgEvolved:"https://cdn.royaleapi.com/static/img/cards/cannon-ev1.png",                  cost:3, type:"building", role:"単体遠距離防衛", img:"https://cdn.royaleapi.com/static/img/cards/cannon.png"},
  {name:"墓石", yomi:"はかいし ぼせき はか いし トゥームストーン", hero:true, imgHero:"https://cdn.royaleapi.com/static/img/cards/tombstone-hero.png",                  cost:3, type:"building", role:"スケルトン生成", img:"https://cdn.royaleapi.com/static/img/cards/tombstone.png"},

  // 4コスト
  {name:"バルキリー", yomi:"バルキリー バルキ バルキリ", evolved:true, hero:true, imgEvolved:"https://cdn.royaleapi.com/static/img/cards/valkyrie-ev1.png", imgHero:"https://cdn.royaleapi.com/static/img/cards/valkyrie-hero.png",            cost:4, type:"troop",    role:"範囲防衛・タンク", img:"https://cdn.royaleapi.com/static/img/cards/valkyrie.png"},
  {name:"マスケット銃士", evolved:true, imgEvolved:"https://cdn.royaleapi.com/static/img/cards/musketeer-ev1.png", yomi:"マスケット銃士 マスケ", hero:true, imgHero:"https://cdn.royaleapi.com/static/img/cards/musketeer-hero.png",        cost:4, type:"troop",    role:"遠距離高火力", img:"https://cdn.royaleapi.com/static/img/cards/musketeer.png"},
  {name:"ミニペッカ", yomi:"ミニペッカ ミニペ", hero:true, imgHero:"https://cdn.royaleapi.com/static/img/cards/mini-pekka-hero.png",            cost:4, type:"troop",    role:"単体超高DPS", img:"https://cdn.royaleapi.com/static/img/cards/mini-pekka.png"},
  {name:"ホグライダー", yomi:"ホグライダー ホグ",          cost:4, type:"troop",    role:"建物狙い突撃", img:"https://cdn.royaleapi.com/static/img/cards/hog-rider.png"},
  {name:"攻城バーバリアン", yomi:"こうじょうばーばりあん 攻城 攻城バーバリアン バトルラム", evolved:true, imgEvolved:"https://cdn.royaleapi.com/static/img/cards/battle-ram-ev1.png",      cost:4, type:"troop",    role:"建物狙い＋バーバリアン", img:"https://cdn.royaleapi.com/static/img/cards/battle-ram.png"},
  {name:"スケルトンドラゴン", yomi:"スケルトンドラゴン スケドラ",    cost:4, type:"troop",    role:"対空範囲", img:"https://cdn.royaleapi.com/static/img/cards/skeleton-dragons.png"},
  {name:"ザッピー", yomi:"ザッピー ザピ",              cost:4, type:"troop",    role:"感電・防衛", img:"https://cdn.royaleapi.com/static/img/cards/zappies.png"},
  {name:"ホバリング砲", yomi:"ホバリング砲 ホバリング フライングマシン フラマシ",          cost:4, type:"troop",    role:"対空・超長射程", img:"https://cdn.royaleapi.com/static/img/cards/flying-machine.png"},
  {name:"バトルヒーラー", yomi:"バトルヒーラー ヒーラー バトヒ",        cost:4, type:"troop",    role:"HP回復タンク", img:"https://cdn.royaleapi.com/static/img/cards/battle-healer.png"},
  {name:"ダイナマイトゴブリン", yomi:"ダイナマイトゴブリン ゴブデモ デモリッシャー",cost:4, type:"troop",    role:"建物狙い・デス爆発", img:"https://cdn.royaleapi.com/static/img/cards/goblin-demolisher.png"},
  {name:"ダークプリンス", yomi:"ダークプリンス ダクプリ DP",        cost:4, type:"troop",    role:"盾＋範囲チャージ", hero:true, imgHero:"https://cdn.royaleapi.com/static/img/cards/dark-prince-hero.png", img:"https://cdn.royaleapi.com/static/img/cards/dark-prince.png"},
  {name:"ハンター", yomi:"ハンター", evolved:true, imgEvolved:"https://cdn.royaleapi.com/static/img/cards/hunter-ev1.png",              cost:4, type:"troop",    role:"近距離超高火力", img:"https://cdn.royaleapi.com/static/img/cards/hunter.png"},
  {name:"ベビードラゴン", yomi:"ベビードラゴン ベビドラ ベビー", evolved:true, imgEvolved:"https://cdn.royaleapi.com/static/img/cards/baby-dragon-ev1.png",        cost:4, type:"troop",    role:"対空範囲", img:"https://cdn.royaleapi.com/static/img/cards/baby-dragon.png"},
  {name:"エレクトロウィザード", yomi:"エレクトロウィザード エレウィザ エレウィズ EW",  cost:4, type:"troop",    role:"感電・リセット", img:"https://cdn.royaleapi.com/static/img/cards/electro-wizard.png"},
  {name:"インフェルノドラゴン", yomi:"インフェルノドラゴン インドラ", evolved:true, imgEvolved:"https://cdn.royaleapi.com/static/img/cards/inferno-dragon-ev1.png",  cost:4, type:"troop",    role:"単体集中加熱", img:"https://cdn.royaleapi.com/static/img/cards/inferno-dragon.png"},
  {name:"ランバージャック", yomi:"ランバージャック ランバー ランバジャ", evolved:true, imgEvolved:"https://cdn.royaleapi.com/static/img/cards/lumberjack-ev1.png",      cost:4, type:"troop",    role:"高速＋デスレイジ", img:"https://cdn.royaleapi.com/static/img/cards/lumberjack.png"},
  {name:"マジックアーチャー", yomi:"マジックアーチャー マジアチャ MA", hero:true, imgHero:"https://cdn.royaleapi.com/static/img/cards/magic-archer-hero.png",    cost:4, type:"troop",    role:"超射程貫通", img:"https://cdn.royaleapi.com/static/img/cards/magic-archer.png"},
  {name:"マザーネクロマンサー", yomi:"マザーネクロマンサー マザネク マザー",  cost:4, type:"troop",    role:"呪い→ホグ変換", img:"https://cdn.royaleapi.com/static/img/cards/mother-witch.png"},
  {name:"ダークネクロ", yomi:"ダークネクロ ダクネ ナイトウィッチ ナイウィチ",          cost:4, type:"troop",    role:"コウモリ生成", img:"https://cdn.royaleapi.com/static/img/cards/night-witch.png"},
  {name:"ゴールドナイト", champion:true, yomi:"ゴールドナイト ゴルナイ GK",        cost:4, type:"troop",    role:"チャンピオン", img:"https://cdn.royaleapi.com/static/img/cards/golden-knight.png"},
  {name:"スケルトンキング", champion:true, yomi:"スケルトンキング スケキン SK",      cost:4, type:"troop",    role:"チャンピオン", img:"https://cdn.royaleapi.com/static/img/cards/skeleton-king.png"},
  {name:"マイティディガー", champion:true, yomi:"マイティディガー マイディガ MD",      cost:4, type:"troop",    role:"チャンピオン", img:"https://cdn.royaleapi.com/static/img/cards/mighty-miner.png"},
  {name:"フェニックス", yomi:"フェニックス フェニ",          cost:4, type:"troop",    role:"再生・対空", img:"https://cdn.royaleapi.com/static/img/cards/phoenix.png"},
  {name:"鍛冶屋ジャイアント", yomi:"かじやじゃいあんと かじジャイ ルーンジャイアント",  cost:4, type:"troop",    role:"味方2体にバフ付与", img:"https://cdn.royaleapi.com/static/img/cards/rune-giant.png"},
  {name:"ファイアボール", yomi:"ファイアボール ファイボ FB",        cost:4, type:"spell",    role:"中範囲高火力", img:"https://cdn.royaleapi.com/static/img/cards/fireball.png"},
  {name:"フリーズ", yomi:"フリーズ",              cost:4, type:"spell",    role:"全停止", img:"https://cdn.royaleapi.com/static/img/cards/freeze.png"},
  {name:"ポイズン", yomi:"ポイズン ポイズ",              cost:4, type:"spell",    role:"持続ダメージ", img:"https://cdn.royaleapi.com/static/img/cards/poison.png"},
  {name:"ゴブリンの檻", yomi:"ごぶりんのおり ゴブオリ おり ケージ", evolved:true, imgEvolved:"https://cdn.royaleapi.com/static/img/cards/goblin-cage-ev1.png",          cost:4, type:"building", role:"処理後ブロウラー生成", img:"https://cdn.royaleapi.com/static/img/cards/goblin-cage.png"},
  {name:"ゴブリンドリル", yomi:"ゴブリンドリル ゴブドリ ドリル", evolved:true, imgEvolved:"https://cdn.royaleapi.com/static/img/cards/goblin-drill-ev1.png",        cost:4, type:"building", role:"地中攻撃", img:"https://cdn.royaleapi.com/static/img/cards/goblin-drill.png"},
  {name:"ゴブリンの小屋", yomi:"ごぶりんのこや ゴブゴヤ ゴブコヤ ゴブ小屋 ゴブこや ハット",        cost:4, type:"building", role:"槍ゴブリン生成", img:"https://cdn.royaleapi.com/static/img/cards/goblin-hut.png"},
  {name:"ボムタワー", yomi:"ボムタワー ボムタワ",            cost:4, type:"building", role:"範囲防衛", img:"https://cdn.royaleapi.com/static/img/cards/bomb-tower.png"},
  {name:"テスラ", yomi:"テスラ", evolved:true, imgEvolved:"https://cdn.royaleapi.com/static/img/cards/tesla-ev1.png",                cost:4, type:"building", role:"感電防衛", img:"https://cdn.royaleapi.com/static/img/cards/tesla.png"},
  {name:"迫撃砲", yomi:"はくげきほう 迫撃 モーター モルタル", evolved:true, imgEvolved:"https://cdn.royaleapi.com/static/img/cards/mortar-ev1.png",                cost:4, type:"building", role:"超長射程建物狙い", img:"https://cdn.royaleapi.com/static/img/cards/mortar.png"},
  {name:"オーブン", yomi:"オーブン かまど 炉", evolved:true, imgEvolved:"https://cdn.royaleapi.com/static/img/cards/furnace-ev1.png",              cost:4, type:"building", role:"ファイアスピリット生成", img:"https://cdn.royaleapi.com/static/img/cards/furnace.png"},

  // 5コスト
  {name:"バーバリアン", yomi:"バーバリアン ババ バーバリアン", evolved:true, imgEvolved:"https://cdn.royaleapi.com/static/img/cards/barbarians-ev1.png",          cost:5, type:"troop",    role:"高体力集団", img:"https://cdn.royaleapi.com/static/img/cards/barbarians.png"},
  {name:"ガーゴイルの群れ", yomi:"ガーゴイルの群れ ガゴムレ ガゴ群れ ミニオンホード", evolved:true, imgEvolved:"https://cdn.royaleapi.com/static/img/cards/minion-horde-ev1.png",      cost:5, type:"troop",    role:"大量対空", img:"https://cdn.royaleapi.com/static/img/cards/minion-horde.png"},
  {name:"ジャイアント", yomi:"ジャイアント ジャイ", hero:true, imgHero:"https://cdn.royaleapi.com/static/img/cards/giant-hero.png",          cost:5, type:"troop",    role:"建物狙いタンク", img:"https://cdn.royaleapi.com/static/img/cards/giant.png"},
  {name:"ウィザード", evolved:true, imgEvolved:"https://cdn.royaleapi.com/static/img/cards/wizard-ev1.png", yomi:"ウィザード ウィズ", hero:true, imgHero:"https://cdn.royaleapi.com/static/img/cards/wizard-hero.png",            cost:5, type:"troop",    role:"範囲スプラッシュ", img:"https://cdn.royaleapi.com/static/img/cards/wizard.png"},
  {name:"エアバルーン", yomi:"エアバルーン バルーン", hero:true, imgHero:"https://cdn.royaleapi.com/static/img/cards/balloon-hero.png",          cost:5, type:"troop",    role:"建物狙い爆撃", img:"https://cdn.royaleapi.com/static/img/cards/balloon.png"},
  {name:"ネクロマンサー", yomi:"ネクロマンサー ネクロ ウィッチ", evolved:true, imgEvolved:"https://cdn.royaleapi.com/static/img/cards/witch-ev1.png",        cost:5, type:"troop",    role:"スケルトン生成＋範囲", img:"https://cdn.royaleapi.com/static/img/cards/witch.png"},
  {name:"ボウラー", yomi:"ボウラー", hero:true, imgHero:"https://cdn.royaleapi.com/static/img/cards/bowler-hero.png",              cost:5, type:"troop",    role:"貫通プッシュ", img:"https://cdn.royaleapi.com/static/img/cards/bowler.png"},
  {name:"執行人ファルチェ", yomi:"しっこうにんふぁるちぇ ファルチェ エクスキュ エグゼ", evolved:true, imgEvolved:"https://cdn.royaleapi.com/static/img/cards/executioner-ev1.png",      cost:5, type:"troop",    role:"貫通往復斧", img:"https://cdn.royaleapi.com/static/img/cards/executioner.png"},
  {name:"60式ムート", yomi:"60式ムート ムート キャノンカート",            cost:5, type:"troop",    role:"遠距離＋盾", img:"https://cdn.royaleapi.com/static/img/cards/cannon-cart.png"},
  {name:"ロイヤルホグ", yomi:"ロイヤルホグ ロイホグ", evolved:true, imgEvolved:"https://cdn.royaleapi.com/static/img/cards/royal-hogs-ev1.png",          cost:5, type:"troop",    role:"建物狙い4体", img:"https://cdn.royaleapi.com/static/img/cards/royal-hogs.png"},
  {name:"アウトロー", yomi:"アウトロー ラスカルズ",            cost:5, type:"troop",    role:"地空混合群", img:"https://cdn.royaleapi.com/static/img/cards/rascals.png"},
  {name:"ライトニングドラゴン", yomi:"ライトニングドラゴン ライドラ エレドラ 電気ドラゴン", evolved:true, imgEvolved:"https://cdn.royaleapi.com/static/img/cards/electro-dragon-ev1.png",  cost:5, type:"troop",    role:"チェーン感電", img:"https://cdn.royaleapi.com/static/img/cards/electro-dragon.png"},
  {name:"プリンス", yomi:"プリンス",              cost:5, type:"troop",    role:"チャージ高火力", img:"https://cdn.royaleapi.com/static/img/cards/prince.png"},
  {name:"ラムライダー", yomi:"ラムライダー ラム",          cost:5, type:"troop",    role:"建物狙い＋スネア", img:"https://cdn.royaleapi.com/static/img/cards/ram-rider.png"},
  {name:"リトルプリンス", champion:true, yomi:"リトルプリンス リトプリ LP", cost:3, type:"troop", role:"チャンピオン・盾持ち", img:"https://cdn.royaleapi.com/static/img/cards/little-prince.png"},
  {name:"モンク", champion:true, yomi:"モンク もんく", cost:5, type:"troop", role:"チャンピオン・攻防一体", img:"https://cdn.royaleapi.com/static/img/cards/monk.png"},
  {name:"ゴブリンシュタイン", champion:true, yomi:"ゴブリンシュタイン ゴブリンスタイン ゴブシュタ", cost:5, type:"troop", role:"チャンピオン・博士＋モンスター", img:"https://cdn.royaleapi.com/static/img/cards/goblinstein.png"},
  {name:"ボスアサシン", champion:true, yomi:"ボスアサシン ボスバンディット ボスバン", cost:6, type:"troop", role:"チャンピオン", img:"https://cdn.royaleapi.com/static/img/cards/boss-bandit.png"},
  {name:"アーチャークイーン", champion:true, yomi:"アーチャークイーン AQ アチャクイ クイーン",    cost:5, type:"troop",    role:"チャンピオン・高火力", img:"https://cdn.royaleapi.com/static/img/cards/archer-queen.png"},
  {name:"ゴブリンマシン", yomi:"ゴブリンマシン ゴブマシン マシン",    cost:5, type:"troop",    role:"ロケット移動砲台", img:"https://cdn.royaleapi.com/static/img/cards/goblin-machine.png"},
  {name:"ローニン", displayName:"浪人スサノオ", yomi:"ローニン ろーにん 浪人 スサノオ 浪人スサノオ Susanoo Susano Ronin",    cost:5, type:"troop",    role:"受け流し近接反撃アタッカー", img:"https://cdn.royaleapi.com/static/img/cards/ronin.png"},
  {name:"スケルトンラッシュ", yomi:"スケルトンラッシュ スケラ グレイブヤード グレヤ 墓場",    cost:5, type:"spell",    role:"スケルトン大量召喚", img:"https://cdn.royaleapi.com/static/img/cards/graveyard.png"},
  {name:"インフェルノタワー", yomi:"インフェルノタワー インタワ IT",    cost:5, type:"building", role:"単体集中加熱", img:"https://cdn.royaleapi.com/static/img/cards/inferno-tower.png"},

  // 6コスト
  {name:"ロイヤルジャイアント", yomi:"ロイヤルジャイアント ロイジャイ RG", evolved:true, imgEvolved:"https://cdn.royaleapi.com/static/img/cards/royal-giant-ev1.png",  cost:6, type:"troop",    role:"建物狙い超射程", img:"https://cdn.royaleapi.com/static/img/cards/royal-giant.png"},
  {name:"エリートバーバリアン", yomi:"エリートバーバリアン エリババ EB",  cost:6, type:"troop",    role:"高速高火力2体", img:"https://cdn.royaleapi.com/static/img/cards/elite-barbarians.png", evolved:true, imgEvolved:"https://cdn.royaleapi.com/static/img/cards/elite-barbarians-ev1.png"},
  {name:"巨大スケルトン", yomi:"きょだいすけるとん キョスケ ジャイスケ 巨大スケルトン",        cost:6, type:"troop",    role:"タンク＋デス爆弾", img:"https://cdn.royaleapi.com/static/img/cards/giant-skeleton.png"},
  {name:"ゴブジャイアント", yomi:"ゴブジャイアント ゴブジャイ", evolved:true, imgEvolved:"https://cdn.royaleapi.com/static/img/cards/goblin-giant-ev1.png",      cost:6, type:"troop",    role:"タンク＋槍ゴブリン", img:"https://cdn.royaleapi.com/static/img/cards/goblin-giant.png"},
  {name:"スパーキー", yomi:"スパーキー スパキ",            cost:6, type:"troop",    role:"蓄電超高火力", img:"https://cdn.royaleapi.com/static/img/cards/sparky.png"},
  {name:"スピリットエンプレス", yomi:"スピリットエンプレス エンプレス せいれい",            cost:6, type:"troop",    role:"3コス陸/6コス空の二形態", img:"https://cdn.royaleapi.com/static/img/cards/spirit-empress.png"},
  {name:"ロケット", yomi:"ロケット",              cost:6, type:"spell",    role:"超高火力単発", img:"https://cdn.royaleapi.com/static/img/cards/rocket.png"},
  {name:"ライトニング", yomi:"ライトニング 雷",          cost:6, type:"spell",    role:"3体感電高火力", img:"https://cdn.royaleapi.com/static/img/cards/lightning.png"},
  {name:"エリクサーポンプ", yomi:"えりくさーぽんぷ ポンプ エリポン",      cost:6, type:"building", role:"エリクサー生成", img:"https://cdn.royaleapi.com/static/img/cards/elixir-collector.png"},
  {name:"バーバリアンの小屋", yomi:"ばーばりあんのこや ババこや バーバハット",    cost:6, type:"building", role:"バーバリアン生成", img:"https://cdn.royaleapi.com/static/img/cards/barbarian-hut.png"},
  {name:"巨大クロスボウ", yomi:"きょだいくろすぼう Xボウ クロスボウ",        cost:6, type:"building", role:"超長射程建物狙い", img:"https://cdn.royaleapi.com/static/img/cards/x-bow.png"},

  // 7コスト
  {name:"ペッカ", yomi:"ペッカ PEKKA", evolved:true, imgEvolved:"https://cdn.royaleapi.com/static/img/cards/pekka-ev1.png",                cost:7, type:"troop",    role:"単体超高DPS", img:"https://cdn.royaleapi.com/static/img/cards/pekka.png"},
  {name:"ラヴァハウンド", yomi:"ラヴァハウンド ラヴァ ラバ",        cost:7, type:"troop",    role:"空中タンク", img:"https://cdn.royaleapi.com/static/img/cards/lava-hound.png"},
  {name:"エレクトロジャイアント", yomi:"エレクトロジャイアント エレジャイ EG",cost:7, type:"troop",    role:"感電反射タンク", img:"https://cdn.royaleapi.com/static/img/cards/electro-giant.png"},
  {name:"メガナイト", yomi:"メガナイト メガナイ MK", evolved:true, imgEvolved:"https://cdn.royaleapi.com/static/img/cards/mega-knight-ev1.png",            cost:7, type:"troop",    role:"スポーン＋ジャンプ範囲", img:"https://cdn.royaleapi.com/static/img/cards/mega-knight.png"},
  {name:"見習い親衛隊", yomi:"みならいしんえいたい 親衛隊 ロイリク リクルート", evolved:true, imgEvolved:"https://cdn.royaleapi.com/static/img/cards/royal-recruits-ev1.png",          cost:7, type:"troop",    role:"壁役6体", img:"https://cdn.royaleapi.com/static/img/cards/royal-recruits.png"},

  // 8・9コスト
  {name:"ゴーレム", yomi:"ゴーレム ゴレ",              cost:8, type:"troop",    role:"最大タンク", img:"https://cdn.royaleapi.com/static/img/cards/golem.png"},
  {name:"三銃士", yomi:"さんじゅうし 三銃士 スリーマスケット",                cost:9, type:"troop",    role:"超高火力3体", img:"https://cdn.royaleapi.com/static/img/cards/three-musketeers.png"},
];

// ---- 以下は自動導出（編集不要） ----
const CARD_INFO = Object.fromEntries(CARDS.map(c => [c.name, {
  c: c.cost, i: c.img || '', iv: c.imgEvolved || '', ih: c.imgHero || '',
  e: !!c.evolved, h: !!c.hero, ch: !!c.champion
}]));
const CARD_YOMI = Object.fromEntries(CARDS.map(c => [c.name, c.yomi || '']));

/* ══════ カード画像の解決は「ここだけ」に書く（全ページ共通の正本） ══════
 * ★2026-08-11に確立したルール。
 *   それまで <img> を出す箇所が js/ 全体に22か所あり、4通りの独自ルールで
 *   画像を決めていた。そのため「1か所直しても全体に効かない」状態で、
 *   ランキングやカード検索が形態（進化/英雄）を無視して通常画像を出していた。
 *
 * 【鉄則】新しく <img> を書くときは必ず cardImageSrc() を通す。
 *         CARD_INFO の .i / .iv / .ih や CARDS の .img / .imgEvolved / .imgHero を
 *         描画側から直接読んではいけない。
 *         違反は `node tools/check-card-images.js` が検出して落とす（CIで毎回走る）。
 *
 * name : "ナイト" でも "ナイト⚡" / "ナイト👑" でも可（末尾の記号から形態を読む）
 * form : 'e'|'evolved'|'⚡' ／ 'h'|'hero'|'👑' ／ 'n'|'normal'／未指定
 *        指定が name の記号と食い違う場合は form を優先する。
 * ★存在しない形態を要求されたら通常画像へ落とす。バッジ（⚡/👑）も cardFormMark() が
 *   同じ判定を使うので、「⚡が付いているのに絵は通常」という食い違いが起きない。 */
function cardBaseName(name) { return String(name == null ? '' : name).replace(/[⚡👑]+$/, ''); }
function cardFormOf(name, form) {
  var f = form == null ? '' : String(form);
  if (!f) { var s = String(name || '').slice(cardBaseName(name).length); f = s; }
  if (f === 'e' || f === 'evolved' || f === '⚡') return 'e';
  if (f === 'h' || f === 'hero' || f === '👑') return 'h';
  return 'n';
}
function cardHasForm(name, form) {
  var info = CARD_INFO[cardBaseName(name)];
  if (!info) return false;
  var f = cardFormOf(name, form);
  return f === 'e' ? !!info.iv : f === 'h' ? !!info.ih : true;
}
function cardImageSrc(name, form) {
  var base = cardBaseName(name);
  var info = CARD_INFO[base];
  if (!info) return '';
  var f = cardFormOf(name, form);
  if (f === 'e' && info.iv) return info.iv;
  if (f === 'h' && info.ih) return info.ih;
  return info.i || '';
}
// 実際に表示される形態（存在しない形態を要求されたら 'n' に落ちる）
function cardShownForm(name, form) { return cardHasForm(name, form) ? cardFormOf(name, form) : 'n'; }
function cardFormMark(name, form) { var f = cardShownForm(name, form); return f === 'e' ? '⚡' : f === 'h' ? '👑' : ''; }
// <img> タグごと作る。alt と loading を書き忘れないための入口。
function cardImgTag(name, form, opt) {
  var src = cardImageSrc(name, form);
  if (!src) return '';
  var o = opt || {};
  return '<img' + (o.cls ? ' class="' + o.cls + '"' : '') + ' src="' + src + '" alt="' +
    String(o.alt != null ? o.alt : cardBaseName(name)).replace(/"/g, '&quot;') + '"' +
    (o.eager ? '' : ' loading="lazy"') + '>';
}

// ---- カード画像の読み込み失敗フォールバック（全ページ共通・全描画箇所に自動適用） ----
//  「?」表示の対策：cdn.royaleapi ⇄ raw.githubusercontent を相互フォールバック。
//  各<img>にonerrorを書かずとも、captureフェーズで画像のerrorを一括補足して別ホストへ再試行する。
//
//  ★2026-08-04：カード画像の主たる配布元を CDN(cdn.royaleapi.com/static/img/cards/) に一本化した。
//    理由＝GitHubの cr-api-assets は最終更新2026-03-05で停止しており、新しい進化/英雄の画像が入らない。
//    実測：全178枚（通常122/進化41/英雄15）のうち、GitHub側は8枚が404だがCDNは178枚すべて200。
//    解像度も同じ302px。よってCDNが完全な上位互換。GitHub側は非常用の第2候補として残す。
(function () {
  if (typeof document === 'undefined' || window.__crImgFallback) return;
  window.__crImgFallback = true;
  var RAW = 'https://raw.githubusercontent.com/RoyaleAPI/cr-api-assets/master/cards/';
  var CDN = 'https://cdn.royaleapi.com/static/img/cards/';
  function slugOf(src) {
    var m = String(src || '').match(/\/([a-z0-9-]+)\.png(?:\?.*)?$/i);
    return m ? m[1] : '';
  }
  function onErr(img) {
    if (!img || img.tagName !== 'IMG') return;
    var src = img.currentSrc || img.src || '';
    if (!/cr-api-assets|royaleapi/.test(src)) return; // カード画像以外は触らない
    var step = +(img.getAttribute('data-imgfb') || 0);
    var slug = slugOf(src);
    if (!slug) return;
    if (step === 0) {
      img.setAttribute('data-imgfb', '1');
      // 今のホストの逆へ切り替え
      img.src = /raw\.githubusercontent/.test(src) ? (CDN + slug + '.png') : (RAW + slug + '.png');
    } else if (step === 1) {
      img.setAttribute('data-imgfb', '2');
      // 進化/ヒーロー(-ev1/-hero)が無い場合に備え、ベース画像へ落とす
      var base = slug.replace(/-(ev1|ev2|hero)$/i, '');
      if (base !== slug) { img.src = RAW + base + '.png'; }
      else { img.style.visibility = 'hidden'; } // それでも無ければ?枠を隠す
    } else {
      img.style.visibility = 'hidden';
    }
  }
  document.addEventListener('error', function (e) {
    var t = e && e.target;
    if (t && t.tagName === 'IMG') onErr(t);
  }, true); // capture＝img単位のerrorを拾う
})();
