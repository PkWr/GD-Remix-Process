#!/bin/bash
# Quick sync: stage everything, commit, push.
# Usage: ./push-to-github.sh "commit message here"
# If no message is given, falls back to a timestamped default.
set -e
cd "$(dirname "$0")"

MSG="${1:-Update $(date '+%Y-%m-%d %H:%M')}"

git add -A
git commit -m "$MSG" || echo "(nothing to commit)"
git push
