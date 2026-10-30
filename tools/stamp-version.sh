#!/bin/sh
# Writes version.js with the time of this commit, so the Info panel (D) and the
# phone remote can show which build they are really running.
cd "$(dirname "$0")/.." || exit 0
date '+window.SPOT_BUILD = "%d %b %Y %H:%M";' > version.js
