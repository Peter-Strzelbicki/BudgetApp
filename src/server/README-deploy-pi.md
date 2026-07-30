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

## Notes for `api.ts`
The web client now defaults to the current host for non-Android platforms, so when you open `http://192.168.2.107:8081` it will request `http://192.168.2.107:3000`.

## If the API is not on port 3000
Set `EXPO_PUBLIC_API_URL` in your environment or `.env` to the correct backend URL, for example:

```env
EXPO_PUBLIC_API_URL=http://192.168.2.107:3000
```
