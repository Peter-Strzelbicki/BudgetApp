# HomeBudget

Private household budgeting app built with Expo SDK 57, Expo Router, Express, and PostgreSQL.

## Local development

Install frontend and backend dependencies:

```powershell
npm install
npm --prefix src/server install
```

Start the frontend and API in separate terminals:

```powershell
npm run web
npm --prefix src/server start
```

The API reads its database configuration from `src/server/.env`. Do not commit that file.

## Validation

```powershell
npx tsc --noEmit
npm --prefix src/server test
node --check src/server/server.js
npx expo export --platform web --clear
```

## Raspberry Pi deployment

Use the deployment pipeline rather than copying files or restarting services manually:

```powershell
powershell -NoProfile -ExecutionPolicy Bypass -File scripts/deploy-pi.ps1
```

See [src/server/README-deploy-pi.md](src/server/README-deploy-pi.md) for service details.