#!/usr/bin/env bash
set -Eeuo pipefail

LOG_FILE="${HEALTH_CHECK_LOG:-/home/pstrzelbicki/health-check.log}"
MAX_LOG_LINES=2000
DUCKDNS_HOST="sphomebudget.duckdns.org"
BACKUP_STATUS_FILE="${BACKUP_STATUS_FILE:-/home/pstrzelbicki/.local/share/homebudget/backup-status.json}"
MAX_BACKUP_AGE_DAYS=40

ok=1
details=()

note() {
  details+=("$1")
}

for service in budget-api.service expo-app.service nginx wg-quick@wg0 dnsmasq postgresql; do
  if ! systemctl is-active --quiet "$service"; then
    ok=0
    note "service down: $service ($(systemctl is-active "$service" || true))"
  fi
done

if ! curl --fail --silent --show-error --max-time 5 http://127.0.0.1:3000/test-db >/dev/null 2>&1; then
  ok=0
  note "API health check failed (http://127.0.0.1:3000/test-db)"
fi

if ! curl --fail --silent --show-error --max-time 5 http://127.0.0.1:8081/ >/dev/null 2>&1; then
  ok=0
  note "web health check failed (http://127.0.0.1:8081/)"
fi

public_ip="$(curl --silent --max-time 5 https://ifconfig.me || echo unknown)"
duckdns_ip="$(getent hosts "$DUCKDNS_HOST" 2>/dev/null | awk '{print $1}' | head -n1 || echo unknown)"
if [[ "$public_ip" != "unknown" && "$duckdns_ip" != "unknown" && "$public_ip" != "$duckdns_ip" ]]; then
  ok=0
  note "DuckDNS mismatch: public IP $public_ip, $DUCKDNS_HOST resolves to $duckdns_ip"
fi

disk_pct="$(df -P / | awk 'NR==2 {gsub("%","",$5); print $5}' || echo '')"
if [[ -n "$disk_pct" && "$disk_pct" -ge 90 ]]; then
  ok=0
  note "disk usage on / is ${disk_pct}%"
fi

if [[ -f "$BACKUP_STATUS_FILE" ]]; then
  last_backup_epoch="$(date -u -d "$(grep -o '"last_backup_utc": *"[^"]*"' "$BACKUP_STATUS_FILE" | grep -o '[0-9T:Z-]*Z')" +%s 2>/dev/null || echo 0)"
  now_epoch="$(date -u +%s)"
  if [[ "$last_backup_epoch" -gt 0 ]]; then
    age_days=$(( (now_epoch - last_backup_epoch) / 86400 ))
    if [[ "$age_days" -ge "$MAX_BACKUP_AGE_DAYS" ]]; then
      ok=0
      note "last successful database backup was ${age_days} days ago"
    fi
  else
    ok=0
    note "could not parse last_backup_utc from $BACKUP_STATUS_FILE"
  fi
else
  ok=0
  note "no backup status file found at $BACKUP_STATUS_FILE"
fi

timestamp="$(date -u +%Y-%m-%dT%H:%M:%SZ)"
uptime_summary="$(uptime -p || echo 'uptime unavailable')"

{
  if [[ "$ok" -eq 1 ]]; then
    echo "[$timestamp] OK - $uptime_summary"
  else
    echo "[$timestamp] WARN - $uptime_summary"
    for line in "${details[@]}"; do
      echo "  - $line"
    done
  fi
} >> "$LOG_FILE"

# Keep the log from growing without bound.
if [[ -f "$LOG_FILE" ]]; then
  tail -n "$MAX_LOG_LINES" "$LOG_FILE" > "$LOG_FILE.tmp" && mv "$LOG_FILE.tmp" "$LOG_FILE"
fi

[[ "$ok" -eq 1 ]]
