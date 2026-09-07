#!/bin/bash
# 대시보드 서버 + (git 저장소면) 코드 자동 동기화를 함께 띄운다.
# 자동 푸시를 끄고 싶으면: NO_AUTOSYNC=1 ./start.sh
cd "$(dirname "$0")"
PORT="${PORT:-5173}"
PIDS=()

node server.mjs & PIDS+=($!)

if [ -z "$NO_AUTOSYNC" ] && [ -d .git ] && git remote get-url origin >/dev/null 2>&1; then
  node autosync.mjs & PIDS+=($!)
fi

trap 'kill "${PIDS[@]}" 2>/dev/null' EXIT INT TERM
sleep 1
open "http://localhost:$PORT"
wait
