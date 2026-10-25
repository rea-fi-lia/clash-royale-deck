#!/usr/bin/env bash
set -uo pipefail

# GNU timeout is available on the Ubuntu runner. Leave time for the existing
# status/notification steps before GitHub's 45-minute job cancellation.
timeout --signal=TERM --kill-after=30s 42m bash tools/run-collector.sh
status=$?
if [ "$status" -eq 124 ]; then
  echo 'COLLECTOR_TIMEOUT: collection exceeded 42 minutes; update completion is unconfirmed.'
  echo '::error title=収集が時間切れ::42分以内に収集・保存・集計が完了しませんでした。最終更新時刻を確認してください。'
  if [ -n "${GITHUB_OUTPUT:-}" ]; then
    echo 'timed_out=true' >> "$GITHUB_OUTPUT"
  fi
fi
exit "$status"
