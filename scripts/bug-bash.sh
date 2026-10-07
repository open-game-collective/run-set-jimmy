#!/usr/bin/env bash
# Runs one bug-bash charter: a bot table of 3 for it, then `e2e explore` playing the 4th phone.
#   scripts/bug-bash.sh <run-dir> <id> <target> <agent> "<goal>"
set -uo pipefail
RUN=$1; ID=$2; TARGET=$3; AGENT=$4; GOAL=$5
OUT="$RUN/explore-$ID"; mkdir -p "$OUT"
GAME_URL=${GAME_URL:-http://localhost:8797} pnpm exec tsx e2e/bot-table.ts > "$OUT/bot-table.log" 2>&1 &
BOTS=$!
for _ in $(seq 1 120); do grep -q '^JOIN ' "$OUT/bot-table.log" && break; sleep 1; done
JOIN=$(grep '^JOIN ' "$OUT/bot-table.log" | head -1 | cut -d' ' -f2)
if [ -z "$JOIN" ]; then echo "$ID: bot table never came up" | tee "$OUT/error.txt"; kill $BOTS; exit 2; fi
echo "$ID: exploring $JOIN"
APP_URL="$JOIN" pnpm exec e2e explore --target "$TARGET" --agent "$AGENT" --max-steps 12 --timeout 900000 \
  --reporter json,markdown --output "$OUT" --video on "$GOAL" > "$OUT/explore.log" 2>&1
CODE=$?
echo "$ID: explore exit $CODE"
kill $BOTS 2>/dev/null; wait $BOTS 2>/dev/null
exit $CODE
