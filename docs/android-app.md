# Android App (Capacitor)

VoSift includes an Android app built with Capacitor that enables folder sync - automatically uploading recordings from device folders to the cloud.

## Prerequisites

- **Android Studio** (recommended) or Android SDK command-line tools
- **Node.js** v18+

## Setup

### 1. Install Dependencies (Already done if following setup-guide)

```bash
npm install
```

The following Capacitor packages are included:
- `@capacitor/core` - Core runtime
- `@capacitor/cli` - Build tools
- `@capacitor/android` - Android platform
- `@capacitor/filesystem` - File system access

### 2. Configure Server URL

Edit `capacitor.config.ts` and set your server URL:

```typescript
server: {
  // Development: Use your local IP
  url: 'http://YOUR_LOCAL_IP:9000',
  
  // Production: Use your deployed URL
  // url: 'https://your-domain.com',
  
  cleartext: true, // Required for HTTP (dev only)
}
```

**Find your local IP (macOS):**
```bash
ipconfig getifaddr en0
```

### 3. Build and Sync

```bash
# Build the Next.js app
npm run build

# Sync to Android project
npx cap sync android
```

### 4. Open in Android Studio

```bash
npx cap open android
```

Then click **Run** to install on emulator or connected device.

## Development Workflow

After making web changes:

```bash
# Quick sync (no rebuild needed for JS-only changes)
npx cap sync android

# Full rebuild (when dependencies change)
npm run build && npx cap sync android
```

## Building APK

In Android Studio:
1. **Build > Build Bundle(s) / APK(s) > Build APK(s)**
2. APK location: `android/app/build/outputs/apk/debug/app-debug.apk`

Or via command line:
```bash
cd android
./gradlew assembleDebug
```

## Features

### Folder Sync (`/android-sync`)

The Android app provides a dedicated folder sync page:
- Browse device folders
- Select audio files to sync
- Automatic duplicate detection
- Batch upload with progress tracking

This page only appears in the native app - web browsers see a "download the app" message.

## Troubleshooting

### "Unable to launch Android Studio"
Set the path if Android Studio is in a non-standard location:
```bash
export CAPACITOR_ANDROID_STUDIO_PATH="/path/to/Android Studio.app"
```

### Network connection fails
- Ensure device and dev machine are on the same network
- Check that `cleartext: true` is set for HTTP
- Verify firewall isn't blocking port 9000

### Permission denied for files
The app requests storage permissions on first use. If denied:
1. Go to Android Settings > Apps > VoSift
2. Tap Permissions > Files and media > Allow
