# Raspberry Pi Deployment Notes

## Expo web service
Use `expo-app.service` to run Expo web permanently on the Pi.

## Backend service
Use `budget-api.service` to run the API permanently.

## Notes for `api.ts`
The web client now defaults to the current host for non-Android platforms, so when you open `http://192.168.2.107:8081` it will request `http://192.168.2.107:3000`.

## If the API is not on port 3000
Set `EXPO_PUBLIC_API_URL` in your environment or `.env` to the correct backend URL, for example:

```env
EXPO_PUBLIC_API_URL=http://192.168.2.107:3000
```
