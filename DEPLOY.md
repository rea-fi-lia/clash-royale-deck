# デプロイ（直接 git push 版）

旧ワークフロー（zip 化 → Manus 経由で main へ丸投げ）の置き換え。
このフォルダは `rea-fi-lia/clash-royale-deck` の `main` を直接指す git リポジトリ。
**置き場所＝`crdeckbuilders-handoff/clash-royale-deck/`（2026-06-24 に handoff フォルダ配下へ一本化）。** 別PCは handoff フォルダごと持っていけば全部揃う（ZIP不要）。

## 初回だけ（このPC）
```bash
gh auth login          # GitHub アカウント(rea-fi-lia)でログイン（本人操作）
```
→ HTTPS / このアカウント / ブラウザ認証 を選ぶと git の push 認証まで通る。

## ふだんのデプロイ
```bash
cd ~/Downloads/AI_SD/crdeckbuilders-handoff/clash-royale-deck
./deploy.sh "変更の説明"
```
`deploy.sh` がやること:
1. `node tools/gen-i18n.js`（言語別ページ＋sitemap 再生成・フロント/i18n 編集時に必須）
2. 統計データが紛れていないか安全ガード（紛れていたら中断）
3. `git add -A` → commit → `git push origin main`

js/css/i18n.js/auth.js を編集した時は ?v= を当日日付へ:
```bash
BUMP_V=1 ./deploy.sh "..."     # *.html の ?v= を当日へ一括更新してから push
```

## 絶対ルール（PROJECT_HANDOFF §1）
- **統計データ（decks.json / cardhist.json / card-*.json / matchups / sighist / synergy / band-meta）は `data` ブランチ専用。** main へは push しない（`.gitignore` で保護済み）。site はこれらを `raw.githubusercontent.com/.../data/<file>` から読む。
- HTML は Cloudflare が常時最新配信（?v 不要・push 後すぐ反映）。大きく変えた直後だけ Cloudflare → Purge Everything を1回。

## 関連（git 管理外）
- **Cloudflare Worker**: `cd ../cr-deck-ogp-worker && npx wrangler deploy`
- **Firestore ルール**: `npx firebase-tools deploy --only firestore:rules --project crdeckbuilders`
- **GAS（集計）**: script.google.com「ビルダー」へ手で差し替え（`gas/Code.gs` が控え）
