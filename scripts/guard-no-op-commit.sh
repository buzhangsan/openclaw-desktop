#!/bin/bash
# scripts/guard-no-op-commit.sh
# Prevents committing docs-only changes that have no substantive diff.
# Used by the 10-minute task loop to avoid spamming "blocker refresh" commits.
#
# Usage: source this before `git commit` in the 10-min loop.
#   ./scripts/guard-no-op-commit.sh && git commit -m "..."
# Exit 1 (skip commit) if staged changes are trivial (only whitespace/timestamp diffs in docs).

set -euo pipefail

STAGED_FILES=$(git diff --cached --name-only)

if [ -z "$STAGED_FILES" ]; then
  echo "[guard] No staged files — skipping commit."
  exit 1
fi

# Check if ALL staged files are docs
ALL_DOCS=true
for f in $STAGED_FILES; do
  case "$f" in
    docs/*|*.md) ;;
    *) ALL_DOCS=false; break ;;
  esac
done

if [ "$ALL_DOCS" = "true" ]; then
  # Check if the actual diff content is substantive
  DIFF_LINES=$(git diff --cached --unified=0 -- $STAGED_FILES \
    | grep '^[+-]' \
    | grep -v '^[+-][+-][+-]' \
    | grep -v '^[+-]\s*$' \
    | grep -v '^[+-].*blocker refresh' \
    | grep -v '^[+-].*no change' \
    | grep -v '^[+-].*same status' \
    | wc -l)

  if [ "$DIFF_LINES" -lt 3 ]; then
    echo "[guard] Only trivial doc changes detected ($DIFF_LINES substantive lines) — skipping commit."
    exit 1
  fi
fi

echo "[guard] Substantive changes found — proceeding."
exit 0
