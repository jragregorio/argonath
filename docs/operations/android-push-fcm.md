# Parent Android push (FCM)

Warden uses **Supabase** for the database and **Firebase Cloud Messaging** only to deliver lock-screen notifications to the parent Android app.

## What must be configured

1. **Client** — `apps/mobile/android/app/google-services.json` (Android app `com.warden.gard`)
2. **Server** — Firebase **service account** env on the Next.js host (local + Vercel)
3. **Database** — `PushToken` model (`npm run db:push`)
4. **Deploy** — web app must be deployed so the Capacitor WebView can register + sync tokens (`NativePushBootstrap` / `PushTokenSync`)

## Create a service account (Firebase Console)

1. Open [Firebase Console](https://console.firebase.google.com/) → project **WardenGard**
2. Gear → **Project settings** → **Service accounts**
3. Click **Generate new private key** → download the JSON
4. On Vercel (and local `.env.local`), set **one** of:

**Option A (preferred on Vercel)** — paste the whole JSON as a single line:

```bash
FIREBASE_SERVICE_ACCOUNT_JSON={"type":"service_account","project_id":"...","private_key":"-----BEGIN PRIVATE KEY-----\n...\n-----END PRIVATE KEY-----\n","client_email":"..."}
```

**Option B** — split fields:

```bash
FIREBASE_PROJECT_ID=...
FIREBASE_CLIENT_EMAIL=...@....iam.gserviceaccount.com
FIREBASE_PRIVATE_KEY="-----BEGIN PRIVATE KEY-----\n...\n-----END PRIVATE KEY-----\n"
```

Never commit the service account file or put it in git.

## After env + db push + web deploy

1. Open the Android app, sign in, open the dashboard once (uploads FCM token)
2. Background or close the app
3. From the child PC lock screen, request more time
4. Parent phone should show: **More time requested**

Without the service account env, extension requests still work in the dashboard (Realtime) but no system notification is sent.

## Device offline notifications

Offline push is **not** sent from the agent. A Vercel cron hits `/api/cron/device-offline` every minute (`CRON_SECRET` auth, same as cleanup). The server finds paired devices whose `lastSeenAt` is older than **120 seconds** (`DEVICE_OFFLINE_PUSH_THRESHOLD_SECONDS` in `@warden/shared`) and notifies parents once per offline episode (`Device.offlineNotifiedAt` dedup; cleared on agent heartbeat).

Manual test after deploy:

```bash
curl -H "Authorization: Bearer $CRON_SECRET" https://<your-host>/api/cron/device-offline
```
