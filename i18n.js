/* =============================================================
 *  CR Deck Builders – 多言語化(i18n)
 *  方針：HTMLは書き換えず、DOMの日本語テキスト/属性を辞書で各言語へ置換。
 *   ・UI文言は読み込み時＋言語切替時にDOM全体を1回走査。
 *   ・カード名など動的描画は #cardList / #deckSlots だけを限定監視（childListのみ＝
 *     ユーザー操作の再描画時だけ発火。毎フレームではないので軽い／落ちない）。
 *  追加言語：LANGS と DICT に足すだけ。レイアウトは全言語LTR固定（ar/faの文字はbidiで自動RTL描画）。
 * ============================================================= */
(function () {
  const LANGS = ['ja', 'en', 'es', 'pt-br', 'fr', 'de', 'ru', 'ko', 'zh-cn', 'ar', 'tr', 'it', 'id', 'th', 'vi', 'zh-tw', 'fa', 'nl'];
  const LANG_NAMES = { ja: '日本語', en: 'English', es: 'Español', 'pt-br': 'Português', 'zh-cn': '简体中文', fr: 'Français', de: 'Deutsch', ru: 'Русский', ko: '한국어', ar: 'العربية', tr: 'Türkçe', it: 'Italiano', id: 'Indonesia', th: 'ไทย', vi: 'Tiếng Việt', 'zh-tw': '繁體中文', fa: 'فارسی', nl: 'Nederlands' };
  // 閉じている時の2文字コード / 開いた時の国旗
  const LANG_CODE = { ja: 'JP', en: 'EN', es: 'ES', 'pt-br': 'PT', 'zh-cn': 'ZH', fr: 'FR', de: 'DE', ru: 'RU', ko: 'KO', ar: 'AR', tr: 'TR', it: 'IT', id: 'ID', th: 'TH', vi: 'VI', 'zh-tw': 'TW', fa: 'FA', nl: 'NL' };
  const LANG_FLAG = { ja: '🇯🇵', en: '🇬🇧', es: '🇪🇸', 'pt-br': '🇧🇷', 'zh-cn': '🇨🇳', fr: '🇫🇷', de: '🇩🇪', ru: '🇷🇺', ko: '🇰🇷', ar: '🇸🇦', tr: '🇹🇷', it: '🇮🇹', id: '🇮🇩', th: '🇹🇭', vi: '🇻🇳', 'zh-tw': '🇹🇼', fa: '🇮🇷', nl: '🇳🇱' };

  // 原文(日本語) → 各言語。キーは画面に出る日本語テキスト（trimして照合）。
  const DICT = {
    // 日本語テンプレ（t()用。{name}等のプレースホルダを含む動的文字列の原文）
    ja: {
      "toast.movedToSlot": "{name} をスロット{n}へ移動",
      "toast.removedFromDeck": "{name} をデッキから外しました",
      "decks.srcTop": "世界トップ{n}ランカー（過去3日で延べ{p}人分を集計）",
      "decks.srcTopNoSample": "世界トップ{n}ランカー",
      "decks.srcGenericSample": "世界上位ランカー延べ{p}人",
      "decks.srcGeneric": "世界上位ランカー",
      "decks.subMain": "<b>{hrs}時間ごとに更新されます。</b>{src}の<b>過去3日間のランク戦（バトル）使用デッキ</b>を集計しています。ログインしてクラロワIDを設定すると<b>自分のカードで組めるデッキだけ</b>に絞り込めます。",
      "decks.noteMain": "{hrs}時間ごとに更新／{src}の過去3日間のランク戦から集計",
      "decks.noteSample": "※ サンプル表示です（集計データ連携の準備中）",
      "decks.lastUpdated": "最終更新 {t}",
      "decks.fetchFail": "※ 集計データの取得に失敗したため、代表的な型を表示しています",
      "decks.descWin": "<b>過去3日間のランク戦</b>（合計{n}戦以上）から、<b>勝率と信頼度（試合数）を加味した順</b>に表示されます。3冠率＝勝った試合のうち3クラウンだった割合です。",
      "decks.descTrend": "<b>過去3日間</b>と比べ、<b>使用人数が伸びた</b>デッキ順に表示されます。",
      "decks.descUsage": "<b>過去3日間</b>で、実際に使っている<b>人数と％が多い</b>デッキ順に表示されます。",
      "decks.descUsageN": "<b>過去3日間</b>で、延べ<b>{n}人</b>の内、実際に使っている<b>人数と％が多い</b>デッキ順に表示されます。",
      "decks.trendSoon": "急上昇は準備中です",
      "decks.trendSoonNote": "数回の更新でデータがたまり次第、自動で表示されます",
      "decks.ownedCount": "{shown} / {total} デッキが今のカードで組めます",
      "decks.ownedCountFiltered": "{shown} / {total} デッキ（絞り込み中）",
      "decks.ownedHint": "ログインしてクラロワIDを登録すると使えます",
      "share.byBtn": "👤 「share by {name}」を入れて投稿",
      "share.xText": "クラロワデッキが完成したよ！あなたもデッキを作ろう！ #クラロワ #CRDeckBuilders",
      "share.lineText": "あなたのデッキを共有しましょう！",
      "slot.n": "スロット{n}",
      "cards.n": "{n}枚",
      "fav.removeQ": "{name} をお気に入りから外す？",
      "copy.copied": "{name}さんが作ったデッキをコピーしました！",
      "copy.copiedGuest": "デッキをコピーしました！",
      "copy.openCR": "クラロワで開く",
      "copy.openHint": "開かない時は、クラロワを起動してから もう一度タップしてね",
      "swap.withWhich": "{name} をどちらと入れ替える？",
      // ビルダー/デッキ一覧の動的文字列（数値・名前入り）
      "avg.n": "（{n}枚）",
      "decks.nPlayersUse": "{n}人",
      "decks.winPct": "勝率 {p}%",
      "decks.nGames": "{n}戦",
      "decks.c3": "3冠率 {p}%",
      "decks.cd": "クラウン差 {v}",
      "diag.winconN": "勝ち筋 {n}枚を確認",
      "diag.airN": "対空ユニット {n}枚",
      "diag.swarmN": "範囲ユニット{a}枚＋ダメージ呪文{b}枚",
      "diag.tankKillerN": "タンクキラー {n}枚",
      "diag.bldN": "防衛建物 {n}枚",
      "diag.spellsN": "呪文{n}枚（小型処理{s}・中大型{b}）",
      "diag.ctrlN": "妨害手段 {n}枚（スタン/凍結/ノックバック等）",
      "diag.zoneN": "{n}枚が同じ呪文で同時に処理されうる",
      "diag.curve": "平均 {avg} ／ 最速回転 {cyc} ／ 最重 {hvy} ＝ {t}",
      "diag.sum": "{t}の「{w}」デッキ。課題：{b}",
      "diag.sumGood": "{t}の「{w}」デッキ。大きな穴は見当たりません",
      "diag.openRisk": "初手事故率 {p}%（素出しに不向きな{n}枚が初手4枚を独占する確率）",
      "diag.openOk": "初手は安定（素出しに不向きなカードは{n}枚）",
      "diag.asAirSpell": "対空{n}枚がすべてファイアボール圏内。1枚の呪文で空の受けがまとめて消えやすい構成です",
      "diag.asLog": "{n}枚が小型呪文圏内。ログや矢の雨を回されるだけで防衛が崩れやすくなります",
      "decks.nUsed": "{n}人使用",
      "decks.withCard": "「{name}」を含むデッキ",
      "decks.envOfName": "{name}さんの環境",
      "crank.hintWinMe": "そのカードを入れた相手に、あなたが勝てた割合（対面{n}回以上）。低い＝苦手な相手。",
      "crank.hintWin": "直近3日の対戦結果から算出（{n}戦以上）。使用率は低いのに勝率が高い＝玄人好みの「隠れ強カード」。",
      "crank.hintRise": "過去3日間と比べ、今回の更新で使用率が伸びたカード順。",
      "crank.hintUseMe": "直近の対戦で、あなたが当たった割合（対面率）。よく当たる相手カード順。",
      "crank.hintUse": "過去3日間で、トップ層のデッキに入っている割合。今この環境で「数が多い」カード。",
      "crank.subWin": "{g}戦 ・ 使用{u}",
      "crank.subRise": "使用 {u} ・ 勝率 {w}",
      "crank.subUse": "勝率 {w} ・ {g}戦",
      "mm.medUse": "中央 使用率{v}%",
      "mm.medWin": "中央 勝率{v}%",
      "decks.whoName": "{name}さん",
      "decks.meNote": "{who}の直近 {n}戦の対戦相手から集計（{who}のトロフィー帯）。このページを開くたびに精度UP。"
    },
    en: {
      "toast.movedToSlot": "Moved {name} to slot {n}",
      "toast.removedFromDeck": "Removed {name} from the deck",
      "decks.srcTop": "the top {n} ranked players ({p} entries)",
      "decks.srcTopNoSample": "the top {n} ranked players",
      "decks.srcGenericSample": "top players ({p} entries)",
      "decks.srcGeneric": "top players",
      "decks.subMain": "<b>Updated every {hrs} hours.</b> Aggregating <b>Ranked (Path of Legend) decks from the last 3 days</b> by {src}. Sign in and set your Clash Royale ID to filter to <b>only decks you can build</b>.",
      "decks.noteMain": "Updated every {hrs}h · Ranked battles from {src}, last 3 days",
      "decks.noteSample": "※ Sample data (live aggregation is being set up)",
      "decks.lastUpdated": "Last updated {t}",
      "decks.fetchFail": "※ Couldn't load aggregated data; showing representative archetypes",
      "decks.descWin": "From <b>Ranked battles over the last 3 days</b> ({n}+ games), sorted by <b>win rate weighted by reliability (sample size)</b>. 3-crown = share of wins that were 3-crown.",
      "decks.descTrend": "Sorted by decks whose <b>player count grew</b> compared with the <b>last 3 days</b>.",
      "decks.descUsage": "Sorted by decks <b>most used</b> (by player count and %) over the <b>last 3 days</b>.",
      "decks.descUsageN": "Of <b>{n} entries</b> over the <b>last 3 days</b>, sorted by decks <b>most used</b> (by count and %).",
      "decks.trendSoon": "Rising is coming soon",
      "decks.trendSoonNote": "It will appear automatically once a few updates have gathered data",
      "decks.ownedCount": "{shown} / {total} decks can be built with your current cards",
      "decks.ownedCountFiltered": "{shown} / {total} decks (filtered)",
      "decks.ownedHint": "Sign in and register your Clash Royale ID to use this",
      "share.byBtn": "👤 Post with “share by {name}”",
      "share.xText": "I just built a Clash Royale deck! Build yours too! #ClashRoyale #CRDeckBuilders",
      "share.lineText": "Let's share your deck!",
      "slot.n": "Slot {n}",
      "cards.n": "{n} cards",
      "fav.removeQ": "Remove {name} from favorites?",
      "copy.copied": "Copied {name}’s deck!",
      "copy.copiedGuest": "Deck copied!",
      "copy.openCR": "Open in Clash Royale",
      "copy.openHint": "If it doesn’t open, launch Clash Royale first, then tap again.",
      "swap.withWhich": "Swap {name} with which?",
      // ビルダー/デッキ一覧の動的文字列（数値・名前入り）
      "avg.n": "({n} cards)",
      "decks.nPlayersUse": "{n} players",
      "decks.c3": "3-crown {p}%", "decks.cd": "crown diff {v}",
      "diag.winconN": "{n} win condition(s)", "diag.airN": "{n} anti-air units", "diag.swarmN": "{a} splash units + {b} damage spells",
      "diag.tankKillerN": "{n} tank killer(s)", "diag.bldN": "{n} defensive building(s)", "diag.spellsN": "{n} spells ({s} small / {b} mid-large)",
      "diag.ctrlN": "{n} control cards (stun/freeze/knockback)", "diag.zoneN": "{n} cards can be wiped by one spell", "diag.curve": "Avg {avg} / fastest cycle {cyc} / heaviest {hvy} = {t}",
      "diag.sum": "{t} \"{w}\" deck. Watch out for: {b}", "diag.sumGood": "{t} \"{w}\" deck. No major holes found.",
      "diag.openRisk": "Opening-hand risk {p}% (chance your first 4 cards are all poor openers — {n} such cards)",
      "diag.openOk": "Stable openings ({n} poor-opener cards)",
      "diag.asAirSpell": "All {n} of your anti-air cards die to one Fireball — your air defense can vanish to a single spell.",
      "diag.asLog": "{n} cards die to small spells — a single Log or Arrows can break your defense.",
      "対空の一掃リスク": "Air defense wipe risk", "小型呪文に弱い": "Weak to small spells",
      "重い勝ち筋の重複": "Heavy win conditions overlap",
      "高コストの主軸が複数あると、エリクサーが足りず両方とも腐りやすくなります": "Multiple heavy win conditions compete for elixir and can both go stale.",
      "専任なし。建物釣り＋集中砲火で凌ぐ型です": "No dedicated killer — kite with your building and focus fire.",
      "ジャイアント級に苦戦しやすい構成です": "Likely to struggle against Giant-class tanks.",
      "詳細チェックを見る": "Show detailed checks",
      "攻撃圧": "Offense", "地上防衛": "Ground def.", "小物処理": "Swarm clear", "妨害": "Control", "回転・安定": "Cycle & stability",
      "β：ウェイト監修中。タグ表の精度が上がるほどチャートも正確になります": "Beta: weights under review — the chart gets more accurate as curation improves.",
      "デッキ診断": "Deck Check", "勝ち筋": "Win condition", "対空": "Anti-air", "群れ対策": "Swarm control", "タンク処理": "Tank killing",
      "防衛建物": "Defensive building", "呪文構成": "Spell set", "リセット・妨害": "Reset & control", "コストカーブ": "Cost curve",
      "タワーへの明確なダメージ源がありません": "No clear tower damage source.",
      "専任はいませんが高DPSで代用できます": "No dedicated tank killer, but high DPS can cover it.",
      "ジャイアント級に苦戦します": "Will struggle against Giant-class tanks.",
      "なし。ホグ・攻城系の受けはユニットで工夫を": "None. Plan unit placements against Hog / siege.",
      "なし。インフェルノ系・チャージ系・ランプ系に注意": "None. Watch out for Infernos, charge and ramp-up cards.",
      "ログ圏内": "Dies to The Log", "ザップ圏内": "Dies to Zap", "矢の雨圏内": "Dies to Arrows", "ファイボ圏内": "Dies to Fireball",
      "ポイズン圏内": "Dies to Poison", "ライトニング圏内": "Dies to Lightning", "ロケット圏内": "Dies to Rocket",
      "高速サイクル型": "Fast cycle", "バランス型": "Balanced", "やや重め": "Slightly heavy", "重量級（序盤の受けに注意）": "Heavyweight (careful early game)",
      "合格ライン！バランスの良い構成です": "Pass! Well-balanced deck.",
      "おおむね良好。⚠の項目を意識して立ち回ろう": "Mostly good. Play around the ⚠ items.",
      "課題あり。❌の項目を見直すと安定します": "Needs work. Fixing the ❌ items will stabilize it.",
      "診断中…": "Analyzing…",
      "データの取得に失敗しました。時間をおいて再読み込みしてください": "Failed to load data. Please reload later.",
      "※ 診断はLv16換算の理論値とオーナー監修タグに基づく参考情報です": "※ Based on Lv16-normalized stats and curated tags. For reference.",
      "→ デッキを組みに行く": "→ Build a deck",
      "strat.sub2": "Check your deck composition: anti-air, tank killing, spell durability and cost curve — judged with real Lv16 stats and curated tags.",
      "strat.beta": "🧪 Beta: scoring logic is being tuned continuously and will keep getting smarter.",
      "strat.empty": "Build 8 cards in the deck builder and<br>tap “Analyze deck →” to get your check-up.", "🧭 環境シェア（勝ち筋別・過去3日）": "🧭 Meta share (by win condition, last 3 days)", "その他": "Other", "decks.winPct": "Win rate {p}%",
      "decks.nGames": "{n} games",
      "decks.nUsed": "{n} players",
      "decks.withCard": "Decks with “{name}”",
      "decks.envOfName": "{name}'s meta",
      "crank.hintWinMe": "Your win rate against opponents using that card ({n}+ encounters). Low = tough matchup.",
      "crank.hintWin": "From the last 3 days of battles ({n}+ games). Low usage but high win rate = a hidden gem.",
      "crank.hintRise": "Cards whose usage grew in this update compared with the last 3 days.",
      "crank.hintUseMe": "How often you faced each card in recent battles, most frequent first.",
      "crank.hintUse": "Share of top-player decks including the card over the last 3 days.",
      "crank.subWin": "{g} games · {u} used",
      "crank.subRise": "{u} used · {w} win",
      "crank.subUse": "{w} win · {g} games",
      // decks.html の動的描画（文字一致）
      "が使用": "",
      "急上昇": "Rising",
      "▶ このデッキを作成ツールで開く": "▶ Open this deck in the builder",
      "該当するカードがありません": "No matching cards",
      "ログインすると使えます": "Sign in to use this",
      "右上のアカウントからクラロワIDを登録すると使えます": "Register your Clash Royale ID from the account menu (top right)",
      "カードの急上昇は準備中です": "Card rising is coming soon",
      "この領域に表示中のカードはありません": "No cards shown in this region",
      "ランキングからカードをタップすると": "Tap a card in the ranking below",
      "ここに分布で表示されます": "and it will appear here on the map",
      "（4つの領域をタップすると拡大）": "(Tap a quadrant to zoom)",
      "※ サンプル表示です（集計データ連携の準備中）": "※ Sample data (live aggregation is being set up)",
      "「あなたの対面」はログイン＆クラロワID登録で使えます（右上のアカウントから）。": "“Your matchups” requires sign-in and a Clash Royale ID (account menu, top right).",
      "対戦データを取得中…": "Fetching battle data…",
      "を表示中": "showing",
      "このカードでデッキ検索": "Find decks with this card",
      "％＝この勝ち筋カードを含むデッキを使った人の割合（複数の勝ち筋を持つデッキは各勝ち筋にカウント）／ 勝率＝そのデッキ全体の勝率": "% = share of players whose deck contains this win condition (decks with multiple win conditions count once for each) / Win rate = overall win rate of those decks",
      "指を離さず左右になぞってデッキ切替": "Slide left/right without lifting your finger to switch decks",
      "mm.medUse": "Median usage {v}%",
      "mm.medWin": "Median win {v}%",
      // あなたの帯メタ（個人対面ログ→勝ち筋分布）
      "me.metaTitle": "📍 あなたの帯の環境シェア（直近7日・{n}戦）",
      "相手デッキの勝ち筋分布＝あなたのランク帯のメタ。使ったデッキに関係なく貯まる正確なサンプルです。勝率は対面3戦未満なら表示しません": "Win-condition share of your opponents = the meta at your trophy range. Accurate regardless of which deck you played. Win rate hidden under 3 encounters.",
      "その他": "Other",
      // ログイン前のポリシー同意
      "ログインの前に": "Before you sign in",
      "続行すると、": "By continuing, you agree to the ",
      "プライバシーポリシー": "Privacy Policy",
      "（アカウント情報・対戦データの取り扱い、匿名統計への利用）に同意したものとみなされます。": " (handling of account info & battle data, use in anonymous statistics).",
      "同意して続行": "Agree & continue",
      // privacy.html 段落
      "pp.collect": "When you sign in, we receive basic info from your Google account (display name, email, profile image). If you register your Clash Royale player tag, we fetch your battle history (opponent deck composition, results, etc.) from the public API. If you make a donation, we keep the amount reported by the payment provider (Stripe). We never store your card numbers or payment credentials.",
      "pp.purpose": "Collected data is used to provide features (deck saving, matchup meta view), improve the site, and build <b>statistics that never identify individuals</b> (e.g. deck usage trends per trophy range). Statistics never include names, tags, or email addresses.",
      "pp.third": "We use Google Firebase (auth & database) for storage, Stripe for payments, and a RoyaleAPI proxy for battle data. We also use Google Analytics (GA4) to understand site usage (such as page views), which uses cookies to collect anonymous usage data. We also use Google AdSense to serve ads, which uses cookies to deliver and optimize advertising. Each service is governed by its own privacy policy. We use the browser's localStorage for settings (language, favorites, etc.).",
      "seo.h1": "Clash Royale Deck Checker & Deck Builder",
      "seo.lead": "CR Deck Builders is a free Clash Royale deck maker and analyzer. Pick 8 cards from all 121 to build a deck and instantly check its average elixir, attack/defense balance, win conditions and weaknesses. Evolutions, Heroes and Champions are supported, and you can send your deck straight into the game with one tap.",
      "seo.h2build": "Deck-building basics",
      "seo.build": "A solid deck balances a win condition that damages towers, defense to absorb pushes, anti-air for flying threats, and cheap cycle cards. An average elixir of 2.8-4.2 is easy to handle: lighter decks cycle faster, heavier decks hit harder. This tool's analysis spells out each deck's strengths and weak spots from this angle.",
      "seo.h2faq": "FAQ",
      "seo.q1": "Is the Clash Royale deck checker free?",
      "seo.a1": "Yes. Building and analyzing decks is completely free, with no sign-up required.",
      "seo.q2": "What does the deck analysis tell me?",
      "seo.a2": "Average elixir, attack / defense / anti-air balance, win conditions, structural weaknesses, and matchups versus the popular meta (beta).",
      "seo.q3": "What average elixir is good?",
      "seo.a3": "Most decks land between 2.8 and 4.2. Lighter builds cycle faster; heavier builds have more knockout power. As long as your win condition and defense fit together, a wide range of average elixir works.",
      "seo.q4": "Can I send my deck into the game?",
      "seo.a4": "Once you have 8 cards, tap 'Copy to game' to open Clash Royale and copy the deck directly.",
      "seo.q5": "Where can I see popular decks and win rates?",
      "seo.a5": "On the <a href='decks.html' style='color:var(--accent)'>popular decks &amp; win-rate ranking</a> page, aggregated from the last 3 days of ranked battles by top global players.",
      "pp.delete": "To delete data tied to your account, please reach out via the <a href=\"contact.html\">contact page</a>. We will verify and delete it.",
      "pp.change": "This policy may be updated as needed. Significant changes will be announced on the site.",
      "プライバシーポリシー | CR Deck Builders": "Privacy Policy | CR Deck Builders",
      "← CR Deck Builders に戻る": "← Back to CR Deck Builders",
      "収集する情報": "What we collect",
      "利用目的": "How we use it",
      "保存と第三者サービス": "Storage & third-party services",
      "削除のご依頼": "Deletion requests",
      "改定": "Changes",
      "最終更新：2026年6月12日": "Last updated: June 12, 2026",
      "decks.whoName": "{name}’s",
      "decks.meNote": "Aggregated from opponents in {who} last {n} battles ({who} trophy range). Accuracy improves each time you open this page.",
      "タップで全体に戻る": "Tap to return to the full view",
      "目立たないが勝ってる": "Quietly winning",
      "安定": "Stable",
      "チャレンジング": "Challenging",
      "人気だが勝ってない": "Popular but not winning",
      "対面率 →": "Matchup rate →",
      "使用率 →": "Usage →",
      "あなたの勝率 ↑": "Your win rate ↑",
      "勝率 ↑": "Win rate ↑",
      "あなた": "your",
      // ポップアップ／トーストの固定文（body監視・walkで文字一致）
      "枚": "cards", "空き": "empty", "編集中": "editing",
      "入れ替える？": "Swap?", "いま": "Now", "これに": "To this", "入れる": "Add",
      "をどちらと入れ替える？": "— swap with which?",
      "をお気に入りから外す？": "— remove from favorites?",
      "外す": "Remove", "キャンセル": "Cancel", "閉じる": "Close", "スロット": "Slot",
      "🌗 背景を白くする": "🌗 Light background",
      "空き": "Empty", "ログインで保存・名前が入れられます": "Log in to save & add your name", "デッキが空です": "Deck is empty", "ログインが必要です": "Login required", "8枚そろえてデッキを共有しよう": "Build a full 8-card deck to share it", "💡 クラロワID登録でユーザー名を表示": "💡 Register your Clash Royale ID to show your username", "SNSで共有": "Share on social",
      "まずデッキを8枚そろえてね": "Build a full 8-card deck first", "✅ デッキをコピー（8枚そろうとクラロワで開けます）": "✅ Deck copied (finish all 8 cards to open in Clash Royale)", "コピーできませんでした": "Couldn’t copy", "copy.toGame": "Copy to<br>game",
      "保存するスロットを選んで「保存」": "Pick a slot, then “Save”",
      "呼び出すデッキを選ぶ（横スクロール）": "Pick a deck to load (scroll sideways)",
      "✅ 保存しました！このデッキを共有する？": "✅ Saved! Share this deck?",
      "𝕏 でポスト": "Post on 𝕏", "LINEで送る": "Send via LINE", "🔗 リンクをコピー": "🔗 Copy link",
      "名前ボタンが光ってると、画像にあなたの名前が入ります。": "When the name button is lit, your name appears on the image.",
      "閉じるときはこの外側をタップ": "Tap outside to close",
      "✓ コピーしました": "✓ Copied",
      // トースト
      "8枚そろうと分析できます": "Analysis unlocks at 8 cards",
      "✅ 保存しました": "✅ Saved", "保存に失敗しました": "Failed to save",
      "スロットを選んでください": "Please pick a slot", "このスロットは空です": "This slot is empty",
      "ログイン機能の読み込み中です": "Sign-in is still loading",
      "ログイン確認中です。少し待ってからもう一度": "Checking your sign-in — please try again shortly",
      "呼び出しにはログインが必要です": "Loading decks requires sign-in",
      "スロットの取得に失敗しました": "Failed to load slots",
      "保存済みデッキがありません": "No saved decks yet",
      "保存にはログインが必要です": "Saving requires sign-in",
      "デッキを読み込みました": "Deck loaded",
      // support.html 特典ポップ（「i」ボタン）
      "¥500 ひとしずく 💧": "¥500 — A Drop 💧",
      "¥2,000 ボトル": "¥2,000 — Bottle",
      "ひとしずくが、サーバーを守るエリクサーになります。": "Even a single drop becomes Elixir that defends the server.",
      "供給されたエリクサーは、維持費・データ更新・新機能の開発に直行します。": "Supplied Elixir goes straight into hosting, data updates, and new features.",
      "あなたの一滴で、開発が前に進みます。": "Your drop pushes development forward.",
      "ボトル級の供給。開発が一段加速します。": "A bottle-class supply. Development shifts up a gear.",
      "大型アップデートの背中を押すのは、いつもこのクラスの供給です。": "Supplies of this class are what power the big updates.",
      "心強い援軍に感謝を。": "Grateful for the reinforcements.",
      "※ 供給は見返りのない純粋な応援です。": "※ Supply is pure support — nothing is given in return.",
      "⚠ デッキは8枚まで": "⚠ Up to 8 cards",
      "⚠ すでに追加済み": "⚠ Already added",
      "⚠ チャンピオンは1枚まで": "⚠ Only 1 Champion allowed",
      "⚠ チャンピオンはスロット2か3のみ": "⚠ Champions go in slot 2 or 3 only",
      // ヘッダー / ナビ
      "クラロワデッキ作成・診断ツール": "Clash Royale Deck Builder & Analyzer",
      "デッキ作成": "Deck Builder",
      "人気デッキ・デッキ探求": "Popular Decks",
      "支援・寄付": "Support",
      "リクエスト・お問い合わせ": "Requests & Contact",
      "お気に入りを上に表示": "Show favorites first",
      "コスト順に並べ替え": "Sort by cost",
      "進化": "Evolution",
      "英雄": "Hero",
      "ヒーロー/チャンピオン": "Hero / Champion",
      "お気に入り追加": "Add to favorites",
      "お気に入り解除": "Remove from favorites",
      "クリックで外す": "Click to remove",
      "タップで使い方／長押しでスロット切替": "Tap for help / hold to switch slots",
      // ビルダー(index)
      "クリア": "Clear",
      "保存": "Save",
      "平均コスト": "Avg Elixir",
      "デッキ": "Deck",
      "デッキ分析へ": "Analyze deck",
      "人気デッキから作る": "Start from a popular deck",
      "カード名か略称で検索...": "Search cards by name…", "🔍 カード名・略称で絞り込み": "🔍 Search cards by name…",
      "全て": "All",
      "ユニット": "Units",
      "呪文": "Spells",
      "建物": "Buildings",
      "限界突破": "Evolution",
      "ヒーロー": "Hero",
      "チャンピオン": "Champion",
      "コスト": "Cost",
      // 支援(support)
      "支援・寄付": "Support",
      "開発者にエリクサーを供給する": "Supply Elixir to the developer",
      "OFUSEで応援する": "Support via OFUSE",
      "クレジットカード / Google Pay 対応": "Credit card / Google Pay",
      "ひとことメッセージを添えて応援できる": "Cheer with a short message",
      "エリクサー供給メニュー": "Elixir Supply Menu",
      "おすすめ": "Recommended",
      "人気": "Popular",
      "開発者からのメッセージ": "A message from the developer",
      "閉じる": "Close",
      // 問い合わせ(contact)
      "種類": "Type",
      "お名前（任意）": "Name (optional)",
      "内容": "Message",
      "送信する": "Send",
      "機能リクエスト": "Feature request",
      "カード追加・修正の要望": "Card add / fix request",
      "不具合の報告": "Bug report",
      "その他・ご感想": "Other / Feedback",
      "ニックネームでOK": "A nickname is fine",
      "ご要望・ご意見をご記入ください": "Write your request or feedback",
      "SNSでも受け付けています": "Also available on social media",
      // アカウント
      "🔑 ログイン": "🔑 Sign in",
      "ログアウト": "Sign out",
      "✨ ドラッグの軌跡": "✨ Drag trail",
      // 供給メニューのティア名（短い語句＝文字一致）
      "ひとしずく 💧": "A Drop 💧", "ボトル": "Bottle", "ポンプ": "Pump", "ドラム缶": "Drum", "タンク": "Tank", "プール": "Pool", "製造所": "Factory", "ダム": "Dam", "エリクサーの泉": "Elixir Spring", "隠し": "Hidden",
      // strategy / contact の短文
      "デッキ分析": "Deck Analysis",
      "← デッキ作成ツールに戻る": "← Back to the deck builder",
      "X（旧Twitter）の DM やメンションでもお気軽にどうぞ。": "Feel free to DM or mention me on X (formerly Twitter).",
      // 段落（data-i18n、<b>/<br>を含む）
      "sup.intro": "This tool is run for free. If you enjoy it, I'd be glad if you'd send the developer some <b>Elixir</b> 💧<br>Your support goes toward <b>server upkeep</b>, card-data updates, and new features.",
      "sup.menuNote": "Thank you, always! Your supply goes toward server upkeep, card-data updates, and new features. Supply is purely a way to cheer me on — every feature is free for everyone.",
      "sup.notes": "※ <b>If you are logged in</b>, your supply is recorded as a <b>cumulative</b> total. Thank you so much, truly.<br>※ OFUSE support also counts toward your total — just include <b>your login email for this site</b> in the message.<br>※ Amounts are a guide; you can enter any amount on the payment screen (one-time, not monthly).<br>※ Supply is purely support. All features — deck building, analysis, and more — are free for everyone.<br>※ This material is unofficial and is not endorsed by Supercell. For more information see Supercell\u0027s <a href='https://supercell.com/en/fan-content-policy/' target='_blank' rel='noopener' style='color:#8a90a0;'>Fan Content Policy</a>.",
      "con.intro": "“I'd love this feature,” “this card is missing,” “this part is hard to use” — anything is welcome.<br>Your feedback helps make this tool better, little by little.",
      "strat.sub": "Visualize your deck's average elixir and cost curve, plus its offense / defense / spell balance, to grasp its strengths and weaknesses.",
      "strat.soon": "Analysis is coming soon.<br>We're building visualizations for deck balance<br>and elixir cost curves.",
      // index: 分析ボタン（矢印付き）
      "デッキ分析へ →": "Analyze deck →",
      // decks: 見出し・タブ・解説（静的テキスト＝文字一致）
      "世界上位ランカーの使用デッキを集計して掲載しています。": "Aggregated from the decks used by the world's top-ranked players.",
      "📊 使用率": "📊 Usage", "🏅 勝率": "🏅 Win rate", "🔥 急上昇": "🔥 Rising",
      "🃏 組めるデッキだけ表示": "🃏 Only decks I can build",
      "※ メタは随時変わります。代表的な型を掲載しています。": "※ The meta shifts constantly. These are representative archetypes.",
      "カード": "Cards", "カード人気・メタ": "Card popularity & meta",
      "カード1枚ごとの使用率と勝率を、マップ上の位置で表示。「安定」「目立たないが勝ってる」「チャレンジング」など、そのカードが今の環境でどれだけポテンシャルを持つかが一目でわかる。": "Each card's usage and win rate, plotted by position on the map. See at a glance how much potential a card has in the current meta — “stable,” “quietly winning,” “challenging,” and more.",
      "※ 勝率は「そのカードを入れたデッキ」が勝った割合です。カード単体の力とは限りませんが、勝てるデッキに採用されている＝強い構築の一員として機能しているという意味合いで表示しています。": "※ Win rate is the share of wins for decks that include the card. It isn't the card's power in isolation, but being used in winning decks means it works as part of a strong build.",
      "あなたの環境": "Your region", "で見る": "view", "↻ 更新": "↻ Refresh",
      "メタマップ・Tier": "Meta map & Tiers", "全て表示": "Show all", "選択をクリア": "Clear selection",
      "下のランキングでカードをタップすると、ここに表示されます。横=使用率の順位（右ほど人気）／縦=勝率の順位（上ほど高い）。": "Tap a card in the ranking below to show it here. Horizontal = usage rank (further right = more popular) / Vertical = win-rate rank (higher = better).",
      "※ 使用率・勝率・急上昇いずれも直近3日間のデータから算出（更新ごとに最古を捨てて巡回）。": "※ Usage, win rate and rising are all computed from the last 3 days of data (each update drops the oldest day)."
    },
    es: {
      "クラロワデッキ作成・診断ツール": "Creador y analizador de mazos de Clash Royale",
      "デッキ作成": "Crear mazo", "人気デッキ・デッキ探求": "Mazos populares", "支援・寄付": "Apoyar", "リクエスト・お問い合わせ": "Sugerencias y contacto",
      "お気に入りを上に表示": "Mostrar favoritos primero", "コスト順に並べ替え": "Ordenar por coste", "進化": "Evolución", "英雄": "Héroe", "ヒーロー/チャンピオン": "Héroe / Campeón",
      "お気に入り追加": "Añadir a favoritos", "お気に入り解除": "Quitar de favoritos", "クリックで外す": "Clic para quitar", "タップで使い方／長押しでスロット切替": "Toca para ayuda / mantén para cambiar de ranura",
      "クリア": "Limpiar", "保存": "Guardar", "平均コスト": "Elixir medio", "デッキ": "Mazo", "デッキ分析へ": "Analizar mazo", "人気デッキから作る": "Empezar con un mazo popular", "カード名か略称で検索...": "Buscar cartas por nombre…", "🔍 カード名・略称で絞り込み": "🔍 Buscar cartas por nombre…",
      "全て": "Todas", "ユニット": "Tropas", "呪文": "Hechizos", "建物": "Estructuras", "限界突破": "Evolución", "ヒーロー": "Héroe", "チャンピオン": "Campeón", "コスト": "Coste",
      "開発者にエリクサーを供給する": "Dale Elixir al desarrollador", "OFUSEで応援する": "Apoyar vía OFUSE", "クレジットカード / Google Pay 対応": "Tarjeta / Google Pay", "ひとことメッセージを添えて応援できる": "Anima con un mensaje",
      "エリクサー供給メニュー": "Menú de suministro de Elixir", "おすすめ": "Recomendado", "人気": "Popular", "開発者からのメッセージ": "Mensaje del desarrollador", "閉じる": "Cerrar",
      "種類": "Tipo", "お名前（任意）": "Nombre (opcional)", "内容": "Mensaje", "送信する": "Enviar", "機能リクエスト": "Sugerencia de función", "カード追加・修正の要望": "Añadir/corregir carta", "不具合の報告": "Reportar un error", "その他・ご感想": "Otro / Comentarios",
      "ニックネームでOK": "Un apodo está bien", "ご要望・ご意見をご記入ください": "Escribe tu sugerencia o comentario", "SNSでも受け付けています": "También en redes sociales",
      "🔑 ログイン": "🔑 Iniciar sesión", "ログアウト": "Cerrar sesión", "✨ ドラッグの軌跡": "✨ Estela al arrastrar"
    },
    'pt-br': {
      "クラロワデッキ作成・診断ツール": "Criador e analisador de decks de Clash Royale",
      "デッキ作成": "Criar deck", "人気デッキ・デッキ探求": "Decks populares", "支援・寄付": "Apoiar", "リクエスト・お問い合わせ": "Sugestões e contato",
      "お気に入りを上に表示": "Mostrar favoritos primeiro", "コスト順に並べ替え": "Ordenar por custo", "進化": "Evolução", "英雄": "Herói", "ヒーロー/チャンピオン": "Herói / Campeão",
      "お気に入り追加": "Adicionar aos favoritos", "お気に入り解除": "Remover dos favoritos", "クリックで外す": "Clique para remover", "タップで使い方／長押しでスロット切替": "Toque para ajuda / segure para trocar de slot",
      "クリア": "Limpar", "保存": "Salvar", "平均コスト": "Elixir médio", "デッキ": "Deck", "デッキ分析へ": "Analisar deck", "人気デッキから作る": "Começar com um deck popular", "カード名か略称で検索...": "Buscar cartas por nome…", "🔍 カード名・略称で絞り込み": "🔍 Buscar cartas por nome…",
      "全て": "Todas", "ユニット": "Tropas", "呪文": "Feitiços", "建物": "Construções", "限界突破": "Evolução", "ヒーロー": "Herói", "チャンピオン": "Campeão", "コスト": "Custo",
      "開発者にエリクサーを供給する": "Dê Elixir ao desenvolvedor", "OFUSEで応援する": "Apoiar via OFUSE", "クレジットカード / Google Pay 対応": "Cartão / Google Pay", "ひとことメッセージを添えて応援できる": "Apoie com uma mensagem",
      "エリクサー供給メニュー": "Menu de suprimento de Elixir", "おすすめ": "Recomendado", "人気": "Popular", "開発者からのメッセージ": "Mensagem do desenvolvedor", "閉じる": "Fechar",
      "種類": "Tipo", "お名前（任意）": "Nome (opcional)", "内容": "Mensagem", "送信する": "Enviar", "機能リクエスト": "Sugestão de recurso", "カード追加・修正の要望": "Adicionar/corrigir carta", "不具合の報告": "Reportar um bug", "その他・ご感想": "Outro / Comentários",
      "ニックネームでOK": "Um apelido serve", "ご要望・ご意見をご記入ください": "Escreva sua sugestão ou comentário", "SNSでも受け付けています": "Também nas redes sociais",
      "🔑 ログイン": "🔑 Entrar", "ログアウト": "Sair", "✨ ドラッグの軌跡": "✨ Rastro ao arrastar"
    },
    fr: {
      "クラロワデッキ作成・診断ツール": "Créateur et analyseur de decks Clash Royale",
      "デッキ作成": "Créer un deck", "人気デッキ・デッキ探求": "Decks populaires", "支援・寄付": "Soutenir", "リクエスト・お問い合わせ": "Suggestions et contact",
      "お気に入りを上に表示": "Favoris en premier", "コスト順に並べ替え": "Trier par coût", "進化": "Évolution", "英雄": "Héros", "ヒーロー/チャンピオン": "Héros / Champion",
      "お気に入り追加": "Ajouter aux favoris", "お気に入り解除": "Retirer des favoris", "クリックで外す": "Cliquer pour retirer", "タップで使い方／長押しでスロット切替": "Appuyez pour l'aide / maintenez pour changer d'emplacement",
      "クリア": "Effacer", "保存": "Enregistrer", "平均コスト": "Élixir moyen", "デッキ": "Deck", "デッキ分析へ": "Analyser le deck", "人気デッキから作る": "Partir d'un deck populaire", "カード名か略称で検索...": "Rechercher des cartes…", "🔍 カード名・略称で絞り込み": "🔍 Rechercher des cartes…",
      "全て": "Toutes", "ユニット": "Troupes", "呪文": "Sorts", "建物": "Bâtiments", "限界突破": "Évolution", "ヒーロー": "Héros", "チャンピオン": "Champion", "コスト": "Coût",
      "開発者にエリクサーを供給する": "Offrir de l'Élixir au développeur", "OFUSEで応援する": "Soutenir via OFUSE", "クレジットカード / Google Pay 対応": "Carte / Google Pay", "ひとことメッセージを添えて応援できる": "Encouragez avec un message",
      "エリクサー供給メニュー": "Menu d'Élixir", "おすすめ": "Recommandé", "人気": "Populaire", "開発者からのメッセージ": "Message du développeur", "閉じる": "Fermer",
      "種類": "Type", "お名前（任意）": "Nom (facultatif)", "内容": "Message", "送信する": "Envoyer", "機能リクエスト": "Demande de fonctionnalité", "カード追加・修正の要望": "Ajout/correction de carte", "不具合の報告": "Signaler un bug", "その他・ご感想": "Autre / Avis",
      "ニックネームでOK": "Un pseudo suffit", "ご要望・ご意見をご記入ください": "Écrivez votre demande ou avis", "SNSでも受け付けています": "Aussi sur les réseaux sociaux",
      "🔑 ログイン": "🔑 Connexion", "ログアウト": "Déconnexion", "✨ ドラッグの軌跡": "✨ Traînée de glissement"
    },
    de: {
      "クラロワデッキ作成・診断ツール": "Clash Royale Deck-Builder & Analyse",
      "デッキ作成": "Deck erstellen", "人気デッキ・デッキ探求": "Beliebte Decks", "支援・寄付": "Unterstützen", "リクエスト・お問い合わせ": "Feedback & Kontakt",
      "お気に入りを上に表示": "Favoriten zuerst", "コスト順に並べ替え": "Nach Kosten sortieren", "進化": "Evolution", "英雄": "Held", "ヒーロー/チャンピオン": "Held / Champion",
      "お気に入り追加": "Zu Favoriten", "お気に入り解除": "Aus Favoriten entfernen", "クリックで外す": "Zum Entfernen klicken", "タップで使い方／長押しでスロット切替": "Tippen für Hilfe / halten zum Wechseln",
      "クリア": "Leeren", "保存": "Speichern", "平均コスト": "Ø Elixier", "デッキ": "Deck", "デッキ分析へ": "Deck analysieren", "人気デッキから作る": "Mit beliebtem Deck starten", "カード名か略称で検索...": "Karten suchen…", "🔍 カード名・略称で絞り込み": "🔍 Karten suchen…",
      "全て": "Alle", "ユニット": "Einheiten", "呪文": "Zauber", "建物": "Gebäude", "限界突破": "Evolution", "ヒーロー": "Held", "チャンピオン": "Champion", "コスト": "Kosten",
      "開発者にエリクサーを供給する": "Dem Entwickler Elixier geben", "OFUSEで応援する": "Über OFUSE unterstützen", "クレジットカード / Google Pay 対応": "Karte / Google Pay", "ひとことメッセージを添えて応援できる": "Mit einer Nachricht unterstützen",
      "エリクサー供給メニュー": "Elixier-Menü", "おすすめ": "Empfohlen", "人気": "Beliebt", "開発者からのメッセージ": "Nachricht vom Entwickler", "閉じる": "Schließen",
      "種類": "Art", "お名前（任意）": "Name (optional)", "内容": "Nachricht", "送信する": "Senden", "機能リクエスト": "Funktionswunsch", "カード追加・修正の要望": "Karte hinzufügen/korrigieren", "不具合の報告": "Fehler melden", "その他・ご感想": "Sonstiges / Feedback",
      "ニックネームでOK": "Ein Spitzname genügt", "ご要望・ご意見をご記入ください": "Schreibe deinen Wunsch oder dein Feedback", "SNSでも受け付けています": "Auch in sozialen Medien",
      "🔑 ログイン": "🔑 Anmelden", "ログアウト": "Abmelden", "✨ ドラッグの軌跡": "✨ Zieh-Spur"
    },
    ru: {
      "クラロワデッキ作成・診断ツール": "Конструктор и анализатор колод Clash Royale",
      "デッキ作成": "Создать колоду", "人気デッキ・デッキ探求": "Популярные колоды", "支援・寄付": "Поддержать", "リクエスト・お問い合わせ": "Предложения и контакты",
      "お気に入りを上に表示": "Избранное сверху", "コスト順に並べ替え": "Сортировать по стоимости", "進化": "Эволюция", "英雄": "Герой", "ヒーロー/チャンピオン": "Герой / Чемпион",
      "お気に入り追加": "В избранное", "お気に入り解除": "Убрать из избранного", "クリックで外す": "Нажмите, чтобы убрать", "タップで使い方／長押しでスロット切替": "Нажмите для справки / удерживайте для смены слота",
      "クリア": "Очистить", "保存": "Сохранить", "平均コスト": "Ср. эликсир", "デッキ": "Колода", "デッキ分析へ": "Анализ колоды", "人気デッキから作る": "Начать с популярной колоды", "カード名か略称で検索...": "Поиск карт…", "🔍 カード名・略称で絞り込み": "🔍 Поиск карт…",
      "全て": "Все", "ユニット": "Войска", "呪文": "Заклинания", "建物": "Здания", "限界突破": "Эволюция", "ヒーロー": "Герой", "チャンピオン": "Чемпион", "コスト": "Стоимость",
      "開発者にエリクサーを供給する": "Дать эликсир разработчику", "OFUSEで応援する": "Поддержать через OFUSE", "クレジットカード / Google Pay 対応": "Карта / Google Pay", "ひとことメッセージを添えて応援できる": "Поддержите с сообщением",
      "エリクサー供給メニュー": "Меню эликсира", "おすすめ": "Рекомендуем", "人気": "Популярное", "開発者からのメッセージ": "Сообщение от разработчика", "閉じる": "Закрыть",
      "種類": "Тип", "お名前（任意）": "Имя (необязательно)", "内容": "Сообщение", "送信する": "Отправить", "機能リクエスト": "Запрос функции", "カード追加・修正の要望": "Добавить/исправить карту", "不具合の報告": "Сообщить об ошибке", "その他・ご感想": "Другое / Отзыв",
      "ニックネームでOK": "Можно ник", "ご要望・ご意見をご記入ください": "Напишите ваш запрос или отзыв", "SNSでも受け付けています": "Также в соцсетях",
      "🔑 ログイン": "🔑 Войти", "ログアウト": "Выйти", "✨ ドラッグの軌跡": "✨ След перетаскивания"
    },
    ko: {
      "クラロワデッキ作成・診断ツール": "클래시 로얄 덱 빌더 & 분석기",
      "デッキ作成": "덱 만들기", "人気デッキ・デッキ探求": "인기 덱", "支援・寄付": "후원", "リクエスト・お問い合わせ": "요청 및 문의",
      "お気に入りを上に表示": "즐겨찾기 먼저 표시", "コスト順に並べ替え": "코스트순 정렬", "進化": "진화", "英雄": "영웅", "ヒーロー/チャンピオン": "영웅 / 챔피언",
      "お気に入り追加": "즐겨찾기 추가", "お気に入り解除": "즐겨찾기 해제", "クリックで外す": "클릭하여 제거", "タップで使い方／長押しでスロット切替": "탭하여 도움말 / 길게 눌러 슬롯 전환",
      "クリア": "비우기", "保存": "저장", "平均コスト": "평균 엘릭서", "デッキ": "덱", "デッキ分析へ": "덱 분석", "人気デッキから作る": "인기 덱으로 시작", "カード名か略称で検索...": "카드 검색…", "🔍 カード名・略称で絞り込み": "🔍 카드 검색…",
      "全て": "전체", "ユニット": "유닛", "呪文": "마법", "建物": "건물", "限界突破": "진화", "ヒーロー": "영웅", "チャンピオン": "챔피언", "コスト": "코스트",
      "開発者にエリクサーを供給する": "개발자에게 엘릭서 보내기", "OFUSEで応援する": "OFUSE로 후원", "クレジットカード / Google Pay 対応": "카드 / Google Pay", "ひとことメッセージを添えて応援できる": "메시지와 함께 응원",
      "エリクサー供給メニュー": "엘릭서 후원 메뉴", "おすすめ": "추천", "人気": "인기", "開発者からのメッセージ": "개발자의 메시지", "閉じる": "닫기",
      "種類": "종류", "お名前（任意）": "이름 (선택)", "内容": "내용", "送信する": "보내기", "機能リクエスト": "기능 요청", "カード追加・修正の要望": "카드 추가/수정 요청", "不具合の報告": "버그 신고", "その他・ご感想": "기타 / 의견",
      "ニックネームでOK": "닉네임도 괜찮아요", "ご要望・ご意見をご記入ください": "요청이나 의견을 적어주세요", "SNSでも受け付けています": "SNS에서도 받습니다",
      "🔑 ログイン": "🔑 로그인", "ログアウト": "로그아웃", "✨ ドラッグの軌跡": "✨ 드래그 잔상"
    },
    'zh-cn': {
      "クラロワデッキ作成・診断ツール": "皇室战争卡组构建与分析工具",
      "デッキ作成": "创建卡组", "人気デッキ・デッキ探求": "热门卡组", "支援・寄付": "支持", "リクエスト・お問い合わせ": "建议与联系",
      "お気に入りを上に表示": "收藏优先显示", "コスト順に並べ替え": "按费用排序", "進化": "进化", "英雄": "英雄", "ヒーロー/チャンピオン": "英雄 / 冠军",
      "お気に入り追加": "加入收藏", "お気に入り解除": "取消收藏", "クリックで外す": "点击移除", "タップで使い方／長押しでスロット切替": "点按查看帮助／长按切换槽位",
      "クリア": "清空", "保存": "保存", "平均コスト": "平均圣水", "デッキ": "卡组", "デッキ分析へ": "分析卡组", "人気デッキから作る": "从热门卡组开始", "カード名か略称で検索...": "搜索卡牌…", "🔍 カード名・略称で絞り込み": "🔍 搜索卡牌…",
      "全て": "全部", "ユニット": "部队", "呪文": "法术", "建物": "建筑", "限界突破": "进化", "ヒーロー": "英雄", "チャンピオン": "冠军", "コスト": "费用",
      "開発者にエリクサーを供給する": "给开发者补充圣水", "OFUSEで応援する": "通过 OFUSE 支持", "クレジットカード / Google Pay 対応": "信用卡 / Google Pay", "ひとことメッセージを添えて応援できる": "留言为开发者加油",
      "エリクサー供給メニュー": "圣水补给菜单", "おすすめ": "推荐", "人気": "热门", "開発者からのメッセージ": "开发者的话", "閉じる": "关闭",
      "種類": "类型", "お名前（任意）": "名字（可选）", "内容": "内容", "送信する": "发送", "機能リクエスト": "功能建议", "カード追加・修正の要望": "卡牌添加/修正", "不具合の報告": "问题反馈", "その他・ご感想": "其他 / 反馈",
      "ニックネームでOK": "昵称即可", "ご要望・ご意見をご記入ください": "请填写你的建议或意见", "SNSでも受け付けています": "也可通过社交媒体",
      "🔑 ログイン": "🔑 登录", "ログアウト": "退出登录", "✨ ドラッグの軌跡": "✨ 拖动轨迹"
    },
    ar: {
      "クラロワデッキ作成・診断ツール": "أداة إنشاء وتحليل مجموعات كلاش رويال",
      "デッキ作成": "إنشاء مجموعة", "人気デッキ・デッキ探求": "المجموعات الشائعة", "支援・寄付": "ادعم", "リクエスト・お問い合わせ": "اقتراحات وتواصل",
      "お気に入りを上に表示": "المفضلة أولاً", "コスト順に並べ替え": "ترتيب حسب التكلفة", "進化": "تطوّر", "英雄": "بطل", "ヒーロー/チャンピオン": "بطل / بطل خارق",
      "お気に入り追加": "أضف إلى المفضلة", "お気に入り解除": "إزالة من المفضلة", "クリックで外す": "انقر للإزالة", "タップで使い方／長押しでスロット切替": "اضغط للمساعدة / اضغط مطولاً لتبديل الخانة",
      "クリア": "مسح", "保存": "حفظ", "平均コスト": "متوسط الإكسير", "デッキ": "المجموعة", "デッキ分析へ": "تحليل المجموعة", "人気デッキから作る": "ابدأ من مجموعة شائعة", "カード名か略称で検索...": "ابحث عن البطاقات…", "🔍 カード名・略称で絞り込み": "🔍 ابحث عن البطاقات…",
      "全て": "الكل", "ユニット": "الوحدات", "呪文": "التعويذات", "建物": "المباني", "限界突破": "تطوّر", "ヒーロー": "بطل", "チャンピオン": "بطل خارق", "コスト": "التكلفة",
      "開発者にエリクサーを供給する": "امنح المطور إكسير", "OFUSEで応援する": "ادعم عبر OFUSE", "クレジットカード / Google Pay 対応": "بطاقة / Google Pay", "ひとことメッセージを添えて応援できる": "ادعم برسالة قصيرة",
      "エリクサー供給メニュー": "قائمة دعم الإكسير", "おすすめ": "موصى به", "人気": "شائع", "開発者からのメッセージ": "رسالة من المطور", "閉じる": "إغلاق",
      "種類": "النوع", "お名前（任意）": "الاسم (اختياري)", "内容": "الرسالة", "送信する": "إرسال", "機能リクエスト": "طلب ميزة", "カード追加・修正の要望": "إضافة/تصحيح بطاقة", "不具合の報告": "الإبلاغ عن خطأ", "その他・ご感想": "أخرى / ملاحظات",
      "ニックネームでOK": "اللقب يكفي", "ご要望・ご意見をご記入ください": "اكتب طلبك أو ملاحظتك", "SNSでも受け付けています": "أيضاً عبر وسائل التواصل",
      "🔑 ログイン": "🔑 تسجيل الدخول", "ログアウト": "تسجيل الخروج", "✨ ドラッグの軌跡": "✨ أثر السحب"
    },
    tr: {
      "クラロワデッキ作成・診断ツール": "Clash Royale Deste Oluşturucu ve Analiz",
      "デッキ作成": "Deste oluştur", "人気デッキ・デッキ探求": "Popüler desteler", "支援・寄付": "Destek ol", "リクエスト・お問い合わせ": "Öneri ve iletişim",
      "お気に入りを上に表示": "Önce favoriler", "コスト順に並べ替え": "Maliyete göre sırala", "進化": "Evrim", "英雄": "Kahraman", "ヒーロー/チャンピオン": "Kahraman / Şampiyon",
      "お気に入り追加": "Favorilere ekle", "お気に入り解除": "Favorilerden çıkar", "クリックで外す": "Kaldırmak için tıkla", "タップで使い方／長押しでスロット切替": "Yardım için dokun / yuva değiştirmek için basılı tut",
      "クリア": "Temizle", "保存": "Kaydet", "平均コスト": "Ort. İksir", "デッキ": "Deste", "デッキ分析へ": "Desteyi analiz et", "人気デッキから作る": "Popüler desteyle başla", "カード名か略称で検索...": "Kart ara…", "🔍 カード名・略称で絞り込み": "🔍 Kart ara…",
      "全て": "Tümü", "ユニット": "Birlikler", "呪文": "Büyüler", "建物": "Binalar", "限界突破": "Evrim", "ヒーロー": "Kahraman", "チャンピオン": "Şampiyon", "コスト": "Maliyet",
      "開発者にエリクサーを供給する": "Geliştiriciye İksir gönder", "OFUSEで応援する": "OFUSE ile destekle", "クレジットカード / Google Pay 対応": "Kart / Google Pay", "ひとことメッセージを添えて応援できる": "Bir mesajla destekle",
      "エリクサー供給メニュー": "İksir destek menüsü", "おすすめ": "Önerilen", "人気": "Popüler", "開発者からのメッセージ": "Geliştiriciden mesaj", "閉じる": "Kapat",
      "種類": "Tür", "お名前（任意）": "İsim (isteğe bağlı)", "内容": "Mesaj", "送信する": "Gönder", "機能リクエスト": "Özellik isteği", "カード追加・修正の要望": "Kart ekle/düzelt", "不具合の報告": "Hata bildir", "その他・ご感想": "Diğer / Geri bildirim",
      "ニックネームでOK": "Takma ad yeterli", "ご要望・ご意見をご記入ください": "İstek veya görüşünü yaz", "SNSでも受け付けています": "Sosyal medyada da",
      "🔑 ログイン": "🔑 Giriş yap", "ログアウト": "Çıkış yap", "✨ ドラッグの軌跡": "✨ Sürükleme izi"
    },
    it: {
      "クラロワデッキ作成・診断ツール": "Creatore e analizzatore di mazzi Clash Royale",
      "デッキ作成": "Crea mazzo", "人気デッキ・デッキ探求": "Mazzi popolari", "支援・寄付": "Sostieni", "リクエスト・お問い合わせ": "Suggerimenti e contatti",
      "お気に入りを上に表示": "Preferiti per primi", "コスト順に並べ替え": "Ordina per costo", "進化": "Evoluzione", "英雄": "Eroe", "ヒーロー/チャンピオン": "Eroe / Campione",
      "お気に入り追加": "Aggiungi ai preferiti", "お気に入り解除": "Rimuovi dai preferiti", "クリックで外す": "Clic per rimuovere", "タップで使い方／長押しでスロット切替": "Tocca per aiuto / tieni premuto per cambiare slot",
      "クリア": "Svuota", "保存": "Salva", "平均コスト": "Elisir medio", "デッキ": "Mazzo", "デッキ分析へ": "Analizza mazzo", "人気デッキから作る": "Parti da un mazzo popolare", "カード名か略称で検索...": "Cerca carte…", "🔍 カード名・略称で絞り込み": "🔍 Cerca carte…",
      "全て": "Tutte", "ユニット": "Truppe", "呪文": "Incantesimi", "建物": "Edifici", "限界突破": "Evoluzione", "ヒーロー": "Eroe", "チャンピオン": "Campione", "コスト": "Costo",
      "開発者にエリクサーを供給する": "Dai Elisir allo sviluppatore", "OFUSEで応援する": "Sostieni via OFUSE", "クレジットカード / Google Pay 対応": "Carta / Google Pay", "ひとことメッセージを添えて応援できる": "Sostieni con un messaggio",
      "エリクサー供給メニュー": "Menu Elisir", "おすすめ": "Consigliato", "人気": "Popolare", "開発者からのメッセージ": "Messaggio dello sviluppatore", "閉じる": "Chiudi",
      "種類": "Tipo", "お名前（任意）": "Nome (facoltativo)", "内容": "Messaggio", "送信する": "Invia", "機能リクエスト": "Richiesta funzione", "カード追加・修正の要望": "Aggiungi/correggi carta", "不具合の報告": "Segnala un bug", "その他・ご感想": "Altro / Feedback",
      "ニックネームでOK": "Va bene un nickname", "ご要望・ご意見をご記入ください": "Scrivi la tua richiesta o feedback", "SNSでも受け付けています": "Anche sui social",
      "🔑 ログイン": "🔑 Accedi", "ログアウト": "Esci", "✨ ドラッグの軌跡": "✨ Scia di trascinamento"
    },
    id: {
      "クラロワデッキ作成・診断ツール": "Pembuat & penganalisis dek Clash Royale",
      "デッキ作成": "Buat dek", "人気デッキ・デッキ探求": "Dek populer", "支援・寄付": "Dukung", "リクエスト・お問い合わせ": "Saran & kontak",
      "お気に入りを上に表示": "Favorit di atas", "コスト順に並べ替え": "Urutkan berdasarkan biaya", "進化": "Evolusi", "英雄": "Hero", "ヒーロー/チャンピオン": "Hero / Champion",
      "お気に入り追加": "Tambah ke favorit", "お気に入り解除": "Hapus dari favorit", "クリックで外す": "Klik untuk menghapus", "タップで使い方／長押しでスロット切替": "Ketuk untuk bantuan / tahan untuk ganti slot",
      "クリア": "Bersihkan", "保存": "Simpan", "平均コスト": "Rata-rata Elixir", "デッキ": "Dek", "デッキ分析へ": "Analisis dek", "人気デッキから作る": "Mulai dari dek populer", "カード名か略称で検索...": "Cari kartu…", "🔍 カード名・略称で絞り込み": "🔍 Cari kartu…",
      "全て": "Semua", "ユニット": "Pasukan", "呪文": "Mantra", "建物": "Bangunan", "限界突破": "Evolusi", "ヒーロー": "Hero", "チャンピオン": "Champion", "コスト": "Biaya",
      "開発者にエリクサーを供給する": "Beri Elixir ke pengembang", "OFUSEで応援する": "Dukung via OFUSE", "クレジットカード / Google Pay 対応": "Kartu / Google Pay", "ひとことメッセージを添えて応援できる": "Dukung dengan pesan",
      "エリクサー供給メニュー": "Menu Elixir", "おすすめ": "Direkomendasikan", "人気": "Populer", "開発者からのメッセージ": "Pesan dari pengembang", "閉じる": "Tutup",
      "種類": "Jenis", "お名前（任意）": "Nama (opsional)", "内容": "Pesan", "送信する": "Kirim", "機能リクエスト": "Permintaan fitur", "カード追加・修正の要望": "Tambah/perbaiki kartu", "不具合の報告": "Laporkan bug", "その他・ご感想": "Lainnya / Masukan",
      "ニックネームでOK": "Nama panggilan boleh", "ご要望・ご意見をご記入ください": "Tulis permintaan atau masukanmu", "SNSでも受け付けています": "Juga di media sosial",
      "🔑 ログイン": "🔑 Masuk", "ログアウト": "Keluar", "✨ ドラッグの軌跡": "✨ Jejak seret"
    },
    th: {
      "クラロワデッキ作成・診断ツール": "เครื่องมือสร้างและวิเคราะห์เด็ค Clash Royale",
      "デッキ作成": "สร้างเด็ค", "人気デッキ・デッキ探求": "เด็คยอดนิยม", "支援・寄付": "สนับสนุน", "リクエスト・お問い合わせ": "คำขอและติดต่อ",
      "お気に入りを上に表示": "แสดงรายการโปรดก่อน", "コスト順に並べ替え": "เรียงตามค่าใช้จ่าย", "進化": "วิวัฒนาการ", "英雄": "ฮีโร่", "ヒーロー/チャンピオン": "ฮีโร่ / แชมเปียน",
      "お気に入り追加": "เพิ่มในรายการโปรด", "お気に入り解除": "นำออกจากรายการโปรด", "クリックで外す": "คลิกเพื่อนำออก", "タップで使い方／長押しでスロット切替": "แตะเพื่อดูวิธีใช้ / กดค้างเพื่อสลับช่อง",
      "クリア": "ล้าง", "保存": "บันทึก", "平均コスト": "เอลิกเซอร์เฉลี่ย", "デッキ": "เด็ค", "デッキ分析へ": "วิเคราะห์เด็ค", "人気デッキから作る": "เริ่มจากเด็คยอดนิยม", "カード名か略称で検索...": "ค้นหาการ์ด…", "🔍 カード名・略称で絞り込み": "🔍 ค้นหาการ์ด…",
      "全て": "ทั้งหมด", "ユニット": "ยูนิต", "呪文": "เวทมนตร์", "建物": "สิ่งก่อสร้าง", "限界突破": "วิวัฒนาการ", "ヒーロー": "ฮีโร่", "チャンピオン": "แชมเปียน", "コスト": "ค่าใช้จ่าย",
      "開発者にエリクサーを供給する": "มอบเอลิกเซอร์ให้ผู้พัฒนา", "OFUSEで応援する": "สนับสนุนผ่าน OFUSE", "クレジットカード / Google Pay 対応": "บัตร / Google Pay", "ひとことメッセージを添えて応援できる": "ให้กำลังใจพร้อมข้อความ",
      "エリクサー供給メニュー": "เมนูเติมเอลิกเซอร์", "おすすめ": "แนะนำ", "人気": "ยอดนิยม", "開発者からのメッセージ": "ข้อความจากผู้พัฒนา", "閉じる": "ปิด",
      "種類": "ประเภท", "お名前（任意）": "ชื่อ (ไม่บังคับ)", "内容": "ข้อความ", "送信する": "ส่ง", "機能リクエスト": "ขอฟีเจอร์", "カード追加・修正の要望": "ขอเพิ่ม/แก้ไขการ์ด", "不具合の報告": "รายงานบั๊ก", "その他・ご感想": "อื่นๆ / ความคิดเห็น",
      "ニックネームでOK": "ใช้ชื่อเล่นได้", "ご要望・ご意見をご記入ください": "เขียนคำขอหรือความคิดเห็นของคุณ", "SNSでも受け付けています": "รับทางโซเชียลด้วย",
      "🔑 ログイン": "🔑 เข้าสู่ระบบ", "ログアウト": "ออกจากระบบ", "✨ ドラッグの軌跡": "✨ รอยลาก"
    },
    vi: {
      "クラロワデッキ作成・診断ツール": "Công cụ tạo & phân tích bộ bài Clash Royale",
      "デッキ作成": "Tạo bộ bài", "人気デッキ・デッキ探求": "Bộ bài phổ biến", "支援・寄付": "Ủng hộ", "リクエスト・お問い合わせ": "Góp ý & liên hệ",
      "お気に入りを上に表示": "Hiện yêu thích trước", "コスト順に並べ替え": "Sắp theo chi phí", "進化": "Tiến hóa", "英雄": "Anh hùng", "ヒーロー/チャンピオン": "Anh hùng / Quán quân",
      "お気に入り追加": "Thêm vào yêu thích", "お気に入り解除": "Bỏ khỏi yêu thích", "クリックで外す": "Nhấp để bỏ", "タップで使い方／長押しでスロット切替": "Chạm để xem trợ giúp / giữ để đổi ô",
      "クリア": "Xóa", "保存": "Lưu", "平均コスト": "Elixir TB", "デッキ": "Bộ bài", "デッキ分析へ": "Phân tích bộ bài", "人気デッキから作る": "Bắt đầu từ bộ bài phổ biến", "カード名か略称で検索...": "Tìm thẻ bài…", "🔍 カード名・略称で絞り込み": "🔍 Tìm thẻ bài…",
      "全て": "Tất cả", "ユニット": "Quân", "呪文": "Phép", "建物": "Công trình", "限界突破": "Tiến hóa", "ヒーロー": "Anh hùng", "チャンピオン": "Quán quân", "コスト": "Chi phí",
      "開発者にエリクサーを供給する": "Tặng Elixir cho nhà phát triển", "OFUSEで応援する": "Ủng hộ qua OFUSE", "クレジットカード / Google Pay 対応": "Thẻ / Google Pay", "ひとことメッセージを添えて応援できる": "Ủng hộ kèm lời nhắn",
      "エリクサー供給メニュー": "Menu Elixir", "おすすめ": "Đề xuất", "人気": "Phổ biến", "開発者からのメッセージ": "Lời nhắn từ nhà phát triển", "閉じる": "Đóng",
      "種類": "Loại", "お名前（任意）": "Tên (tùy chọn)", "内容": "Nội dung", "送信する": "Gửi", "機能リクエスト": "Yêu cầu tính năng", "カード追加・修正の要望": "Thêm/sửa thẻ bài", "不具合の報告": "Báo lỗi", "その他・ご感想": "Khác / Góp ý",
      "ニックネームでOK": "Biệt danh cũng được", "ご要望・ご意見をご記入ください": "Viết yêu cầu hoặc góp ý của bạn", "SNSでも受け付けています": "Cũng nhận qua mạng xã hội",
      "🔑 ログイン": "🔑 Đăng nhập", "ログアウト": "Đăng xuất", "✨ ドラッグの軌跡": "✨ Vệt kéo"
    },
    'zh-tw': {
      "クラロワデッキ作成・診断ツール": "皇室戰爭牌組構築與分析工具",
      "デッキ作成": "建立牌組", "人気デッキ・デッキ探求": "熱門牌組", "支援・寄付": "支持", "リクエスト・お問い合わせ": "建議與聯絡",
      "お気に入りを上に表示": "收藏優先顯示", "コスト順に並べ替え": "依費用排序", "進化": "進化", "英雄": "英雄", "ヒーロー/チャンピオン": "英雄 / 冠軍",
      "お気に入り追加": "加入收藏", "お気に入り解除": "取消收藏", "クリックで外す": "點擊移除", "タップで使い方／長押しでスロット切替": "點按查看說明／長按切換欄位",
      "クリア": "清空", "保存": "儲存", "平均コスト": "平均聖水", "デッキ": "牌組", "デッキ分析へ": "分析牌組", "人気デッキから作る": "從熱門牌組開始", "カード名か略称で検索...": "搜尋卡牌…", "🔍 カード名・略称で絞り込み": "🔍 搜尋卡牌…",
      "全て": "全部", "ユニット": "部隊", "呪文": "法術", "建物": "建築", "限界突破": "進化", "ヒーロー": "英雄", "チャンピオン": "冠軍", "コスト": "費用",
      "開発者にエリクサーを供給する": "給開發者補充聖水", "OFUSEで応援する": "透過 OFUSE 支持", "クレジットカード / Google Pay 対応": "信用卡 / Google Pay", "ひとことメッセージを添えて応援できる": "留言為開發者加油",
      "エリクサー供給メニュー": "聖水補給選單", "おすすめ": "推薦", "人気": "熱門", "開発者からのメッセージ": "開發者的話", "閉じる": "關閉",
      "種類": "類型", "お名前（任意）": "名稱（選填）", "内容": "內容", "送信する": "送出", "機能リクエスト": "功能建議", "カード追加・修正の要望": "卡牌新增/修正", "不具合の報告": "問題回報", "その他・ご感想": "其他 / 意見",
      "ニックネームでOK": "暱稱即可", "ご要望・ご意見をご記入ください": "請填寫你的建議或意見", "SNSでも受け付けています": "也可透過社群媒體",
      "🔑 ログイン": "🔑 登入", "ログアウト": "登出", "✨ ドラッグの軌跡": "✨ 拖曳軌跡"
    },
    fa: {
      "クラロワデッキ作成・診断ツール": "ابزار ساخت و تحلیل دک کلش رویال",
      "デッキ作成": "ساخت دک", "人気デッキ・デッキ探求": "دک‌های محبوب", "支援・寄付": "حمایت", "リクエスト・お問い合わせ": "پیشنهاد و تماس",
      "お気に入りを上に表示": "ابتدا موردعلاقه‌ها", "コスト順に並べ替え": "مرتب‌سازی بر اساس هزینه", "進化": "تکامل", "英雄": "قهرمان", "ヒーロー/チャンピオン": "قهرمان / چمپیون",
      "お気に入り追加": "افزودن به موردعلاقه", "お気に入り解除": "حذف از موردعلاقه", "クリックで外す": "برای حذف کلیک کنید", "タップで使い方／長押しでスロット切替": "برای راهنما بزنید / برای تعویض خانه نگه دارید",
      "クリア": "پاک کردن", "保存": "ذخیره", "平均コスト": "میانگین اکسیر", "デッキ": "دک", "デッキ分析へ": "تحلیل دک", "人気デッキから作る": "شروع از یک دک محبوب", "カード名か略称で検索...": "جستجوی کارت…", "🔍 カード名・略称で絞り込み": "🔍 جستجوی کارت…",
      "全て": "همه", "ユニット": "یگان‌ها", "呪文": "طلسم‌ها", "建物": "ساختمان‌ها", "限界突破": "تکامل", "ヒーロー": "قهرمان", "チャンピオン": "چمپیون", "コスト": "هزینه",
      "開発者にエリクサーを供給する": "به توسعه‌دهنده اکسیر بده", "OFUSEで応援する": "حمایت از طریق OFUSE", "クレジットカード / Google Pay 対応": "کارت / Google Pay", "ひとことメッセージを添えて応援できる": "با یک پیام حمایت کن",
      "エリクサー供給メニュー": "منوی اکسیر", "おすすめ": "پیشنهادی", "人気": "محبوب", "開発者からのメッセージ": "پیام از توسعه‌دهنده", "閉じる": "بستن",
      "種類": "نوع", "お名前（任意）": "نام (اختیاری)", "内容": "پیام", "送信する": "ارسال", "機能リクエスト": "درخواست قابلیت", "カード追加・修正の要望": "افزودن/اصلاح کارت", "不具合の報告": "گزارش اشکال", "その他・ご感想": "دیگر / بازخورد",
      "ニックネームでOK": "نام مستعار هم خوب است", "ご要望・ご意見をご記入ください": "درخواست یا بازخورد خود را بنویسید", "SNSでも受け付けています": "در شبکه‌های اجتماعی هم",
      "🔑 ログイン": "🔑 ورود", "ログアウト": "خروج", "✨ ドラッグの軌跡": "✨ رد کشیدن"
    },
    nl: {
      "クラロワデッキ作成・診断ツール": "Clash Royale Deck Builder & Analyse",
      "デッキ作成": "Deck maken", "人気デッキ・デッキ探求": "Populaire decks", "支援・寄付": "Steunen", "リクエスト・お問い合わせ": "Suggesties & contact",
      "お気に入りを上に表示": "Favorieten eerst", "コスト順に並べ替え": "Sorteer op kosten", "進化": "Evolutie", "英雄": "Held", "ヒーロー/チャンピオン": "Held / Kampioen",
      "お気に入り追加": "Aan favorieten toevoegen", "お気に入り解除": "Uit favorieten", "クリックで外す": "Klik om te verwijderen", "タップで使い方／長押しでスロット切替": "Tik voor hulp / houd vast om slot te wisselen",
      "クリア": "Wissen", "保存": "Opslaan", "平均コスト": "Gem. Elixer", "デッキ": "Deck", "デッキ分析へ": "Deck analyseren", "人気デッキから作る": "Begin met een populair deck", "カード名か略称で検索...": "Zoek kaarten…", "🔍 カード名・略称で絞り込み": "🔍 Zoek kaarten…",
      "全て": "Alle", "ユニット": "Troepen", "呪文": "Spreuken", "建物": "Gebouwen", "限界突破": "Evolutie", "ヒーロー": "Held", "チャンピオン": "Kampioen", "コスト": "Kosten",
      "開発者にエリクサーを供給する": "Geef Elixer aan de ontwikkelaar", "OFUSEで応援する": "Steun via OFUSE", "クレジットカード / Google Pay 対応": "Kaart / Google Pay", "ひとことメッセージを添えて応援できる": "Steun met een bericht",
      "エリクサー供給メニュー": "Elixer-menu", "おすすめ": "Aanbevolen", "人気": "Populair", "開発者からのメッセージ": "Bericht van de ontwikkelaar", "閉じる": "Sluiten",
      "種類": "Type", "お名前（任意）": "Naam (optioneel)", "内容": "Bericht", "送信する": "Versturen", "機能リクエスト": "Functieverzoek", "カード追加・修正の要望": "Kaart toevoegen/corrigeren", "不具合の報告": "Bug melden", "その他・ご感想": "Overig / Feedback",
      "ニックネームでOK": "Een bijnaam mag", "ご要望・ご意見をご記入ください": "Schrijf je verzoek of feedback", "SNSでも受け付けています": "Ook via social media",
      "🔑 ログイン": "🔑 Inloggen", "ログアウト": "Uitloggen", "✨ ドラッグの軌跡": "✨ Sleepspoor"
    }
  };

  // カード名（日本語 → 公式英名）。動的描画されるので限定監視で随時置換。
  const CARD_EN = {
    "スケルトン": "Skeletons", "アイススピリット": "Ice Spirit", "ファイアスピリット": "Fire Spirit", "エレクトロスピリット": "Electro Spirit", "ヒールスピリット": "Heal Spirit",
    "ゴブリン": "Goblins", "ボンバー": "Bomber", "槍ゴブリン": "Spear Goblins", "コウモリの群れ": "Bats", "アイスゴーレム": "Ice Golem", "ウォールブレイカー": "Wall Breakers",
    "バーサーカー": "Berserker", "ザップ": "Zap", "巨大雪玉": "Giant Snowball", "ローリングバーバリアン": "Barbarian Barrel", "ローリングウッド": "The Log", "レイジ": "Rage",
    "ステルスブッシュ": "Suspicious Bush", "ゴブリンの呪い": "Goblin Curse", "ナイト": "Knight", "アーチャー": "Archers", "ガーゴイル": "Minions", "ゴブリンギャング": "Goblin Gang",
    "スケルトンバレル": "Skeleton Barrel", "ロケット砲士": "Firecracker", "メガガーゴイル": "Mega Minion", "吹き矢ゴブリン": "Dart Goblin", "エリクサーゴーレム": "Elixir Golem",
    "アイスウィザード": "Ice Wizard", "プリンセス": "Princess", "ディガー": "Miner", "スケルトン部隊": "Skeleton Army", "盾の戦士": "Guards", "アサシン ユーノ": "Bandit",
    "漁師トリトン": "Fisherman", "ロイヤルゴースト": "Royal Ghost", "矢の雨": "Arrows", "トルネード": "Tornado", "アースクエイク": "Earthquake", "ロイヤルデリバリー": "Royal Delivery",
    "ゴブリンバレル": "Goblin Barrel", "クローン": "Clone", "ヴァイン": "Vines", "ボイド": "Void", "ミラー": "Mirror", "大砲": "Cannon", "墓石": "Tombstone",
    "バルキリー": "Valkyrie", "マスケット銃士": "Musketeer", "ミニペッカ": "Mini P.E.K.K.A", "ホグライダー": "Hog Rider", "攻城バーバリアン": "Battle Ram", "スケルトンドラゴン": "Skeleton Dragons",
    "ザッピー": "Zappies", "ホバリング砲": "Flying Machine", "バトルヒーラー": "Battle Healer", "ダイナマイトゴブリン": "Goblin Demolisher", "ダークプリンス": "Dark Prince",
    "ハンター": "Hunter", "ベビードラゴン": "Baby Dragon", "エレクトロウィザード": "Electro Wizard", "インフェルノドラゴン": "Inferno Dragon", "ランバージャック": "Lumberjack",
    "マジックアーチャー": "Magic Archer", "マザーネクロマンサー": "Mother Witch", "ダークネクロ": "Night Witch", "ゴールドナイト": "Golden Knight", "スケルトンキング": "Skeleton King",
    "マイティディガー": "Mighty Miner", "フェニックス": "Phoenix", "鍛冶屋ジャイアント": "Rune Giant", "ファイアボール": "Fireball", "フリーズ": "Freeze", "ポイズン": "Poison",
    "ゴブリンの檻": "Goblin Cage", "ゴブリンドリル": "Goblin Drill", "ゴブリンの小屋": "Goblin Hut", "ボムタワー": "Bomb Tower", "テスラ": "Tesla", "迫撃砲": "Mortar", "オーブン": "Furnace",
    "バーバリアン": "Barbarians", "ガーゴイルの群れ": "Minion Horde", "ジャイアント": "Giant", "ウィザード": "Wizard", "エアバルーン": "Balloon", "ネクロマンサー": "Witch", "ボウラー": "Bowler",
    "執行人ファルチェ": "Executioner", "60式ムート": "Cannon Cart", "ロイヤルホグ": "Royal Hogs", "アウトロー": "Rascals", "ライトニングドラゴン": "Electro Dragon", "プリンス": "Prince",
    "ラムライダー": "Ram Rider", "リトルプリンス": "Little Prince", "モンク": "Monk", "ゴブリンシュタイン": "Goblinstein", "ボスアサシン": "Boss Bandit", "アーチャークイーン": "Archer Queen",
    "ゴブリンマシン": "Goblin Machine", "スケルトンラッシュ": "Graveyard", "インフェルノタワー": "Inferno Tower", "ロイヤルジャイアント": "Royal Giant", "エリートバーバリアン": "Elite Barbarians",
    "巨大スケルトン": "Giant Skeleton", "ゴブジャイアント": "Goblin Giant", "スパーキー": "Sparky", "スピリットエンプレス": "Spirit Empress", "ロケット": "Rocket", "ライトニング": "Lightning",
    "エリクサーポンプ": "Elixir Collector", "バーバリアンの小屋": "Barbarian Hut", "巨大クロスボウ": "X-Bow", "ペッカ": "P.E.K.K.A", "ラヴァハウンド": "Lava Hound", "エレクトロジャイアント": "Electro Giant",
    "メガナイト": "Mega Knight", "見習い親衛隊": "Royal Recruits", "ゴーレム": "Golem", "三銃士": "Three Musketeers"
  };
  if (DICT.en) Object.assign(DICT.en, CARD_EN);

  function pickLang() {
    // /en/ /pt-br/ 等のパス接頭辞を最優先（言語別静的ページ＝海外SEO用。URL自体が言語を表す）
    try { const seg = (location.pathname.split('/')[1] || '').toLowerCase(); if (LANGS.includes(seg)) return seg; } catch (e) {}
    // 次に ?lang=（共有リンクで言語指定）→ 保存済み → ブラウザ言語
    try { const u = (new URLSearchParams(location.search).get('lang') || '').toLowerCase(); if (u && LANGS.includes(u)) return u; } catch (e) {}
    try { const s = localStorage.getItem('cr_lang'); if (s && LANGS.includes(s)) return s; } catch (e) {}
    const n = (navigator.language || 'ja').toLowerCase(); // 例: 'es-mx','pt-br','ja-jp'
    if (LANGS.includes(n)) return n;
    const base = n.split('-')[0];
    const map = { pt: 'pt-br', zh: 'zh-cn' }; // 地域コードを既定の用意済みへ寄せる
    const cand = map[base] || base;
    if (LANGS.includes(cand)) return cand;
    if (base === 'ja') return 'ja';
    return LANGS.includes('en') ? 'en' : 'ja'; // それ以外は英語
  }

  let lang = pickLang();
  const origText = new WeakMap();

  function tr(src) {
    if (lang === 'ja') return src;
    const d = DICT[lang];
    if (d && d[src] != null) return d[src];
    if (DICT.en && DICT.en[src] != null) return DICT.en[src]; // 未訳は英語へフォールバック（カード名や未訳UI）
    return src;
  }

  // プレースホルダ補間翻訳。JS生成文字列（トースト・動的注記など）用。
  // 探索順：現在言語 → 英語 → 日本語テンプレ → キーそのもの。{name}などをvarsで置換。
  function fmt(s, vars) {
    return vars ? String(s).replace(/\{(\w+)\}/g, (m, k) => (vars[k] != null ? vars[k] : m)) : s;
  }
  function t(key, vars) {
    const d = DICT[lang], de = DICT.en, dj = DICT.ja;
    let s = (d && d[key] != null) ? d[key]
          : (de && de[key] != null) ? de[key]
          : (dj && dj[key] != null) ? dj[key]
          : key;
    return fmt(s, vars);
  }
  // 既存DOMのサブツリーを翻訳（body直下に動的生成されるポップアップ用）。
  function applyTo(el) { if (el && lang !== 'ja') translateText(el); }

  function translateText(root) {
    if (!root) return;
    const tw = document.createTreeWalker(root, NodeFilter.SHOW_TEXT, {
      acceptNode(n) {
        const p = n.parentNode; if (!p) return NodeFilter.FILTER_REJECT;
        const tag = p.nodeName;
        if (tag === 'SCRIPT' || tag === 'STYLE' || tag === 'TEXTAREA') return NodeFilter.FILTER_REJECT;
        if (p.closest && (p.closest('[data-no-i18n]') || p.closest('[data-i18n]'))) return NodeFilter.FILTER_REJECT; // data-i18n要素は要素単位で訳す
        return NodeFilter.FILTER_ACCEPT;
      }
    });
    const nodes = []; let nn; while ((nn = tw.nextNode())) nodes.push(nn);
    nodes.forEach(n => {
      let o = origText.get(n); if (o == null) { o = n.nodeValue; origText.set(n, o); }
      const t = (o || '').trim(); if (!t) return;
      const rep = tr(t);
      if (lang === 'ja') { if (n.nodeValue !== o) n.nodeValue = o; }
      else if (rep !== t) { n.nodeValue = o.replace(t, rep); }
    });
  }

  function translateAttrs() {
    ['title', 'placeholder', 'aria-label', 'alt'].forEach(attr => {
      document.querySelectorAll('[' + attr + ']').forEach(el => {
        if (el.closest('[data-no-i18n]')) return;
        const dk = 'i18no_' + attr.replace('-', '_');
        let o = el.dataset[dk]; if (o == null) { o = el.getAttribute(attr) || ''; el.dataset[dk] = o; }
        const t = o.trim(); if (!t) return;
        el.setAttribute(attr, lang === 'ja' ? o : tr(t));
      });
    });
  }

  // data-i18n="key" の要素は innerHTML ごと差し替え（<b>や<br>を含む長文・段落用）。未訳は英語→原文の順でフォールバック。
  function translateEls() {
    document.querySelectorAll('[data-i18n]').forEach(el => {
      const key = el.getAttribute('data-i18n');
      let o = el.dataset.i18nOrig; if (o == null) { o = el.innerHTML; el.dataset.i18nOrig = o; }
      if (lang === 'ja') { if (el.innerHTML !== o) el.innerHTML = o; return; }
      const d = DICT[lang], de = DICT.en;
      const rep = (d && d[key] != null) ? d[key] : (de && de[key] != null ? de[key] : null);
      el.innerHTML = (rep != null) ? rep : o;
    });
  }

  function walk() {
    document.documentElement.setAttribute('lang', lang);
    // レイアウトは全言語で固定（LTR）。アラビア語/ペルシャ語の「文字」は
    // ブラウザのbidi処理で自動的に右→左で描画されるので、UIの左右反転はしない。
    document.documentElement.setAttribute('dir', 'ltr');
    translateEls();
    translateText(document.body);
    translateAttrs();
  }

  function setLang(l) {
    if (!LANGS.includes(l)) return;
    lang = l; try { localStorage.setItem('cr_lang', l); } catch (e) {}
    walk();
    // 言語切替を各ページに通知（動的注記などをページ側で再描画してもらう）
    try { window.dispatchEvent(new CustomEvent('crlangchange', { detail: { lang: l } })); } catch (e) {}
  }

  // 動的描画コンテナだけを限定監視（childListのみ＝再描画時だけ。毎フレームではない）
  function observe(id) {
    const el = document.getElementById(id); if (!el) return;
    let q = false;
    const mo = new MutationObserver(() => {
      if (lang === 'ja') return;   // 日本語は何もしない＝ゼロ負荷
      if (q) return; q = true;
      requestAnimationFrame(() => { q = false; translateText(el); });
    });
    mo.observe(el, { childList: true, subtree: true });
  }

  function injectSwitcher() {
    const header = document.querySelector('header');
    if (!header || document.getElementById('crLang')) return;
    const wrap = document.createElement('div');
    wrap.id = 'crLang'; wrap.setAttribute('data-no-i18n', '');
    wrap.style.cssText = 'position:relative;flex:0 0 auto;margin-left:auto;';

    const btn = document.createElement('button');
    btn.id = 'crLangBtn'; btn.type = 'button'; btn.setAttribute('aria-label', 'Language');
    btn.style.cssText = 'display:flex;align-items:center;gap:3px;background:var(--surface2,#1e2230);color:var(--text,#e8eaf0);border:1px solid var(--border-hi,rgba(255,255,255,.15));border-radius:8px;font-size:12px;font-weight:700;padding:5px 7px;cursor:pointer;line-height:1;';
    function updateBtn() { btn.innerHTML = '<span>' + (LANG_CODE[lang] || lang.toUpperCase().slice(0, 2)) + '</span><span style="opacity:.55;font-size:10px">▾</span>'; }
    updateBtn();

    const menu = document.createElement('div');
    menu.id = 'crLangMenu';
    menu.style.cssText = 'position:absolute;top:calc(100% + 4px);right:0;display:none;background:var(--surface,#161920);border:1px solid var(--border-hi,rgba(255,255,255,.15));border-radius:10px;padding:4px;max-height:60vh;overflow:auto;z-index:300;box-shadow:0 8px 24px rgba(0,0,0,.5);min-width:150px;';
    LANGS.forEach(l => {
      const it = document.createElement('button'); it.type = 'button';
      it.textContent = (LANG_FLAG[l] || '') + '  ' + (LANG_NAMES[l] || l);
      it.style.cssText = 'display:block;width:100%;text-align:left;background:none;border:none;color:var(--text,#e8eaf0);font-size:13px;padding:7px 10px;border-radius:7px;cursor:pointer;white-space:nowrap;';
      it.onmouseenter = () => it.style.background = 'var(--surface2,#1e2230)';
      it.onmouseleave = () => it.style.background = 'none';
      it.onclick = () => { setLang(l); updateBtn(); menu.style.display = 'none'; };
      menu.appendChild(it);
    });

    btn.onclick = (e) => { e.stopPropagation(); menu.style.display = menu.style.display === 'block' ? 'none' : 'block'; };
    document.addEventListener('click', (e) => { if (!wrap.contains(e.target)) menu.style.display = 'none'; });

    wrap.appendChild(btn); wrap.appendChild(menu);
    const acct = document.getElementById('cr-account');
    if (acct && acct.parentNode === header) header.insertBefore(wrap, acct);
    else header.appendChild(wrap);

    if (!document.getElementById('crI18nStyle')) {
      const st = document.createElement('style'); st.id = 'crI18nStyle';
      st.textContent =
        'header{flex-wrap:nowrap !important;align-items:center !important;gap:10px}' +
        '.logo{flex:0 0 auto}' +
        '#crLang{flex:0 0 auto}' +
        '#cr-account{margin-left:8px;min-width:0;flex:0 1 auto}' +
        '#cr-account .cr-avatar-btn{max-width:100%;align-items:center}' +
        '#cr-account #crAvatarName{white-space:normal;line-height:1.12;display:-webkit-box;-webkit-line-clamp:2;-webkit-box-orient:vertical;overflow:hidden;word-break:break-word;text-align:left;max-width:14ch}' +
        /* ロール説明（自由文の日本語）は非日本語では非表示にして混在を防ぐ（将来ロール自体を廃止予定） */
        'html:not([lang="ja"]) .card-role{display:none}';
      document.head.appendChild(st);
    }
  }

  window.CRI18N = { setLang: setLang, apply: walk, applyTo: applyTo, t: t, tr: tr, get lang() { return lang; }, langs: LANGS };

  // body直下に動的生成されるポップアップ（スロット選択・SNS共有・確認ダイアログ・トースト等）を
  // 挿入時に翻訳。childListのみ＝直下追加の瞬間だけ発火（パーティクル等はテキスト無しで実質ノーコスト）。
  function observeBody() {
    const mo = new MutationObserver(muts => {
      if (lang === 'ja') return;
      const adds = [];
      muts.forEach(m => m.addedNodes.forEach(n => { if (n.nodeType === 1) adds.push(n); }));
      if (!adds.length) return;
      requestAnimationFrame(() => adds.forEach(n => { if (n.isConnected) translateText(n); }));
    });
    mo.observe(document.body, { childList: true });
  }

  function init() {
    injectSwitcher();
    walk();
    observe('cardList');
    observe('deckSlots');
    observeBody();
    setTimeout(walk, 800);   // 初期描画の取りこぼし対策（1回だけ）
  }
  if (document.readyState !== 'loading') init();
  else document.addEventListener('DOMContentLoaded', init);
})();
