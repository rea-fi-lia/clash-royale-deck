#!/usr/bin/env bash
# CR Deck Builders — サイト本体(main)を GitHub へ直接 push するデプロイ。
# 旧ワークフロー（zip化→Manus経由で丸投げ）の置き換え。
#
#   使い方:  ./deploy.sh "コミットメッセージ"
#   ?v= の更新（js/css 編集時）は別途。下の BUMP_V を 1 にすると当日日付へ一括更新。
#
# 守ること（PROJECT_HANDOFF §1）:
#   - 統計データ(decks.json 等)は data ブランチ。main へは絶対 push しない（.gitignore で保護）。
#   - フロント/i18n を編集したら gen-i18n を必ず実行（言語ページ＋sitemap 再生成）。
set -euo pipefail
cd "$(dirname "$0")"

MSG="${1:-deploy: update site}"
BUMP_V="${BUMP_V:-0}"

# 1) ?v= キャッシュバスターを「現行の最大値+1」へ一括更新（任意・BUMP_V=1 で有効）
#    ※?v= は日付でなく単調増加カウンタ運用（例 260670→260671）。date 方式だと逆行するため max+1。
if [ "$BUMP_V" = "1" ]; then
  CUR="$(grep -ohE '\?v=[0-9]{6}' *.html | grep -oE '[0-9]{6}' | sort -n | tail -1)"
  NEXT=$(( ${CUR:-260000} + 1 ))
  echo "▶ ?v= を $CUR → $NEXT へ一括更新"
  # shellcheck disable=SC2035
  sed -i '' "s/?v=[0-9]\{6\}/?v=$NEXT/g" *.html
fi

# 2) 言語別ページ＋sitemap を再生成（フロント/i18n 編集の反映に必須）
echo "▶ node tools/gen-i18n.js"
node tools/gen-i18n.js

# 3) ステージング
git add -A

# 4) 安全ガード: 統計データが万一「追加/変更」でステージされていたら中断
#    （削除 D は許可＝main に紛れ込んだ古いデータを消すのは安全）
LEAK="$(git diff --cached --name-only --diff-filter=ACMR | grep -E '^(trophy-[^/]+/.*|decks|cardhist|card-stats|card-tags|card-potential|card-eval|card-weights|card-ids|card-model-v2|matchups|matchups-v2-|synergy|band-meta|sighist-|wincon-policy|wincon-realization-|spell-tempo-|card-context-lift-|api-tags-seen|battle-schema-sample|battle-feature-buckets|pol-battle-intel-v1|pol-matchup-intel-v1|pol-card-intel-v1|pol-tower-troop-meta-v1|pol-spell-weakness-v1).*\.json$' || true)"
if [ -n "$LEAK" ]; then
  echo "✗ 統計データが staged されています。main へは push できません:"
  echo "$LEAK"
  echo "  → git restore --staged <file> で外してください（.gitignore も確認）。"
  exit 1
fi

# 5) 変更確認
echo "▶ 変更ファイル:"
git status --short
if git diff --cached --quiet; then
  echo "（変更なし。何も push しません）"
  exit 0
fi

# 6) commit & push
git commit -q -m "$MSG"
echo "▶ git push origin main"
git push origin main
echo "✓ デプロイ完了。Cloudflare は HTML を常時最新配信（?v 不要・即反映）。"
echo "  大きく変えた直後だけ Cloudflare → Purge Everything を1回。"
