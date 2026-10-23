#!/usr/bin/env bash
# Extracts values from the legacy Jenkinsfile so the parity job replays the
# exact commands Jenkins would run, instead of a hand-maintained copy that can drift.
#
# Usage:
#   jenkinsfile-extract.sh <Jenkinsfile> agent-image          -> node:22.23.3-bookworm-slim
#   jenkinsfile-extract.sh <Jenkinsfile> agent-args           -> -e HOME=/tmp ...
#   jenkinsfile-extract.sh <Jenkinsfile> stage-dir <stage>    -> app   (dir() wrapping the first sh step, or ".")
#   jenkinsfile-extract.sh <Jenkinsfile> stage-sh  <stage>    -> npm run test:ci
set -euo pipefail

jenkinsfile=${1:?Jenkinsfile path required}
mode=${2:?mode required}
stage=${3:-}

first_sh_in_stage() {
  # Prints "<dir>\t<command>" for the first single-quoted sh step after stage('<name>').
  # Portable awk (works with mawk and gawk): plain index()/substr(), no regex escapes for quotes.
  awk -v stage="stage('${stage}')" -v q="'" '
    index($0, stage) { found = 1; dir = "."; next }
    found && $0 ~ /^[ \t]*stage\(/ { exit 1 }
    found && index($0, "dir(" q) {
      rest = substr($0, index($0, "dir(" q) + 5)
      dir = substr(rest, 1, index(rest, q) - 1)
    }
    found && $0 ~ /^[ \t]*sh / && index($0, "sh " q) {
      line = substr($0, index($0, "sh " q) + 4)
      sub(/[ \t]+$/, "", line)
      line = substr(line, 1, length(line) - 1)
      printf "%s\t%s\n", dir, line
      done = 1
      exit 0
    }
    END { if (!done) exit 1 }
  ' "$jenkinsfile"
}

case "$mode" in
  agent-image)
    grep -m1 -oE "image '[^']+'" "$jenkinsfile" | sed -E "s/^image '([^']+)'$/\1/"
    ;;
  agent-args)
    grep -m1 -oE "args '[^']+'" "$jenkinsfile" | sed -E "s/^args '([^']+)'$/\1/"
    ;;
  stage-dir)
    first_sh_in_stage | cut -f1
    ;;
  stage-sh)
    first_sh_in_stage | cut -f2-
    ;;
  *)
    echo "unknown mode: $mode" >&2
    exit 2
    ;;
esac
