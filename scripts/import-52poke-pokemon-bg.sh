#!/usr/bin/env bash
set -euo pipefail

ROOT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
LOG_FILE="${LOG_FILE:-/tmp/pokemon-localdex-import.log}"
PID_FILE="${PID_FILE:-/tmp/pokemon-localdex-import.pid}"

cd "$ROOT_DIR"
: > "$LOG_FILE"

nohup env \
  IMPORT_ITEMS="${IMPORT_ITEMS:-0}" \
  ONLY_MISSING="${ONLY_MISSING:-1}" \
  CONCURRENCY="${CONCURRENCY:-1}" \
  CHECKPOINT_EVERY="${CHECKPOINT_EVERY:-10}" \
  npm run import:52poke >> "$LOG_FILE" 2>&1 < /dev/null &

echo "$!" > "$PID_FILE"
echo "started pid $(cat "$PID_FILE")"
echo "log $LOG_FILE"
