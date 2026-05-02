#!/usr/bin/env bash
# memefy — queue a reaction GIF for Crabgotchi to render in its webview.
# Usage: render.sh "<query>"
#
# This script is intentionally tiny: it appends a JSON line to a queue file
# that the Crabgotchi VS Code extension watches. The extension does the
# Giphy API call and renders the GIF as an overlay in its sidebar webview,
# so we never write image data to the terminal pty.

set -euo pipefail

query="${1:-}"
if [ -z "$query" ]; then
  echo "memefy: missing query" >&2
  exit 2
fi

queue_dir="$HOME/.claude/skills/memefy"
queue_file="$queue_dir/queue.jsonl"
mkdir -p "$queue_dir"

# JSON-escape the query (handles quotes, backslashes, unicode)
escaped=$(printf '%s' "$query" | python3 -c 'import json,sys; print(json.dumps(sys.stdin.read()))' 2>/dev/null \
          || printf '"%s"' "${query//\"/\\\"}")

ts=$(date +%s%3N 2>/dev/null || date +%s)
printf '{"ts":%s,"query":%s,"duration":%s}\n' \
  "$ts" \
  "$escaped" \
  "${MEMEFY_DURATION:-4}" \
  >> "$queue_file"

echo "memefy: queued \"$query\" → $queue_file"
