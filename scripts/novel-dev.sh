#!/bin/bash
set -euo pipefail
ROOT_DIR="$(cd "$(dirname "$0")/.." && pwd)"
API_PORT="${NOVEL_API_PORT:-8787}"
WEB_PORT="${NOVEL_WEB_PORT:-5175}"

cleanup() {
  if [ -n "${API_PID:-}" ]; then kill "$API_PID" 2>/dev/null || true; fi
  if [ -n "${WEB_PID:-}" ]; then kill "$WEB_PID" 2>/dev/null || true; fi
}
trap cleanup EXIT INT TERM

cd "$ROOT_DIR"
# F074 后 API 只放行白名单内的跨域来源。这里必须把 Web 端口一并传给 API 进程，
# 否则自定义 NOVEL_WEB_PORT（如 6000）后，前端请求会被 API 以 403 拒绝。
NOVEL_API_PORT="$API_PORT" NOVEL_WEB_PORT="$WEB_PORT" node server/novel-api.js &
API_PID=$!
NOVEL_WEB_PORT="$WEB_PORT" node server/web-server.js &
WEB_PID=$!

wait
