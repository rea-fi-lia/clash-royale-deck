#!/usr/bin/env bash
set -euo pipefail

if [ "${REBUILD_TROPHY:-false}" = 'true' ]; then
  TROPHY_BACKFILL_MS=1200000 node tools/collect.js --trophy-backfill
else
  # Release the previous aggregation's heap before scanning millions of stored battles.
  # A failed raw/history save exits here; the second process is never started in that case.
  node tools/collect.js --collect-only
  node tools/collect.js --trophy-backfill
fi
