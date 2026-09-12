# Raspberry Pi Deployment Notes

## Expo web service
Use `expo-app.service` to run Expo web permanently on the Pi.

## Backend service
Use `budget-api.service` to run the API permanently.

## Monthly database backups

Monthly backups are handled by `budget-backup.service` and `budget-backup.timer`.

The backup job:

1. Reads the PostgreSQL connection string from `src/server/.env`.
2. Reads Google Drive upload settings from `/home/pstrzelbicki/.config/homebudget-backup.env`.
3. Runs `pg_dump`, compresses the dump, and uploads it with `rclone`.

For your folder link, use the folder ID from the URL and set it in `/home/pstrzelbicki/.config/homebudget-backup.env` like this:

```env
BACKUP_REMOTE=gdrive
BACKUP_TARGET_FOLDER_ID=1Ebw5jnLBUteo19BUChVJURB-bZWL7uQc
```

The `gdrive` name must already exist in the Pi's `rclone` config and point at your Google Drive account. The folder must be shared with that account or available in the configured drive.

After that, the timer can be enabled with the deployment script and will run once a month.

## Backup status in the app

The Settings screen reads the latest successful backup from the API and can trigger a manual run.

- `GET /backup-status` returns the latest recorded backup timestamp and filename.
- `POST /backup-now` starts the backup job immediately.

## Hourly maintenance health check

`health-check.service` and `health-check.timer` run `scripts/health-check.sh` once an hour (installed/enabled by the deployment script, same as the backup timer).

The check verifies, in order: `budget-api.service`, `expo-app.service`, `nginx`, `wg-quick@wg0`, `dnsmasq`, and `postgresql` are active; the API (`/test-db`) and web app respond locally; the Pi's current public IP matches what `sphomebudget.duckdns.org` resolves to (this is what silently broke the VPN in September 2026 — see repo memory); root disk usage is below 90%; and the last successful database backup (`~/.local/share/homebudget/backup-status.json`) is less than 40 days old.

Results are appended to `/home/pstrzelbicki/health-check.log` (one line per run, `OK` or `WARN` with details), auto-trimmed to the last 2000 lines. There is no push/email alerting — check the log over SSH:

```bash
tail -n 50 /home/pstrzelbicki/health-check.log
```

## Other stability hardening

- `src/server/journald-homebudget.conf` caps the systemd journal at 300M / 90 days (`/etc/systemd/journald.conf.d/homebudget.conf`) so logs can't quietly fill the SD card.
- `src/server/service-restart-override.conf` is installed as a drop-in for both `nginx` and `dnsmasq` (`Restart=on-failure`, matching `budget-api.service`/`expo-app.service`, which already had it) so they self-heal from a crash instead of staying down until someone notices.
- `wg-quick@wg0` is a one-shot "bring the interface up" unit with no persistent process to restart — connectivity regressions there (like the DuckDNS staleness incident) are caught by the hourly health check instead of a restart policy.

## Notes for `api.ts`
The web client now defaults to the current host for non-Android platforms, so when you open `http://192.168.2.107:8081` it will request `http://192.168.2.107:3000`.

## If the API is not on port 3000
Set `EXPO_PUBLIC_API_URL` in your environment or `.env` to the correct backend URL, for example:

```env
EXPO_PUBLIC_API_URL=http://192.168.2.107:3000
```
