#!/usr/bin/env bash
# Vérifie le résultat de `make build` pour la PWA.
# DIST peut être surchargé (ex. pour tester l'échec sur une copie).
set -u
cd "$(dirname "$0")/.."
D=${DIST:-dist}
fail=0
ok() { echo "ok   $1"; }
ko() { echo "FAIL $1"; fail=1; }
check() { if eval "$2"; then ok "$1"; else ko "$1"; fi; }

for f in manifest.webmanifest sw.js icons/icon-192.png icons/icon-512.png icons/maskable-512.png; do
  check "$f présent" "[ -s '$D/$f' ]"
done

m=$(tr -d ' \n' < "$D/manifest.webmanifest" 2>/dev/null)
check 'display standalone' "[[ '$m' == *'\"display\":\"standalone\"'* ]]"
check 'theme_color #121212' "[[ '$m' == *'\"theme_color\":\"#121212\"'* ]]"
check 'icône purpose maskable' "[[ '$m' == *'\"purpose\":\"maskable\"'* ]]"

check 'sw.js sans spotify' "! grep -qi spotify '$D/sw.js'"
check 'sw.js sans audioscrobbler' "! grep -qi audioscrobbler '$D/sw.js'"
check 'sw.js fallback index.html' "grep -q 'createHandlerBoundToURL(\"index.html\")' '$D/sw.js'"
check 'sw.js skipWaiting' "grep -q skipWaiting '$D/sw.js'"
check 'sw.js clientsClaim' "grep -q clientsClaim '$D/sw.js'"

for spec in icon-192:192 icon-512:512 maskable-512:512; do
  n=${spec%%:*}; s=${spec##*:}
  check "$n.png PNG ${s}x${s}" "file '$D/icons/$n.png' | grep -q 'PNG image data, $s x $s'"
done
exit $fail
