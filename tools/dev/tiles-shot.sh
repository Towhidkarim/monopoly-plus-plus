#!/usr/bin/env sh
# Close-up of board tiles in Orca with the DOM UI hidden: tools/dev/tiles-shot.sh <name> <space> [zoom] [night 0|1]
# PORT=5199 picks another dev server. Opens its own tab on the game demo, focuses the camera, saves .shots/<name>.png, closes the tab.
name=${1:-tiles}; space=${2:-5}; zoom=${3:-2.4}; night=${4:-0}
port=${PORT:-5173}
page=$(orca tab create --url "http://localhost:$port/?demo=play&seed=7" --json | grep -o '"browserPageId": "[^"]*"' | cut -d'"' -f4)
sleep 5
orca tab switch --page "$page" >/dev/null
orca eval --page "$page" --json --expression "(()=>{for(const el of document.querySelectorAll('body *')){if(el.tagName!=='CANVAS'&&!el.querySelector('canvas'))el.style.visibility='hidden'};const b=skylineStore.board;b.setNight($night,true);b.focus($space,$zoom,true);return 1})()" >/dev/null
sleep 1.5
pnpm -s shot "$name" --page "$page" >/dev/null
orca tab close --page "$page" --json >/dev/null
echo ".shots/$name.png"
