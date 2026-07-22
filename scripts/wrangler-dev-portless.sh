#!/bin/sh

set -eu

if [ -z "${PORT:-}" ]; then
  echo "PORT is required for Portless Wrangler development" >&2
  exit 1
fi

inspector_port="${WRANGLER_INSPECTOR_PORT:-0}"
case "$inspector_port" in
  '' | *[!0-9]*)
    echo "WRANGLER_INSPECTOR_PORT must be an integer from 0 to 65535" >&2
    exit 1
    ;;
esac
if [ "$inspector_port" -gt 65535 ]; then
  echo "WRANGLER_INSPECTOR_PORT must be an integer from 0 to 65535" >&2
  exit 1
fi

exec wrangler dev \
  --port "$PORT" \
  --inspector-port "$inspector_port" \
  --env-file .dev.vars.example \
  --env-file .env.local
