# JSON公開範囲メモ

2026-07-01時点の方針。静的サイトで直接読むJSONは、ブラウザから見える前提で「表示に必要な薄い内容」だけに寄せる。分析の核・再集計材料・生試合イベントはCloudflare R2 private + Worker APIへ移す。

注意：Worker APIのレスポンス自体はブラウザから見える。ここで守るのは「GitHub dataブランチ上の分析JSONファイルを丸ごと公開し続けない」こと。さらに秘匿度を上げる段階では、候補計算をWorker側へ寄せ、選択中デッキに必要な候補だけ返すAPIへ分割する。

## 現在の答え

- `tools/collect.js` はR2設定がある時、private集計JSONをR2へ保存する。R2未設定時だけ従来どおりdataブランチへfallbackする。
- `trophy-battle-events-v1.json` とは別に、再集計用のラン単位生試合liteをR2 `private/raw/ranked-battle-events-v1/YYYY-MM-DD/run-*.json` と `private/raw/trophy-battle-events-v1/YYYY-MM-DD/run-*.json` へ保存する。
- `cr-deck-ogp-worker` に `/api/assist/bootstrap`, `/api/strategy`, `/api/meta` を追加。ビルダー/診断/ランキング表示はAPI優先。本番では旧公開JSONへ直接fallbackしない（ローカル開発時だけ許可。`?publicJsonFallback=1` は非本番ホストでのみ有効）。Worker側のraw fallbackも既定OFFで、移行/緊急時だけ `PUBLIC_JSON_FALLBACK=1` で許可する。
- `PUBLIC_GH_MIRROR=0` かつR2設定ありなら、`writePublicJson_` は表示用JSONもR2へだけ書く。R2未設定時、または `PUBLIC_GH_MIRROR=1` の時だけdataブランチへミラーする。移行中のworkflow既定は `PRIVATE_GH_MIRROR=1` / `PUBLIC_GH_MIRROR=1` とし、Worker/API/フロント切替前に本番表示が古い時刻で止まる事故を避ける。切替確認後、Repository Variablesで両方 `0` に落として閉じる。
- `MIRROR_EXTERNAL_PUBLIC_TO_R2` / `MIRROR_EXTERNAL_PRIVATE_TO_R2` は、GAS/旧ツール由来JSONをdataブランチからR2へ吸い上げる移行用フラグ。既定は `PUBLIC_GH_MIRROR` / `PRIVATE_GH_MIRROR` に連動するため、ロックダウン後は古いdata版でR2を上書きしない。
- `collect-freshness.json` はdataブランチへ残す。中身は更新時刻・件数・窓名だけの軽量マーカーで、毎時起動チェック用。分析JSON本体は含めない。
- GAS/旧ツール製の元JSON（`card-eval.json`, `card-weights.json`, `card-elixir-vectors-v1.json`, `wincon-policy.json`, `synergy.json`, `band-meta.json`, `battle-feature-buckets.json`）もcollector末尾でR2へ退避する。`gas/Code.gs` の中央I/Oと `tools/export-elixir-vectors-from-sheet.js --publish` も、R2設定がある時はR2主保存で更新する。
- ただし、過去にdataブランチへ出た核JSONは削除・repo private化までURL直打ちで見える。完全防御はR2 secrets設定→collector成功→Worker deploy→dataブランチ整理まで必要。

## 公開表示用

候補・カード名・粗い並びだけに薄くした表示用JSON。最終運用ではブラウザから直接読ませず、Worker APIへ畳み込む。**分析に関わる表示用JSONはすべてR2へ保存**し、Worker APIはR2優先で読む。これにより、dataブランチ上の公開JSONを削除しても、表示はR2＋APIから同じものを返せる。

- ビルダー：`/api/assist/bootstrap`（R2優先。本番ブラウザは旧公開JSON直読みなし）
- 診断：`/api/strategy?deck=...&f=...`（深い材料はR2のみ。表示用カードJSONもR2優先）
- ランキング/メタ：`/api/meta`（R2優先。本番ブラウザは旧公開JSON直読みなし）
- Top3画像：`/top3img` は `decks.json` をR2優先で読む。raw fallbackはWorker変数 `PUBLIC_JSON_FALLBACK=1` の時だけ。

- `decks-public-v1.json`: デッキ一覧/カード一覧/診断の調整候補に出す範囲。
- `card-pair-synergy-public-v1.json`: 2枚候補用。`other/kind/fit` のみに抑える。
- `card-pair-extension-synergy-public-v1.json`: 2枚に対する3枚目候補用。`card/kind/fit` のみに抑える。
- `card-threat-response-public-v1.json`: 苦しい相手と対策札用。内部の試合数・勝率差・liftは載せない。
- `card-elixir-vectors-public-v1.json`: UIで使う9軸/細分値のみ。由来文や編集メモは載せない。
- `wincon-policy-public-v1.json`: アシストが使う勝ち筋分類だけ。編集元・検証情報・メモは載せない。
- `pol-card-intel-public-v1.json`: カード別の表示補助。`games/wr/dominanceAvg` だけに抑える。
- `trophy-band-card-intel-public-v1.json`: 帯別カード表示補助。`games/wr/dominanceAvg` だけに抑える。
- `card-ids.json`: API IDとカード名の対応。秘匿対象ではない。
- `collect-freshness.json`: Actionsの鮮度判定用。更新時刻と件数だけで、秘匿対象ではない。
- `card-stats.json`, `card-tags.json`, `card-potential.json`: カード定義/分類。アシスト/診断APIに畳み込み済み。collectが毎回dataブランチからR2へミラーする（`mirrorExternalPublicToR2_`）。

補足：上記の公開表示用JSONは `collect.js` の `writePublicJson_` で出力する。R2設定ありならR2が主保存先で、`PUBLIC_GH_MIRROR=1` の時だけdataブランチへも出す。collectが生成しないGAS/別ツール製（`card-stats/tags/potential`, `wincon-policy-public`, `card-elixir-vectors-public`）は、移行中のみ実行末尾の `mirrorExternalPublicToR2_` でR2へ取り込む。GAS控えの `ghWriteJson_()` とエリクサー価値の手動エクスポートも同じR2主保存ルールへ揃えた。

## 非公開化対象

移行までdataブランチ上に暫定的に存在するが、ブラウザが直接読む状態はやめた対象。

- `card-pair-synergy-v1.json`: 詳細な2枚分析。
- `card-pair-extension-synergy-v1.json`: 詳細な3枚目分析。
- `card-threat-response-v1.json`: 詳細化していく苦しい相手/対策候補。
- `decks.json`, `trophy-10000-14000/decks.json`: 集計本体。表示用は `decks-public-v1.json` とWorker APIへ分ける。
- `card-eval.json`, `card-weights.json`, `wincon-policy.json`, `card-elixir-vectors-v1.json`: 監修/導出の元JSON。collector末尾でR2へ退避する。
- `matchups.json`, `sighist-*.json`, `cardhist.json`, `synergy.json`, `band-meta.json`: 再集計・診断の核。`synergy/band-meta` は旧GAS/旧ツール製としてcollector末尾でR2へ退避する。
- `pol-ranking-probe-v1.json`, `pol-battle-intel-v1.json`, `pol-matchup-intel-v1.json`, `pol-card-intel-v1.json`, `pol-elo-intel-v1.json`: PoL/ランク戦分析用。
- `trophy-battle-events-v1.json`, `trophy-band-card-intel-v1.json`: 生試合寄りのイベント保存と帯別分析。R2 privateへ移す。
- `api-tags-seen.json`, `battle-schema-sample.json`, `battle-feature-buckets.json`: API棚卸し用。`battle-feature-buckets` は旧GAS/旧ツール製としてcollector末尾でR2へ退避する。

## strategy.js の運用

- `card-eval.json` 直読みはやめ、公開用エリクサー価値ベクトルで「デッキ能力」を出す。
- `sighist-*.json` 直読みはやめ、公開デッキ一覧から作れる範囲で「デッキ調整」を出す。
- `pol-battle-intel-v1.json` / `pol-matchup-intel-v1.json` 由来の深い実戦傾向・苦しい相手は `/api/strategy` 経由で復帰。ブラウザは核JSONのURLを直接読まない。

## 次の移行先

- GitHub Secretsに `R2_ACCOUNT_ID` / `R2_ACCESS_KEY_ID` / `R2_SECRET_ACCESS_KEY` を設定し、Variablesに必要なら `R2_BUCKET` / `R2_PRIVATE_PREFIX` を設定する。移行中はworkflow既定の `PRIVATE_GH_MIRROR=1` / `PUBLIC_GH_MIRROR=1` で両書きし、切替確認後にRepository Variablesで両方 `0` にする。
- Cloudflare側にR2 bucket `crdb-data-private` を作り、Worker binding `CRDB_DATA` を張る。
- 本番 `/api/*` が404の状態でフロントだけ先に出すと、raw fallback停止により表示が崩れる。安全順は、collector/workflow/tools/GAS/docsだけ先行push → `collect decks` でR2投入 → Worker deploy → `/api/health`, `/api/assist/bootstrap`, `/api/strategy?deck=...`, `/api/meta`, `/top3img` 確認 → 最後にフロントpush。
- 移行確認後、Repository Variablesで `PRIVATE_GH_MIRROR=0` / `PUBLIC_GH_MIRROR=0` に落とし、dataブランチ上のprivate対象JSONを削除するかrepo private化し、公開はWorker APIだけに絞る。
- 公開表示用JSONもR2へ揃うため、最終的にはdataブランチから公開JSONを消しても、Worker API経由で表示を維持できる。APIレスポンスまで削りたい場合は、次段階で「現在のデッキに必要な候補だけ返す」設計へ進める。
