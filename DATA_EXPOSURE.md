# JSON公開範囲メモ

2026-06-30時点の方針。静的サイトで直接読むJSONは、ブラウザから見える前提で「表示に必要な薄い内容」だけに寄せる。分析の核・再集計材料・生試合イベントはCloudflare R2 private + Worker APIへ移す。

## 現在の答え

- フロントの直接fetchは、原則 `*-public-v1.json` とカード定義系だけへ寄せた。
- 旧・核JSONへのフォールバックは `builder.js` / `decks.js` / `strategy.js` から外した。
- ただし、dataブランチ自体に核JSONが残っている間は、URLを知っている人には見える。完全防御はR2 private + Worker API化後。

## 公開表示用

ブラウザが直接読んでもよい。ページ表示に必要な候補・カード名・粗い並びだけを持つ。

- `decks-public-v1.json`: デッキ一覧/カード一覧/診断の調整候補に出す範囲。
- `card-pair-synergy-public-v1.json`: 2枚候補用。`other/kind/fit` のみに抑える。
- `card-pair-extension-synergy-public-v1.json`: 2枚に対する3枚目候補用。`card/kind/fit` のみに抑える。
- `card-threat-response-public-v1.json`: 苦しい相手と対策札用。内部の試合数・勝率差・liftは載せない。
- `card-elixir-vectors-public-v1.json`: UIで使う9軸/細分値のみ。由来文や編集メモは載せない。
- `wincon-policy-public-v1.json`: アシストが使う勝ち筋分類だけ。編集元・検証情報・メモは載せない。
- `pol-card-intel-public-v1.json`: カード別の表示補助。`games/wr/dominanceAvg` だけに抑える。
- `trophy-band-card-intel-public-v1.json`: 帯別カード表示補助。`games/wr/dominanceAvg` だけに抑える。
- `card-ids.json`: API IDとカード名の対応。秘匿対象ではない。
- `card-stats.json`, `card-tags.json`, `card-potential.json`: 現状はカード定義/分類として読む。R2/Worker移行時はアシストAPI応答に畳み込む。

## 非公開化対象

移行までdataブランチ上に暫定的に存在するが、ブラウザが直接読む状態はやめた対象。

- `card-pair-synergy-v1.json`: 詳細な2枚分析。
- `card-pair-extension-synergy-v1.json`: 詳細な3枚目分析。
- `card-threat-response-v1.json`: 詳細化していく苦しい相手/対策候補。
- `card-eval.json`, `wincon-policy.json`, `card-elixir-vectors-v1.json`: 監修/導出の元JSON。
- `matchups.json`, `sighist-*.json`, `cardhist.json`, `synergy.json`, `band-meta.json`: 再集計・診断の核。
- `pol-battle-intel-v1.json`, `pol-matchup-intel-v1.json`, `pol-elo-intel-v1.json`: 深い診断用。
- `trophy-battle-events-v1.json`: 生試合寄りのイベント保存。R2 privateへ移す。
- `api-tags-seen.json`, `battle-schema-sample.json`, `battle-feature-buckets.json`: API棚卸し用。

## strategy.js の暫定運用

- `card-eval.json` 直読みはやめ、公開用エリクサー価値ベクトルで「デッキ能力」を出す。
- `sighist-*.json` 直読みはやめ、公開デッキ一覧から作れる範囲で「デッキ調整」を出す。
- `matchups.json` / `pol-battle-intel-v1.json` 由来の深い相性・実戦傾向は、Worker API化まで止める。

## 次の移行先

- Raw archive: `battle-events-v1/YYYY/MM/DD/HH.ndjson.gz` をR2 privateへ保存。
- Aggregates: R2 privateへ保存し、Workerが `/api/assist`, `/api/threats`, `/api/strategy` で必要最小限だけ返す。
- Worker移行後はrepoをprivate化し、dataブランチ公開運用を段階的に閉じる。
