# Android App

Call Memo includes a Capacitor Android wrapper around the hosted web app. The Android experience adds folder sync and native helpers, but most application logic still runs in the Next.js server.

## Runtime Model

The Android project does not bundle the full app for offline operation. Instead, `capacitor.config.ts` points the WebView at a remote server:

- development URL: `http://10.0.0.169:9000`
- production URL: `https://vosift.virusz4274.tech`

Before local device testing, update the development URL to a LAN address the phone can reach.
Because the WebView depends on the remote Next.js app, Server Actions, auth, and uploads only work while that server is reachable from the device.

## Prerequisites

- Android Studio or Android SDK CLI
- Node.js 20+
- a running Call Memo web app reachable from the device
- Firebase and R2 configured for the target environment

## Setup

1. Install dependencies:

```bash
npm install
```

2. Start the web app:

```bash
npm run dev
```

3. Update the development `devUrl` in [capacitor.config.ts](../capacitor.config.ts).

4. Sync Capacitor:

```bash
npm run cap:sync
```

5. Open Android Studio:

```bash
npx cap open android
```

## Development Loop

For most product work:

- keep `npm run dev` running
- edit the web app as usual
- re-run `npm run cap:sync` when Capacitor config, plugins, or Android assets change

For a production-style sync:

```bash
npm run build
npm run cap:prod
```

## Android-Only Features

The Android wrapper adds:

- `/android-sync` for device-folder import
- native background sync support
- native folder scan helpers
- device-side sync-state persistence

When `/android-sync` is opened in a normal browser, the page shows an Android-only message and links back to `/upload`.

## Mobile Sync Flow

Current mobile sync endpoints:

- `POST /api/mobile/sync-session`
- `POST /api/mobile/direct-upload/init`
- `POST /api/mobile/direct-upload/complete`

Flow:

1. The signed-in user requests a mobile sync token.
2. Android uses that token to initialize direct uploads.
3. Files upload to R2.
4. Android calls the completion route.
5. The server verifies the upload and creates the recording.

The token is signed with `MOBILE_SYNC_SESSION_SECRET` when present, otherwise it falls back to the upload/share secret chain. It currently expires after `24 hours`.

## Folder Sync Behavior

The current Android sync UI supports:

- picking a folder
- recursive file discovery
- pending/synced tabs
- search and sort
- per-file selection
- foreground sync
- background sync with progress and cancellation
- clearing local sync history

Supported media formats match the web uploader: `mp3`, `wav`, `m4a`, `mp4`, and `webm`.

## Firebase And Google Sign-In

For native Google sign-in and session sync, make sure you have:

- `NEXT_PUBLIC_GOOGLE_WEB_CLIENT_ID`
- Firebase Auth configured for the target environment
- the Android package `com.coarde.vosift`
- the correct Android SHA fingerprints in Firebase/Google Cloud
- authorized domains that match the hosted app origin

The Capacitor Social Login plugin is currently configured only for Google.

## Build APK

In Android Studio:

- `Build` -> `Build APK(s)`

Or with the CLI:

```bash
cd android
./gradlew assembleDebug
```

## Troubleshooting

- Device cannot reach dev server: fix the LAN IP, firewall, or network mismatch.
- HTTP blocked on device: keep `cleartext` enabled only for development.
- R2 upload failures: verify bucket CORS for the app origin and `PUT`, `GET`, `HEAD`.
- Google sign-in issues: re-check SHA fingerprints and authorized domains.
- Folder scan or background sync issues: inspect the native plugin configuration and the Android app logs.
- Stale build behavior: rerun `npm run cap:sync` and rebuild in Android Studio.
