#!/usr/bin/env bash
set -Eeuo pipefail

APP_ROOT="/home/pstrzelbicki/BudgetApp/BudgetApp"
DB_ENV_FILE="$APP_ROOT/src/server/.env"
BACKUP_ENV_FILE="${BACKUP_ENV_FILE:-/home/pstrzelbicki/.config/homebudget-backup.env}"
BACKUP_DIR="${BACKUP_LOCAL_DIR:-$APP_ROOT/backups}"
BACKUP_STATUS_FILE="${BACKUP_STATUS_FILE:-/home/pstrzelbicki/.local/share/homebudget/backup-status.json}"

if [[ ! -f "$DB_ENV_FILE" ]]; then
  echo "Missing database env file: $DB_ENV_FILE" >&2
  exit 1
fi

set -a
source "$DB_ENV_FILE"
set +a

if [[ -f "$BACKUP_ENV_FILE" ]]; then
  set -a
  source "$BACKUP_ENV_FILE"
  set +a
fi

: "${DB_CONNECTION_STRING:?DB_CONNECTION_STRING must be set in $DB_ENV_FILE}"
: "${BACKUP_REMOTE:?BACKUP_REMOTE must be set in $BACKUP_ENV_FILE}"

if ! command -v pg_dump >/dev/null 2>&1; then
  echo "pg_dump is required but not installed." >&2
  exit 1
fi

if ! command -v gzip >/dev/null 2>&1; then
  echo "gzip is required but not installed." >&2
  exit 1
fi

if ! command -v rclone >/dev/null 2>&1; then
  echo "rclone is required but not installed." >&2
  exit 1
fi

mkdir -p "$BACKUP_DIR"

timestamp="$(date -u +%Y-%m-%dT%H-%M-%SZ)"
backup_name="homebudget-${timestamp}.sql.gz"
backup_path="$BACKUP_DIR/$backup_name"

cleanup() {
  rm -f "$backup_path"
}

trap cleanup ERR INT TERM

echo "Creating database backup at $backup_path"
pg_dump "$DB_CONNECTION_STRING" --no-owner --no-acl | gzip -9 > "$backup_path"

if [[ -n "${BACKUP_TARGET_FOLDER_ID:-}" ]]; then
  echo "Uploading backup to Google Drive folder id $BACKUP_TARGET_FOLDER_ID"
  rclone copyto "$backup_path" "$BACKUP_REMOTE:$backup_name" --drive-root-folder-id "$BACKUP_TARGET_FOLDER_ID"
else
  : "${BACKUP_TARGET:?BACKUP_TARGET must be set in $BACKUP_ENV_FILE when BACKUP_TARGET_FOLDER_ID is not provided}"
  echo "Uploading backup to $BACKUP_TARGET/$backup_name"
  rclone copyto "$backup_path" "$BACKUP_TARGET/$backup_name"
fi

backup_size_bytes="$(stat -c '%s' "$backup_path")"
mkdir -p "$(dirname "$BACKUP_STATUS_FILE")"
cat > "$BACKUP_STATUS_FILE" <<EOF
{
  "last_backup_utc": "$(date -u +%Y-%m-%dT%H:%M:%SZ)",
  "backup_name": "$backup_name",
  "backup_size_bytes": ${backup_size_bytes},
  "backup_target": "${BACKUP_TARGET_FOLDER_ID:-${BACKUP_TARGET:-}}"
}
EOF

rm -f "$backup_path"
trap - ERR INT TERM

echo "Backup completed successfully."