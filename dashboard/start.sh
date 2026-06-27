#!/usr/bin/env bash
DIR="$(cd "$(dirname "$0")" && pwd)"
PORT="${PORT:-3100}"

fuser -k "${PORT}/tcp" 2>/dev/null
sleep 0.5

nohup node "${DIR}/server.mjs" > /dev/null 2>&1 &
sleep 1

if command -v xdg-open &>/dev/null; then
  xdg-open "http://localhost:${PORT}" 2>/dev/null &
elif command -v open &>/dev/null; then
  open "http://localhost:${PORT}" 2>/dev/null &
fi
