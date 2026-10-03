#!/usr/bin/env bash
# 本番（main）の実行が成功したら、その対象について自動修理が残した作業ブランチを片付ける（2026-10-03）。
#   治った後に「直そうとした跡」が残ると、人が見たときの混乱のもとになる（10/3 に5本たまっていた）。
#   PRが開いているもの・確認できないものは、人の判断待ちとして残す。
#
#   bash tools/auto-fix-cleanup.sh <ワークフローのファイル名>     例: bash tools/auto-fix-cleanup.sh collect.yml
set -u
wf="${1:?ワークフローのファイル名が要る（例 collect.yml）}"
prefix="auto-fix/${wf%.yml}-"
refs=$(git ls-remote --heads origin 2>/dev/null | awk '{print $2}' | sed 's#^refs/heads/##' | grep -F -- "$prefix" | grep "^${prefix}" || true)
[ -n "$refs" ] || { echo "片付ける自動修理ブランチなし（$prefix*）"; exit 0; }
while read -r ref; do
  [ -n "$ref" ] || continue
  open=$(gh pr list --state open --head "$ref" --json number -q 'length' 2>/dev/null || echo unknown)
  if [ "$open" = "0" ]; then
    if git push origin --delete "$ref" >/dev/null 2>&1; then echo "片付け: $ref"; else echo "片付けに失敗（残す）: $ref"; fi
  else
    echo "残す（PRが開いている／確認できない）: $ref"
  fi
done <<< "$refs"
