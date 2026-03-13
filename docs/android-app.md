# Android App

Call Memo includes a Capacitor Android wrapper for the web app. The Android experience adds an `android-sync` workflow while still relying on the hosted Next.js app for most application logic.

## Important Architecture Note

The Android wrapper is configured to load a remote server URL, not a fully bundled standalone mobile UI.

Current behavior in `capacitor.config.ts`:

- development uses `http://10.0.0.169:9000`
- production uses `https://vosift.virusz4274.tech`

Before local device testing, update the development URL to a reachable LAN IP for the machine running `npm run dev`.

## Prerequisites

- Android Studio or Android SDK CLI
- Node.js 20+
- A running Call Memo web app reachable from the Android device

## Setup

1. Install dependencies:

```bash
npm install
```

2. Start the web app on your development machine:

```bash
npm run dev
```

3. Update `capacitor.config.ts` so the development `server.url` points to your machine's LAN IP on port `9000`.

4. Sync Capacitor:

```bash
npm run cap:sync
```

5. Open the Android project:

```bash
npx cap open android
```

## Development Loop

For most UI and server work:

- keep `npm run dev` running
- update code in the web app
- re-run `npm run cap:sync` when Capacitor config, plugins, or Android assets change

Use a production build sync when you need a fresh production-style asset set:

```bash
npm run build
npm run cap:prod
```

## Android-Specific Flow

The app exposes `/android-sync`, which is intended for the Capacitor experience. It scans the selected folder recursively, filters to the same upload-safe formats as the web uploader, and uses the same direct-to-R2 upload architecture for synced files.

## Build APK

In Android Studio:

- `Build` -> `Build APK(s)`

Or by CLI:

```bash
cd android
./gradlew assembleDebug
```

## Troubleshooting

- Device cannot reach dev server: check LAN IP, firewall, and that the phone is on the same network.
- HTTP blocked on device: keep `cleartext` enabled only for development.
- File access issues: verify storage permissions and the scoped storage plugin behavior on the device.
- Upload failures with CORS errors: confirm the R2 bucket allows the app origin and `PUT`, `GET`, `HEAD`.
- App looks stale after config changes: re-run `npm run cap:sync` and rebuild from Android Studio.
