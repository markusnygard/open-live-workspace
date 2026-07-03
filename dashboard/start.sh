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

# Open in new browser window (prefer Chromium/Chrome, fall back to xdg-open)
URL="http://localhost:${PORT}"
if command -v google-chrome >/dev/null 2>&1; then
  google-chrome --new-window --app="$URL" 2>/dev/null &
elif command -v chromium-browser >/dev/null 2>&1; then
  chromium-browser --new-window --app="$URL" 2>/dev/null &
elif command -v brave-browser >/dev/null 2>&1; then
  brave-browser --new-window --app="$URL" 2>/dev/null &
elif command -v firefox >/dev/null 2>&1; then
  firefox --new-window "$URL" 2>/dev/null &
elif command -v xdg-open >/dev/null 2>&1; then
  xdg-open "$URL" 2>/dev/null &
elif command -v open >/dev/null 2>&1; then
  open "$URL" 2>/dev/null &
elif command -v start >/dev/null 2>&1; then
  start "$URL" 2>/dev/null &
fi
