#!/usr/bin/env sh
# Fails with a helpful message if a sibling repo that docker-compose builds is missing.
set -e
cd "$(dirname "$0")/.."
[ -f .env ] && . ./.env
missing=0
for pair in "UI_PATH:${UI_PATH:-../r1}" "ORDERS_API_PATH:${ORDERS_API_PATH:-../r2}" "CATALOG_API_PATH:${CATALOG_API_PATH:-../r3}" "JOBS_PATH:${JOBS_PATH:-../r4}" "USERS_API_PATH:${USERS_API_PATH:-../r6}"; do
  name=${pair%%:*}; path=${pair#*:}
  if [ ! -f "$path/Dockerfile" ]; then
    echo "Missing $path (set $name in .env to point somewhere else)"
    missing=1
  fi
done
[ $missing -eq 0 ] && echo "All service repos found."
exit $missing
