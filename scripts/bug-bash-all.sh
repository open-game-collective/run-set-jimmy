#!/usr/bin/env bash
# All six charters, 3 at a time (each also runs a bot table of 3 browsers).
RUN=.bug-bash/$(cat .bug-bash/latest)
run() { scripts/bug-bash.sh "$RUN" "$@"; }
python3 - "$RUN/charters.yml" > "$RUN/jobs.txt" <<'PY'
import sys, re
text = open(sys.argv[1]).read()
for block in text.split("  - id: ")[1:]:
    get = lambda k: re.search(rf"^\s*{k}: (.*)$", block, re.M).group(1).strip().strip('"')
    print("\t".join([block.split("\n")[0].strip(), get("target"), get("agent"), get("goal")]))
PY
i=0
while IFS=$'\t' read -r id target agent goal; do
  run "$id" "$target" "$agent" "$goal" &
  i=$((i+1)); if [ $((i % 3)) -eq 0 ]; then wait; fi
done < "$RUN/jobs.txt"
wait
echo "all explorers done"
