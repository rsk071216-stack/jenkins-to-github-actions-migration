#!/usr/bin/env bash
# Test parity: proves the GitHub Actions pipeline executes the same test cases,
# with the same outcome, as the legacy Jenkins pipeline.
#
# Usage: compare-tests.sh <legacy-junit.xml> <gha-junit.xml> <report.md>
set -euo pipefail

legacy=${1:?legacy junit path required}
gha=${2:?github actions junit path required}
report=${3:?report path required}
workdir=$(mktemp -d)

# Node's JUnit reporter emits one <testcase name="..." classname="..."> per test.
# We compare the sorted multiset of test names (duplicates kept on purpose).
testcases() { grep -oE '<testcase name="[^"]*"' "$1" | sed -E 's/^<testcase name="(.*)"$/\1/' | LC_ALL=C sort; }
failures() { grep -cE '<failure' "$1" || true; }
skipped() { grep -cE '<skipped' "$1" || true; }

testcases "$legacy" > "$workdir/legacy.txt"
testcases "$gha" > "$workdir/gha.txt"

legacy_count=$(wc -l < "$workdir/legacy.txt" | tr -d ' ')
gha_count=$(wc -l < "$workdir/gha.txt" | tr -d ' ')
legacy_failures=$(failures "$legacy")
gha_failures=$(failures "$gha")
legacy_skipped=$(skipped "$legacy")
gha_skipped=$(skipped "$gha")

status=0
check() { # name legacy gha
  if [ "$2" = "$3" ]; then
    printf '| %s | %s | %s | :white_check_mark: |\n' "$1" "$2" "$3"
  else
    printf '| %s | %s | %s | :x: |\n' "$1" "$2" "$3"
    status=1
  fi
}

{
  echo "### Test parity (Jenkins agent image vs GitHub Actions runner)"
  echo
  echo "| Check | Jenkins path | GitHub Actions path | Result |"
  echo "| --- | --- | --- | --- |"
  check "Test cases executed" "$legacy_count" "$gha_count"
  check "Failures" "$legacy_failures" "$gha_failures"
  check "Skipped" "$legacy_skipped" "$gha_skipped"
  if diff -u "$workdir/legacy.txt" "$workdir/gha.txt" > "$workdir/names.diff"; then
    printf '| %s | %s | %s | :white_check_mark: |\n' "Identical test names" "-" "-"
  else
    printf '| %s | %s | %s | :x: |\n' "Identical test names" "see diff" "see diff"
    status=1
  fi
  echo
  if [ -s "$workdir/names.diff" ]; then
    echo '```diff'
    cat "$workdir/names.diff"
    echo '```'
  fi
} > "$workdir/section.md"
cat "$workdir/section.md" >> "$report"
cat "$workdir/section.md"

if [ "$legacy_count" -eq 0 ]; then
  echo "No test cases found in the legacy report - refusing to call that parity." | tee -a "$report"
  status=1
fi
if [ "$legacy_failures" -ne 0 ] || [ "$gha_failures" -ne 0 ]; then
  status=1
fi
exit "$status"
