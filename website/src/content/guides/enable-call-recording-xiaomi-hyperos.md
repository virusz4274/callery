---
title: Set up Xiaomi and HyperOS call recording from existing firmware apps
description: Check existing Xiaomi dialer packages, restore them only on compatible firmware, and verify original recording files before importing into Callery. Includes AI assistant instructions and rollback.
manufacturer: Xiaomi / Redmi / POCO
category: setup
task: Restore an existing OEM dialer and verify accessible original recordings
publishedAt: 2026-11-12
updatedAt: 2026-11-12
draft: false
verification: limited
archiveWorkflow: conditional
devices: Xiaomi, Redmi, and POCO phones whose installed firmware includes a working Xiaomi recording dialer and accessible original files
region: Check the exact model, regional firmware, carrier, Android version, and full HyperOS build
dialer: Existing Xiaomi OEM Contacts and dialer plus Phone/InCallUI; preserve Google Phone and Contacts wherever already installed
osVersion: MIUI or HyperOS; version numbers alone do not establish package availability or compatibility
access: varies
formats: [MP3, WAV, M4A, MP4, WebM]
metadataRecognition: Original Xiaomi filenames matching a recognized layout can supply caller and call date on MIUI or HyperOS; verify a small import on the actual device.
verifiedAt: 2026-11-12
sources:
  - title: Xiaomi — Recording availability depends on model, region, and carrier
    url: https://www.mi.com/global/support/faq/details/KA-541462/
  - title: Xiaomi — System file locations, including the call_rec folder
    url: https://www.mi.co.id/id/support/article/KA-14724/
  - title: Xiaomi — MIUI user guide, call recording settings
    url: https://alsgp0.fds.api.xiaomi.com/xiaomi-b2c-i18n-upload/user-guides/5d18f62814ee22cce9a091df41f5ba1e.pdf
  - title: Xiaomi — Google Phone playback and individual sharing
    url: https://www.mi.com/uk/support/faq/details/KA-541461/
  - title: Google — Change the default Phone app
    url: https://support.google.com/gemini/answer/15575143#zippy=%2Ccheck-or-change-your-default-phone-app
  - title: Android — Official SDK Platform Tools
    url: https://developer.android.com/tools/releases/platform-tools
  - title: Android Developers — Android Debug Bridge
    url: https://developer.android.com/tools/adb
  - title: Android — Package command implementation and help
    url: https://android.googlesource.com/platform/frameworks/base/+/refs/heads/android14-release/services/core/java/com/android/server/pm/PackageManagerShellCommand.java
  - title: Android — Resource overlays and their enabled state
    url: https://source.android.com/docs/core/runtime/rros
  - title: Android — App-private and shared storage
    url: https://developer.android.com/training/data-storage/app-specific
  - title: HyperOS community — Original dialer restoration procedure and reports
    url: https://www.reddit.com/r/HyperOS/comments/1k7ztyg/
  - title: First-hand report — Xiaomi 14T Pro Global, HyperOS 2.0.216.0
    url: https://www.reddit.com/r/HyperOS/comments/1k7ztyg/comment/nddv29w/
  - title: First-hand guide — Redmi Note 14 4G Global, HyperOS 3.1
    url: https://www.reddit.com/r/XiaomiGlobal/comments/1v2o8w6/guide_how_to_get_xiaomi_dialer_instead_of_google/
---

**This guide uses only Xiaomi apps already included as system packages in your installed firmware.** Read it yourself, or use the copyable instructions above with Claude, ChatGPT, or Codex and the [AI-assisted setup guide](/guides/set-up-call-recording-with-ai). An assistant must follow the same prerequisites, stop conditions, and rollback steps.

The goal is a working dialer that writes original call recordings into shared storage, where File Manager can copy several files with their names intact. A recording menu or a successful package command alone does not establish Callery compatibility.

**Compatibility comes first:** after the read-only connection, firmware-package, and original-state checks, the first package-changing commands are the two `pm install-existing` commands below. Both must succeed before enabling an app, selecting Xiaomi as the default dialer, or changing the phone overlay. If either says **`Package ... doesn't exist`**, stop: the current firmware is incompatible with this supported setup. Google Dialer, Google Contacts, their data, and the overlay stay untouched at this gate.

## Supported route and firm limits

- Inspect the existing Phone settings without changing them. Pass the restoration compatibility gate before selecting another dialer or changing the overlay. Use ADB only to restore verified, pre-existing firmware system packages, and only for owner user **0**.
- Keep Google Phone, Google Contacts, and Google's communications overlay installed wherever already present. Do not add them as a prerequisite on firmware that does not include them. Preserve contacts, recordings, and app data throughout the check.
- Do not download or sideload external APKs, including APKMirror, Telegram, or video-description downloads. Do not try other regions' APKs or signing variants.
- Do not root the phone, use Magisk/KernelSU/APatch modules, unlock the bootloader, replace or flash a ROM, change hidden-API policy, bypass permissions, or extract private dialer storage.
- **If either required Xiaomi system package is absent, or `install-existing` fails, stop: the current device firmware is incompatible with this supported Callery setup.** Roll back changes already made. Do not offer an APK, root, or firmware replacement as a next step. This result describes the installed firmware, not permanent hardware incompatibility.
- If the restored app crashes, cannot become the default dialer, or breaks calls or contacts, stop and roll back. Error details may explain the failure; they do not authorize escalating beyond this guide.

## Identify the phone without changing its calling setup

Note the current default Phone app and back up contacts and accessible recordings. Keep the original apps and their data. Do not switch the default app or alter recording settings before both restoration commands succeed.

1. Long-press **Phone → App info** and note its name and version. Record the model, region, Android version, and full MIUI/HyperOS build from **Settings → About phone**.
2. Open **Settings → Apps → Default apps → Phone/Dial** only to note which app is currently selected and whether Xiaomi's app is listed. Leave the selection unchanged.
3. Continue with the read-only prerequisites and restoration gate below. Recording settings and a short agreed test call come after that gate.

A call-recording settings page can belong to the firmware and remain visible even when the Xiaomi dialer is unavailable. Google Phone may open the same calling-account settings. That screen is not proof that the required Xiaomi apps are present or compatible.

If Google Phone is the only offered dialer, check the firmware packages below. A Google Phone Record or Share button does not pass the [original-folder requirements](/guides/export-google-phone-call-recordings).

## Community-reported OEM dialer restoration through ADB

This is a **community-reported route, not Xiaomi-supported hardware certification**. A commenter reports success on a Xiaomi 14T Pro Global running HyperOS **2.0.216.0**; another guide reports restoration on Redmi Note 14 4G Global with HyperOS 3.1. These reports do not verify every regional build, original recording folder, or Callery import. Neither "older HyperOS needs root" nor "newer HyperOS always supports ADB restoration" is a compatibility rule.

Community batch files commonly restore Contacts and InCallUI, remove a phone overlay, then repeat restoration. Some also remove Google apps. **Repeating restoration cannot create an absent package.** This guide checks each result and excludes the Google-app removals. Do not paste an entire downloaded batch file into a terminal or ask an assistant to execute it wholesale.

### 1. Connect exactly one authorized device

Use [Google's official Platform Tools](https://developer.android.com/tools/releases/platform-tools). Enable USB debugging and authorize your trusted computer. Run these commands in the **computer's terminal**, not inside an interactive `adb shell` session:

```text
adb version
adb devices -l
```

Continue only when there is **exactly one device entry**, its status is **`device`**, and it is the phone you intend to configure. Disconnect other phones and emulators. Stop on no device, multiple entries, `unauthorized`, or `offline`. Recheck this gate after reconnecting. The commands below use plain `adb`; you do not need to copy or share the device serial.

```text
adb shell am get-current-user
adb shell getprop ro.product.model
adb shell getprop ro.product.device
adb shell getprop ro.build.version.incremental
adb shell getprop ro.build.version.release
```

The current user must be **`0`**. Stop for any other user, managed restriction, or authorization failure. Do not substitute a work-profile user ID.

### 2. Verify both firmware packages before changing anything

```text
adb shell pm list packages -s -u --user 0 com.android.contacts
adb shell pm list packages -s -u --user 0 com.android.incallui
```

Both exact entries must be present:

```text
package:com.android.contacts
package:com.android.incallui
```

The `-s` filter checks system packages; a user-installed APK does not qualify. The `-u` flag includes packages removed for the user. A similar package such as `com.android.providers.contacts`, a voice recorder, or a telephony service is not a substitute. If either exact entry is missing, **stop with incompatible current firmware** before changing the overlay or default apps.

### 3. Record the previous state, then run the restoration compatibility gate

Back up contacts and accessible recordings. Note the current default Phone app in Settings, and save these outputs privately outside a shared repository or public support post:

```text
adb shell cmd role get-role-holders --user 0 android.app.role.DIALER
adb shell dumpsys package com.android.contacts
adb shell dumpsys package com.android.incallui
adb shell dumpsys package com.android.phone.cust.overlay.miui
adb shell cmd overlay dump --user 0 com.android.phone.cust.overlay.miui
```

Record each package's **`User 0`** values for `installed` and `enabled`, and the overlay's state and mutability. `enabled=0` means the default state, not disabled. Stop if a package is hidden, suspended, or restricted, or if you cannot interpret its previous state and the rollback section. Keep full diagnostics local; an assistant normally needs only the relevant state lines.

Have an alternative way to make a call while checking the change. An assistant must explain the next change and its rollback and obtain your approval before executing a modifying command. A chat app without authorized ADB access should give you the commands to run yourself.

The following are the **first package-changing commands**. Do not enable apps, switch the default dialer, uninstall Google apps, or change the overlay before this gate passes.

Run the first command and inspect its result. If it fails, **stop immediately and do not run the second command**:

```text
adb shell pm install-existing --user 0 com.android.contacts
```

Only if Contacts was restored successfully, run:

```text
adb shell pm install-existing --user 0 com.android.incallui
```

Continue only when **both** operations report successful installation for user 0. **`Package ... doesn't exist`**, `NameNotFoundException`, `Unknown package`, installation failure, or a permission error means **stop: incompatible current firmware**. Do not repeat failed commands, change the overlay, or search for replacement APKs. Google Dialer and Contacts stay installed, their data is preserved, and their default selection remains unchanged.

If Contacts succeeded but InCallUI failed, undo only the Contacts installation if your notes show it was previously `installed=false`, using the rollback section. A package that was already installed must stay installed. Do not continue setup after this partial result.

### 4. Only after both restorations succeed, select and test the Xiaomi dialer

If a restored app is disabled, enable only that verified package, after recording its old enabled value:

```text
adb shell pm enable --user 0 com.android.contacts
adb shell pm enable --user 0 com.android.incallui
```

Use only the applicable line. Select Xiaomi **Contacts and dialer** in **Settings → Apps → Default apps → Phone/Dial**. Open it, check contact viewing/editing, and test **incoming and outgoing calls** using ordinary test numbers. Look for the OEM **Call recording** control and make a short agreed recording. If the app is absent from the default-app list, crashes, or any calling/contact check fails, select the previous default, use rollback, and stop. Keep the Google apps installed.

If recording and original-file access already work, skip the overlay change and complete the sample import.

### 5. Check the phone overlay only if recording is unavailable

The source procedure removes `com.android.phone.cust.overlay.miui` to change phone configuration on its reported firmware. An Android resource overlay replaces configuration values; it does not install missing apps or grant platform trust. This step is not a general fix for an app that crashes at startup.

Proceed only after **both restoration commands succeeded**, the restored Xiaomi apps are stable, both calling directions and contacts work, and the original state and rollback are recorded. Verify this exact overlay is a firmware system package and is currently installed for user 0:

```text
adb shell pm list packages -s -u --user 0 com.android.phone.cust.overlay.miui
adb shell dumpsys package com.android.phone.cust.overlay.miui
adb shell cmd overlay dump --user 0 com.android.phone.cust.overlay.miui
```

Require the exact package entry, **`installed=true`** for user 0, and an enabled overlay state. If it is absent, already disabled/unapplied, or the output is unclear, stop this route rather than removing more packages.

After approval, use **one** applicable change:

- If the overlay is **mutable**, disable it without uninstalling the package:

  ```text
  adb shell cmd overlay disable --user 0 com.android.phone.cust.overlay.miui
  ```

  Its rollback is `adb shell cmd overlay enable --user 0 com.android.phone.cust.overlay.miui`.

- If the enabled overlay is **immutable**, the community route removes it for user 0, retaining its data:

  ```text
  adb shell pm uninstall -k --user 0 com.android.phone.cust.overlay.miui
  ```

  Its rollback is `adb shell pm install-existing --user 0 com.android.phone.cust.overlay.miui`, followed by verification of the applied overlay state.

Check the result. Stop on failure; do not try another removal or override. Restart the phone, recheck calling and contacts, and make a new short recording. If recording or original-file access still fails, roll back and report incompatible current firmware for this setup. **Do not remove Google Phone, Google Contacts, or `com.google.android.overlay.gmsconfig.comms`.**

## Find the originals and check normal storage permissions

On compatible Xiaomi OEM setups, check the existing folder documented by Xiaomi:

```text
Internal storage/MIUI/sound_recorder/call_rec/
```

Capitalization or the actual location may vary. Find the file from your test call in File Manager and open its parent folder. Do not create an empty folder and assume recordings will appear there.

The **dialer must write** original recordings into accessible shared storage. Use the phone's normal permission prompts for the OEM recorder and File Manager to browse and copy files; a copy destination also needs ordinary write access. Grant only the access the supported app actually requests. Do not grant access to protected private folders or change system permissions to force visibility.

**Callery's web app/PWA reads the files you select through the browser's file picker. It does not require unrestricted phone-storage write permission.** Extra file-manager permission cannot turn private Google Phone recordings into shared originals. If playback or individual sharing inside Phone/Recorder is the only access available, stop: that setup does not meet Callery's bulk archive requirements.

## Verify a small import before using the archive

1. Confirm incoming and outgoing calls and contact access work.
2. Listen to an agreed test recording and confirm both voices are audible.
3. Select and **copy** several original files together from the real folder using File Manager or USB file transfer. Preserve names and extensions, keep the originals, and play the copies.
4. Use MP3, WAV, M4A, MP4, or WebM. Changing an unsupported extension is not audio conversion.
5. Import the copied sample into your Callery instance. Check playback, the caller, and the historical call date. Unknown caller or upload time does not pass automatic organization.

Xiaomi originals matching `<call label>@<phone>_YYYYMMDDHHMMSS` use the same parser on MIUI and HyperOS; recognized localized call labels are discarded. The filename evidence is from older MIUI, so verify your actual files against the [filename reference](/docs/recording-filenames#xiaomi-dialer-on-hyperos). A successful audio upload alone is not a complete compatibility check.

Only after every check passes should you follow the [bulk backup guide](/guides/backup-and-organize-android-call-recordings). Switching dialers affects future recordings; it does not migrate recordings already held by Google Phone.

## Roll back only the changes you made

Use the private state notes from step 3. Keep both Google apps installed and select the previous default Phone app in Settings. Undo an overlay change using its corresponding rollback above; do not enable an overlay that was previously disabled or install one that was previously absent for user 0.

If a Xiaomi package was **`installed=false`** before this guide restored it, remove that package for user 0 while retaining its data. Run only the line corresponding to a package you restored:

```text
adb shell pm uninstall -k --user 0 com.android.incallui
adb shell pm uninstall -k --user 0 com.android.contacts
```

A package that was already installed must stay installed. Never remove `com.android.providers.contacts`, `com.android.phone`, or `com.android.server.telecom`.

If you changed an app's enabled state, restore its saved value using the exact verified package in place of `PACKAGE_NAME`:

| Previous `enabled` value | Restore command |
| --- | --- |
| `0` (default) | `adb shell pm default-state --user 0 PACKAGE_NAME` |
| `1` (enabled) | `adb shell pm enable --user 0 PACKAGE_NAME` |
| `2` (disabled) | `adb shell pm disable --user 0 PACKAGE_NAME` |
| `3` (disabled by user) | `adb shell pm disable-user --user 0 PACKAGE_NAME` |
| `4` (disabled until used) | `adb shell pm disable-until-used --user 0 PACKAGE_NAME` |

Restart, verify the previous dialer, incoming/outgoing calls and contacts, and check the overlay's applied state with `adb shell cmd overlay list --user 0 com.android.phone.cust.overlay.miui`. Reinstallation restores a package; verify that its overlay state also matches your notes. If rollback fails, stop package changes and contact Xiaomi support with the operation results. Do not reset, flash, or erase the phone to complete this guide.

If you already ran another script that removed Google packages, restore **only packages you know were installed before it**, using `adb shell pm install-existing --user 0 PACKAGE_NAME` for the affected original package. Then select Google Phone again and verify calls. This restores package availability, not private data already deleted by an uninstall without `-k`; do not offer recovery guarantees or repeat the script.

When finished, disable USB debugging and revoke the computer's debugging authorization if you no longer need it.
