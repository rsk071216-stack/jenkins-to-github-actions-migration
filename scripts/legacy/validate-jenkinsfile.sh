#!/usr/bin/env bash
# Structural checks for the legacy Jenkinsfile that a Groovy parse cannot catch.
# Complements GroovyParseCheck.java. Fails fast with a readable report.
set -euo pipefail

jenkinsfile=${1:-legacy/Jenkinsfile}
extract="$(dirname "$0")/jenkinsfile-extract.sh"
failures=0

pass() { printf 'PASS  %s\n' "$1"; }
fail() { printf 'FAIL  %s\n' "$1"; failures=$((failures + 1)); }

# 1. Declarative skeleton
for directive in "pipeline {" "agent {" "stages {" "post {"; do
  if grep -qF "$directive" "$jenkinsfile"; then pass "has '${directive}'"; else fail "missing '${directive}'"; fi
done

# 2. Every stage the migration maps to a GitHub Actions job must exist (see docs/concept-mapping.md)
required_stages=(
  "Checkout" "Build" "Unit Test" "SonarQube Analysis" "Quality Gate" "Docker Build"
  "Trivy Scan" "Push" "Deploy Staging" "Approval" "Deploy Production"
)
for stage in "${required_stages[@]}"; do
  if grep -qF "stage('${stage}')" "$jenkinsfile"; then pass "stage '${stage}'"; else fail "stage '${stage}' not found"; fi
done

# 3. Balanced braces (cheap guard against truncated edits)
open=$(tr -cd '{' < "$jenkinsfile" | wc -c)
close=$(tr -cd '}' < "$jenkinsfile" | wc -c)
if [ "$open" -eq "$close" ]; then pass "balanced braces (${open})"; else fail "unbalanced braces: ${open} '{' vs ${close} '}'"; fi

# 4. The commands replayed by the parity job must be extractable
for stage in "Unit Test" "Docker Build"; do
  if cmd=$(bash "$extract" "$jenkinsfile" stage-sh "$stage") && [ -n "$cmd" ]; then
    pass "parity can extract '${stage}' command: ${cmd}"
  else
    fail "parity cannot extract the sh step of stage '${stage}'"
  fi
done
image=$(bash "$extract" "$jenkinsfile" agent-image || true)
if [[ "$image" =~ ^[a-z0-9./-]+:[0-9]+\.[0-9]+\.[0-9]+ ]]; then
  pass "agent image pinned to an exact version: ${image}"
else
  fail "agent image must be pinned to an exact version (found '${image}')"
fi

# 5. No secret material committed in the legacy files
if grep -nEi '(password|secret|token)[[:space:]]*=[[:space:]]*["'\''][^"'\''$]{6,}' "$jenkinsfile" legacy/shared-library/vars/*.groovy; then
  fail "possible hard-coded secret found above"
else
  pass "no hard-coded secret literals"
fi

echo
if [ "$failures" -gt 0 ]; then
  echo "${failures} check(s) failed."
  exit 1
fi
echo "All structural checks passed."
