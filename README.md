# CR Deck Builder 🃏

クラロワのデッキビルダーアプリ。GitHub Pages でホストしてどこからでも使えます。

## 使い方

- カードをタップ → デッキに追加（もう一度タップで削除）
- コスト・タイプ・カード名でフィルタ
- 平均コストをリアルタイム表示
- デッキをテキストでコピー

## GitHub Pages でのホスト方法

1. このリポジトリを GitHub にプッシュ
2. Settings → Pages → Source を `main` ブランチ、`/ (root)` に設定
3. 数分後に `https://<ユーザー名>.github.io/<リポジトリ名>/` でアクセス可能

## カードの追加・編集

正本は `catalogue/cards.json`。`node tools/update-card-catalogue.js --images` でサイト・収集・Worker配信用の共通台帳を生成します。生成物のCARDSを直接編集しないでください。

日次更新、詳細取得、形態追加、画像差し替え、公開検査、未確認データの扱いは [カード更新の共通経路](docs/card-updates.md) を参照。

## 設計メモ（docs/）

| ファイル | 中身 |
|---|---|
| [docs/data-collection.md](docs/data-collection.md) | 収集の設計・47帯の定義・拡大の実測史・「全試合は誰にも取れない」構造・飽和の判定 |
| [docs/monetization.md](docs/monetization.md) | 課金の設計・払いたくなる3原則・無料/課金の線引き・マイページ・実装状況 |
| [docs/operations.md](docs/operations.md) | 障害の記録と、落ちたら気づく仕組み（通知の設定手順） |
