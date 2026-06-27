#!/usr/bin/env bash
DIR="$(cd "$(dirname "$0")" && pwd)"
PORT="${PORT:-3100}"

# Kill existing instance on the port (Linux/macOS)
command -v fuser >/dev/null 2>&1 && fuser -k "${PORT}/tcp" 2>/dev/null
command -v lsof  >/dev/null 2>&1 && lsof -ti "tcp:${PORT}" | xargs kill 2>/dev/null
sleep 0.5

"${DIR}/node_modules/.bin/node" 2>/dev/null || true
node "${DIR}/server.mjs" &
sleep 1

# Open browser
if command -v xdg-open >/dev/null 2>&1; then
  xdg-open "http://localhost:${PORT}" 2>/dev/null &
elif command -v open >/dev/null 2>&1; then
  open "http://localhost:${PORT}" 2>/dev/null &
elif command -v start >/dev/null 2>&1; then
  start "http://localhost:${PORT}" 2>/dev/null &
fi
