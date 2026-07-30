#!/usr/bin/env bash
set -euo pipefail

capsule=${1:?"usage: $0 specs/epics/<capsule>/"}
critical=0
high=0
med=0

report() {
  local level=$1 message=$2
  printf '%s: %s\n' "$level" "$message"
  case "$level" in
    CRITICAL) critical=$((critical + 1)) ;;
    HIGH) high=$((high + 1)) ;;
    MED) med=$((med + 1)) ;;
  esac
}

[[ -f "$capsule/epic.yaml" ]] || report CRITICAL "missing epic.yaml"

for story in "$capsule"/e??s??-*.md; do
  [[ -e "$story" ]] || { report CRITICAL "no story specs found"; break; }
  id=$(basename "$story" | grep -oE '^e[0-9]{2}s[0-9]{2}')
  tasks="$capsule/${id}-tasks.yaml"
  [[ -f "$tasks" ]] || { report CRITICAL "$id has no tasks YAML"; continue; }
  grep -q "^- \?\?" "$story" 2>/dev/null && report MED "$id contains unresolved checklist markers"
  grep -q '^## 17\. Acceptance Criteria' "$story" || report HIGH "$id lacks section 17 acceptance criteria"
  grep -q '^## 18\. Implementation Steps' "$story" || report HIGH "$id lacks implementation steps"
  grep -q '#### ADDED:' "$story" || report HIGH "$id lacks greenfield ADDED requirement tags"
  if grep -Eq '^#### (MODIFIED|REMOVED|RENAMED):' "$story"; then
    grep -q '^\*\*Before:\*\*' "$story" || report HIGH "$id delta lacks Before"
    grep -q '^\*\*After:\*\*' "$story" || report HIGH "$id delta lacks After"
  fi
  grep -q "story_id: $id" "$tasks" || report CRITICAL "$id task file has wrong story_id"
  grep -q '^status: failing$' "$tasks" || report HIGH "$id task ledger must start failing"
  grep -q '^    verify:' "$tasks" || report CRITICAL "$id has no task verify commands"
  grep -q '^    risk: P[0-3]$' "$tasks" || report HIGH "$id has missing/invalid task risk"
  grep -q '^    status: failing$' "$tasks" || report HIGH "$id tasks must start failing"
  grep -q '^    allure:' "$tasks" || report HIGH "$id tasks lack Allure metadata"
  if grep -Eq '^    security: (medium|high)$' "$tasks"; then
    grep -q 'no new security findings in affected paths' "$tasks" || report HIGH "$id security tasks lack affected-path security evidence"
  fi
  grep -q "$id" "$capsule/epic.yaml" || report CRITICAL "$id missing from epic manifest"
done

for tasks in "$capsule"/e??s??-tasks.yaml; do
  [[ -e "$tasks" ]] || continue
  id=$(basename "$tasks" -tasks.yaml)
  compgen -G "$capsule/${id}-*.md" >/dev/null || report CRITICAL "$id task file has no story spec"
done

printf 'SUMMARY: CRITICAL=%d HIGH=%d MED=%d\n' "$critical" "$high" "$med"
(( critical == 0 && high == 0 ))
