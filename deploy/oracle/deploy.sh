#!/usr/bin/env bash
# Deploy the latest master: pull, rebuild, restart, check health.
#   bash /opt/axrflows/deploy/oracle/deploy.sh
set -euo pipefail

APP_DIR=/opt/axrflows
cd "$APP_DIR"

if [ ! -s backend/.env.production ]; then
  echo "backend/.env.production is empty. Paste the production variables first." >&2
  exit 1
fi

echo "==> Pulling the latest code"
git pull --ff-only

cd deploy/oracle
echo "==> Building and starting (the first build takes a few minutes)"
docker compose up -d --build --remove-orphans
docker image prune -f >/dev/null

DOMAIN=$(grep -E '^DOMAIN=' .env | cut -d= -f2-)
echo "==> Waiting for the backend to report healthy"
for i in $(seq 1 30); do
  if docker compose exec -T backend wget -qO- http://127.0.0.1:8000/health >/dev/null 2>&1; then
    echo "Backend is up. Public URL: https://$DOMAIN/health"
    echo "(The HTTPS certificate is issued on the first request and can take up to a minute.)"
    exit 0
  fi
  sleep 5
done

echo "The backend did not become healthy. Last log lines:" >&2
docker compose logs --tail 50 backend >&2
exit 1
