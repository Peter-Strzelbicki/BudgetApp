#!/usr/bin/env bash
set -Eeuo pipefail

APP_ROOT="/home/pstrzelbicki/BudgetApp/BudgetApp"
SOURCE_ARCHIVE="${1:-/tmp/homebudget-source.tar.gz}"
WEB_ARCHIVE="${2:-/tmp/homebudget-web.tar.gz}"
WEB_SERVICE="expo-app.service"
API_SERVICE="budget-api.service"
BACKUP_SERVICE="budget-backup.service"
BACKUP_TIMER="budget-backup.timer"
HEALTH_CHECK_SERVICE="health-check.service"
HEALTH_CHECK_TIMER="health-check.timer"
NGINX_CONFIG="$APP_ROOT/src/server/homebudget-nginx.conf"

if [[ ! -f "$SOURCE_ARCHIVE" || ! -f "$WEB_ARCHIVE" ]]; then
  echo "Deployment archives are missing." >&2
  exit 1
fi

mkdir -p "$APP_ROOT"
tar -xzf "$SOURCE_ARCHIVE" -C "$APP_ROOT"

# Windows-authored scripts sometimes carry CRLF line endings, which breaks bash execution.
find "$APP_ROOT/scripts" -name '*.sh' -exec sed -i 's/\r$//' {} +

cd "$APP_ROOT"

LOCKFILE_HASH_FILE="$APP_ROOT/.deploy-lockfile-hash"
CURRENT_LOCKFILE_HASH=$(cat package-lock.json src/server/package-lock.json | sha256sum | awk '{print $1}')
if [[ -f "$LOCKFILE_HASH_FILE" && "$(cat "$LOCKFILE_HASH_FILE")" == "$CURRENT_LOCKFILE_HASH" ]]; then
  echo "Dependencies unchanged; skipping npm install."
else
  npm install --omit=dev --no-audit --no-fund
  npm --prefix src/server install --omit=dev --no-audit --no-fund
  echo "$CURRENT_LOCKFILE_HASH" > "$LOCKFILE_HASH_FILE"
fi

sudo systemd-analyze verify "$APP_ROOT/expo-app.service" "$APP_ROOT/src/server/budget-api.service" "$APP_ROOT/src/server/$BACKUP_SERVICE" "$APP_ROOT/src/server/$BACKUP_TIMER" "$APP_ROOT/src/server/$HEALTH_CHECK_SERVICE" "$APP_ROOT/src/server/$HEALTH_CHECK_TIMER"
sudo install -m 644 "$APP_ROOT/expo-app.service" "/etc/systemd/system/$WEB_SERVICE"
sudo install -m 644 "$APP_ROOT/src/server/budget-api.service" "/etc/systemd/system/$API_SERVICE"
sudo install -m 644 "$APP_ROOT/src/server/$BACKUP_SERVICE" "/etc/systemd/system/$BACKUP_SERVICE"
sudo install -m 644 "$APP_ROOT/src/server/$BACKUP_TIMER" "/etc/systemd/system/$BACKUP_TIMER"
sudo install -m 644 "$APP_ROOT/src/server/$HEALTH_CHECK_SERVICE" "/etc/systemd/system/$HEALTH_CHECK_SERVICE"
sudo install -m 644 "$APP_ROOT/src/server/$HEALTH_CHECK_TIMER" "/etc/systemd/system/$HEALTH_CHECK_TIMER"
sudo install -m 644 "$NGINX_CONFIG" /etc/nginx/sites-available/homebudget

# Cap journal disk usage and let nginx/dnsmasq self-heal like the app services already do.
sudo install -D -m 644 "$APP_ROOT/src/server/journald-homebudget.conf" /etc/systemd/journald.conf.d/homebudget.conf
sudo install -D -m 644 "$APP_ROOT/src/server/service-restart-override.conf" /etc/systemd/system/nginx.service.d/override.conf
sudo install -D -m 644 "$APP_ROOT/src/server/service-restart-override.conf" /etc/systemd/system/dnsmasq.service.d/override.conf
sudo systemctl restart systemd-journald
sudo ln -sf /etc/nginx/sites-available/homebudget /etc/nginx/sites-enabled/homebudget
sudo rm -f /etc/nginx/sites-enabled/default
sudo nginx -t

rm -rf "$APP_ROOT/dist.new"
mkdir "$APP_ROOT/dist.new"
tar -xzf "$WEB_ARCHIVE" -C "$APP_ROOT/dist.new"

sudo systemctl stop "$WEB_SERVICE"
rm -rf "$APP_ROOT/dist.old"
if [[ -d "$APP_ROOT/dist" ]]; then
  mv "$APP_ROOT/dist" "$APP_ROOT/dist.old"
fi
mv "$APP_ROOT/dist.new" "$APP_ROOT/dist"

rollback_web() {
  sudo systemctl stop "$WEB_SERVICE" || true
  rm -rf "$APP_ROOT/dist"
  if [[ -d "$APP_ROOT/dist.old" ]]; then
    mv "$APP_ROOT/dist.old" "$APP_ROOT/dist"
  fi
  sudo systemctl start "$WEB_SERVICE" || true
}

trap rollback_web ERR
sudo systemctl daemon-reload
sudo systemctl enable "$WEB_SERVICE" "$API_SERVICE" "$BACKUP_TIMER" "$HEALTH_CHECK_TIMER" >/dev/null
sudo systemctl restart "$API_SERVICE" "$WEB_SERVICE"
sudo systemctl start "$BACKUP_TIMER" "$HEALTH_CHECK_TIMER"
sudo systemctl reload nginx

curl --fail --silent --show-error \
  --retry 15 --retry-connrefused --retry-delay 1 \
  --max-time 15 http://127.0.0.1:3000/test-db >/dev/null
curl --fail --silent --show-error \
  --retry 10 --retry-connrefused --retry-delay 1 \
  --max-time 15 http://127.0.0.1:8081/ >/dev/null
curl --fail --silent --show-error \
  --max-time 15 http://127.0.0.1:8081/budget >/dev/null
curl --fail --silent --show-error \
  --max-time 15 -H 'Host: homebudget' http://127.0.0.1/api/test-db >/dev/null

trap - ERR
rm -rf "$APP_ROOT/dist.old"
rm -f "$SOURCE_ARCHIVE" "$WEB_ARCHIVE" /tmp/deploy-pi-remote.sh

echo "HomeBudget deployment complete."
systemctl is-active "$WEB_SERVICE" "$API_SERVICE" "$BACKUP_TIMER" nginx