# CRDBの表示アイコン

本人指定（2026-09-22）：サイトが準備する表示にはOS標準の絵文字を使わない。会話や利用者の入力を禁じる方針ではない。

新規UIは名前付きの独自アイコンを使う。

```html
<span class="cr-icon" data-icon="flame" aria-hidden="true"></span> 人気
```

アイコンだけのボタンには必ず意味のある `aria-label` を付ける。名前は `assets/icons/manifest.json` を参照。`assets/icons/symbols.svg` に独自図形43種の原画を保持し、`tools/build-icons.py` から36KB程度の `CRDBSymbols` フォントも生成する（Python + fonttools）。カラー絵文字や外部アイコン原画の転用はない。明暗テーマの文字色を継承する。

既存のカード形態キー、翻訳キー、API文字列、コピー文字列を壊さないため、以前のUnicode文字もフォント内で独自図形へ対応付けた。VS16の絵文字指定にも独自の字形を返す。新しいUIは名前付きアイコンを使い、互換目的の絵文字リテラルを増やさない。サイトの書体指定は先頭にCRDBSymbolsを指定し、通常の文字は従来の書体を維持する。全HTMLで共通CSSを読み込む。

検査：`node tools/check-ui-icons.mjs`。新しい絵文字リテラル、対応図形のない文字、CSS未読込のHTMLを検出する。`tools/ui-icon-legacy-baseline.json` は移行時の互換文字数の上限で、通常の変更時には増やさない。フォントの見た目は実画面でも確認する。
