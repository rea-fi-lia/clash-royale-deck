# CR Deck Builders 進捗メモ

- 最終更新: 2026-06-06
- 本番: https://crdeckbuilders.com/ （GitHub Pages）
- リポジトリ: rea-fi-lia/clash-royale-deck
- 作者表記: By rea-fi-lia

---

## ページ構成
- `index.html` … デッキ作成ツール（ビルダー）本体。下部=クリア/保存(5スロット・クラウド)/デッキ分析へ
- `decks.html` … 人気デッキ・デッキ開発（🏆ナビ。様々な角度でデッキを探すページ）
- `strategy.html` … デッキ分析ページ（準備中。indexの「デッキ分析へ」からスライド遷移で来る）
- `support.html` … 支援・寄付
- `contact.html` … リクエスト・お問い合わせ
- `auth.js` … ログイン共通モジュール（Firebase / Google＋メール・パスワード）
- `firebase-config.js` … Firebase設定を貼る場所（auth.jsが読み込む）
- `FIREBASE-SETUP.md` … Firebase導入手順書
- `decks.json` … 人気デッキデータ（GASが自動更新）
- `firestore.rules` … Firestoreセキュリティルール（コンソールに貼る用・tier保護込み）
- `gas/Code.gs` … 人気デッキ自動集計スクリプト（GAS）

ヘッダーの共通ナビ: 🛠️デッキ作成 / 🏆攻略 / 💛支援 / ✉️問い合わせ ＋ 👤ログイン

---

## できていること（DONE）

### ビルダー（index.html）
- 全121枚のカード。検索（ひらがな→カタカナ変換・ヨミ対応）、✕クリア（キーボード開閉を保持・大きめ）、Enterでキーボード閉じ。
- タイプタブ: 全て/ユニット/呪文/建物/⚡限界突破/👑ヒーロー/🏆チャンピオン ＋ ❤お気に入り。
  - PC=複数選択 / 携帯=単一選択。未選択＝全て。限界突破・ヒーロー選択時はカード画像もその姿に。
- お気に入り（localStorage）。ハートのポップアニメ（モバイル対応済み）。
- デッキ8枠（0=進化/1=ヒーロー・チャンピオン/2=ワイルド/3-7=通常）、平均コスト、コスト分布バー、テキストコピー、クリア。
- フッター「By rea-fi-lia」を指でなぞるとキラキラ。PC・モバイル両方で常時表示（iOS下部バー対策済み）。
- URL読み込み: `index.html?deck=カード名,...`（スロット順）でデッキを自動セット。

### 攻略・人気デッキ（strategy.html）
- `decks.json` を読み込み、人気デッキを4×2プレビューで表示（進化⚡/ヒーロー👑をビルダーと同じ判定で表示）。
- 「▶ 作成ツールで開く」でワンタップ読み込み。取得失敗時は内蔵デッキにフォールバック。
- 分析ページは準備中。

### 人気デッキ自動更新（GAS）
- `gas/Code.gs` が **パス・オブ・レジェンド世界ランキング上位**プレイヤーの currentDeck を集計 → 頻度上位を `decks.json` 化 → GitHubへ自動コミット。
- 6時間ごとのトリガーで自動実行。
- 公式API直叩き不可のため **RoyaleAPIプロキシ（proxy.royaleapi.dev）** 経由。許可IPは `45.79.218.79`。
- 秘密情報は **GASのスクリプト プロパティ**に保管（CR_TOKEN / GITHUB_TOKEN / GITHUB_REPO / GITHUB_PATH / GITHUB_BRANCH）。
- カード名は英語slug→日本語名の対応表をCode.gsに内蔵。

### SEO等（既存）
- タイトル/description、OGP/Twitter Card、canonical、Search Console登録、サイトマップ、構造化データ(JSON-LD)。

---

## 作業中（IN PROGRESS）— ログイン（Firebase）
- Firebaseプロジェクト: `crdeckbuilders`（Sparkプラン・無料）。
- `auth.js`: メール/パス＋Googleログイン（モーダルUI）、🔑ボタン（全ページ共通・自動挿入）、
  ユーザードキュメント作成、CRタグ保存、デッキのクラウド保存/読込/削除、グレードチップ表示。
  ※ Firebase SDKは動的import（CDNが遅くてもボタンは先に出る）。設定未入力でもサイトは正常動作。
- Firestore: `users/{uid}` = { email, displayName, photoURL, crTag, tier, theme, createdAt, updatedAt }、
  `users/{uid}/decks/{id}` = { name, slots[], avg, createdAt }。
- ルール（`firestore.rules`）: 自分のデータのみ読み書き可。**tierはクライアントから変更不可**（create時はfree固定／update時は変更不可）。
- Firebase設定は `firebase-config.js` に貼る（apiKey等は公開用でOK）。

### コード側で完了（DONE）
- [x] `auth.js` 作成（Google＋メール/パス＋パスワード再設定、モーダル、エラー日本語化）
- [x] `index.html` にログインUI＋デッキ橋渡し統合
- [x] `strategy.html` / `support.html` / `contact.html` の </body> 直前に `auth.js` 追加
- [x] `firestore.rules`（tier保護込み）作成
- [x] 未設定時も壊れないこと＋モーダル表示をブラウザ検証

### あなたがコンソールでやる残タスク
- [ ] Authで メール/パス＋Google を有効化
- [ ] Firestore作成＋ `firestore.rules` を貼って公開
- [ ] 承認済みドメインに crdeckbuilders.com 追加
- [ ] `firebase-config.js` に設定を貼る（FIREBASE-SETUP.md 参照）
- [ ] デプロイしてログイン動作確認

---

## これからやりたい（TODO）
- tier（寄付グレード）に応じた**見た目グレード変化**（ブロンズ/シルバー/ゴールド/ダイヤ等）。
- **デッキ保存のクラウド同期**（Firestore、別端末でも復元）。※ローカル保存(localStorage)から拡張。
- **プレイヤータグで「組めるデッキだけ」絞り込み**（GASに `?tag=` で所持カードを返す doGet を追加して併用）。
- **寄付→tier自動付与**（当面は手動でコンソール更新。将来 Ko-fi/Stripe等のWebhook → Cloud Functionで自動化）。
- 分析ページ（コストカーブ・攻防/呪文バランス等）。

---

## メモ / ハマりどころ
- iOSでフッターが消える問題: フッターは `body` 直下（.appの兄弟）に置く。`100dvh`＋`position:fixed; inset:0` の組み合わせが正。`svh`/`visualViewport` 実測に変えると逆に崩れる。
- 絵文字は生成スクリプトで raw string にすると `\U0001…` のまま出るので注意（実体で埋め込む）。
- GAS: トロフィー世界ランキング(`/locations/global/rankings/players`)は空。現行は `/locations/global/pathoflegend/players`。
- CRトークンはコピー時に空白混入・文字化けしやすい（Chromeで折り返し化け→Safari＋右クリックコピーで解決）。Code.gs側でも `[^A-Za-z0-9._-]` を除去する保険あり。
