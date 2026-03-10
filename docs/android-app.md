# Android App (Capacitor)

Call Memo includes a Capacitor Android wrapper with folder-sync support at `/android-sync`.

## Prerequisites

- Android Studio (or Android SDK CLI)
- Node.js 20+

## Setup

1. Install dependencies:

```bash
npm install
```

2. Configure `capacitor.config.ts` `server.url` for your environment:
- Local dev: `http://<your-local-ip>:9000`
- Production: your deployed HTTPS URL

3. Build web app and sync Android project:

```bash
npm run build
npm run cap:sync
```

4. Open Android Studio:

```bash
npx cap open android
```

## Development Loop

```bash
# JS/UI updates
npm run cap:sync

# Dependency/config updates
npm run build && npm run cap:sync
```

## Build APK

Android Studio: Build -> Build APK(s)

or CLI:

```bash
cd android
./gradlew assembleDebug
```

## Troubleshooting

- Device cannot reach local server: ensure same network and correct local IP.
- HTTP blocked on device: keep `cleartext: true` only for local HTTP dev.
- File access denied: grant storage permissions in Android app settings.
