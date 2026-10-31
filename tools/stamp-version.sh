#!/bin/sh
# Run by the pre-commit hook. Two jobs, so neither can drift:
#  1. version.js gets the time of this commit (Info panel D, phone remote).
#  2. The version on the start screen (index.html, #spotVersion) is set from the
#     newest entry at the top of changelog.html, so the changelog is the one place
#     a release number is written.
cd "$(dirname "$0")/.." || exit 0
date '+window.SPOT_BUILD = "%d %b %Y %H:%M";' > version.js

ver=$(grep -o '<h2>v[0-9][0-9.]*' changelog.html | head -1 | sed 's/<h2>//')
if [ -n "$ver" ]; then
  sed "s|\(id=\"spotVersion\"[^>]*>\)v[0-9][0-9.]*|\1$ver|" index.html > index.html.tmp && mv index.html.tmp index.html
fi
