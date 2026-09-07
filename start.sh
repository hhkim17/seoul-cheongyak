#!/bin/bash
cd "$(dirname "$0")"
PORT="${PORT:-5173}"
node server.mjs &
SERVER_PID=$!
sleep 1
open "http://localhost:$PORT"
trap "kill $SERVER_PID 2>/dev/null" EXIT
wait $SERVER_PID
