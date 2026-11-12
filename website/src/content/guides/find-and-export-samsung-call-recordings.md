---
title: Copy Samsung call recordings from Recordings/Call to your computer
description: Find Samsung Phone recordings in My Files under Internal storage/Recordings/Call, bulk copy the original files, and preserve caller and date information for Callery.
manufacturer: Samsung
task: Copy original recording files
publishedAt: 2026-11-12
updatedAt: 2026-11-12
draft: false
verification: limited
devices: Galaxy phones using Samsung Phone with original call audio visible in My Files
region: Recording availability depends on the model, market, carrier, and firmware; folder evidence includes Samsung's Korean support documentation
dialer: Samsung Phone
osVersion: Samsung documents Recordings/Call on Android 9–14 and in its newer folder guide; verify the folder on your build
access: files
archiveWorkflow: folder-copy
formats: [MP3, WAV, M4A, MP4, WebM]
metadataRecognition: Samsung Call <caller>_YYMMDD_HHMMSS and Call recording <caller>_YYMMDD_HHMMSS filenames carry caller and local call time.
verifiedAt: 2026-11-12
sources:
  - title: Samsung Electronics Service — Recording file storage locations (Korean)
    url: https://www.samsungsvc.co.kr/solution/39738
  - title: Samsung Electronics Service — Galaxy recording and storage folders (Korean)
    url: https://www.samsungsvc.co.kr/solution/38418
  - title: Samsung Electronics Service — Copy recordings to a PC (Korean)
    url: https://www.samsungsvc.co.kr/solution/38168
  - title: Callery recording filename compatibility
    url: https://github.com/virusz4274/callery/blob/main/docs/recording-filenames.md
---

For Samsung Phone recordings, open **My Files → Internal storage → Recordings → Call**. Copy the original files from this folder to your computer, keeping their names unchanged. This is the Samsung workflow for Callery: a folder of original recordings that you can transfer in bulk.

Samsung's [storage-location guide](https://www.samsungsvc.co.kr/solution/39738) and [Galaxy recording guide](https://www.samsungsvc.co.kr/solution/38418) both identify `Recordings/Call`. The adjacent `Recordings/Voice Recorder` folder holds ordinary voice recordings; it is a different folder.

For help from Claude, ChatGPT, or Codex, follow the [AI-assisted setup instructions](/guides/set-up-call-recording-with-ai) with this guide. This is a folder-copy procedure using Samsung's existing Phone app and My Files. It does not include external APKs, root or Magisk, bootloader unlocking, replacement ROMs or firmware flashing, hidden-API changes, or permission bypasses.

## Confirm that your phone fits this workflow

This guide applies when **Samsung Phone** created the recordings and their original audio files are accessible in My Files. A Galaxy model name alone does not confirm recording availability. A Galaxy using Google Phone has a [different storage limitation](/guides/export-google-phone-call-recordings).

Make or find a short recording, then check that its original file appears in `Recordings/Call`. If the folder is missing, check your exact model's support instructions. Samsung's [PC transfer guide](https://www.samsungsvc.co.kr/solution/38168) also shows a top-level `Call` folder on some older software and notes that locations can differ by model and OS. An empty folder is not proof that a recording exists elsewhere.

If Samsung Phone or its supported recording control is unavailable, or the originals cannot be found through normal storage access, stop: the current firmware/setup is incompatible with this supported archive route. An assistant must not install a regional dialer APK, change system packages, or attempt private-folder extraction as a substitute.

## Bulk copy the originals

1. Unlock the phone and connect it to your computer with a USB cable that supports data transfer.
2. Select the phone's file-transfer option if prompted, and allow the connection.
3. Open the phone's internal storage on the computer, then open **Recordings → Call**.
4. **Copy** the folder or select the recordings you want and copy them to a backup folder on the computer. Keep the original filenames and extensions. Leave the phone copies in place.
5. Compare the copied filenames and file count with the source folder. Play an older recording and a recent one before importing.

Samsung documents accessing this folder from a PC in its [recording transfer instructions](https://www.samsungsvc.co.kr/solution/38168). Your computer must support the phone's USB file-transfer connection. You can also copy files from My Files to another storage destination you control, provided the transfer preserves the original filenames.

Samsung Phone writes the originals into the recording folder. Allow My Files and USB file transfer only the normal access needed to copy them. When uploading, select the copied originals through Callery's browser file picker; the web app and PWA do not need unrestricted write access to phone storage. Do not change private app-folder permissions if normal copying fails.

Use this folder-copy workflow for an ongoing archive. Exporting recordings through Phone or Voice Recorder, or sending them through messaging apps, is not the workflow this guide recommends: export destinations can rename or transform files, and sharing recordings individually does not scale well.

## Keep caller and date information intact

Callery recognizes Samsung-style filenames such as these **fictional examples**:

```text
Call Alex_261110_143000.m4a
Call recording +15550102345_261110_143000.m4a
```

The caller and local date/time in the filename help Callery organize the archive. The filename does not identify the phone's timezone, so check the imported time against a call you remember. Do not shorten the name, strip the timestamp, or replace it with a generic export name.

## Verify a small import

Callery accepts MP3, WAV, M4A, MP4, and WebM. This list describes Callery's upload formats, not every format Samsung produces. Upload a few copied originals and confirm **playback of both voices, caller/contact matching, and call date** before importing the rest. If you changed the recording setup, also verify normal incoming and outgoing calls. The files must remain accessible together in My Files and keep their original names after copying.

A file with an unfamiliar filename may upload as audio while losing automatic caller and historical date recognition. That is not a successful check of the organized archive workflow. See [filename compatibility](/docs/recording-filenames) if the sample does not match.

Continue with [backing up and organizing the full folder](/guides/backup-and-organize-android-call-recordings).
