---
title: Check vivo and iQOO OEM call recording and file access
description: Check for the manufacturer's Phone app and an accessible folder of original call recordings. Confirm filename recognition before using a vivo or iQOO archive with Callery.
manufacturer: Vivo / iQOO
category: setup
task: Check OEM dialer availability and original recording files
publishedAt: 2026-11-12
updatedAt: 2026-11-12
draft: false
verification: limited
devices: vivo and iQOO phones with an existing OEM Phone app or an on-device alternate Phone setting; no certified model list
region: Recording availability and alternate dialer options depend on the regional software
dialer: vivo or iQOO OEM Phone; Google Phone is not a supported archive source
osVersion: Check the exact Funtouch OS or OriginOS build; neither an OS name nor a Recorder listing proves folder access
access: varies
archiveWorkflow: conditional
formats: [MP3, WAV, M4A, MP4, WebM]
metadataRecognition: Vivo and iQOO filename layouts remain unverified; accessible audio alone does not establish automatic caller/date recognition.
verifiedAt: 2026-11-12
sources:
  - title: vivo Support — Automatically record calls with Google or vivo Dialer
    url: https://www.vivo.com/en/support/questionList?categoryId=53700&FAQId=71763
  - title: vivo India Support — Where to find the call recording files
    url: https://www.vivo.com/in/support/questionList?categoryId=50789&FAQId=55169
  - title: iQOO Community — First-hand alternate Phone setting walkthrough, not manufacturer certification
    url: https://community.iqoo.com/in/thread/42056
  - title: Google Help — Check or change your default phone app
    url: https://support.google.com/gemini/answer/15575143
  - title: Callery recording filename compatibility
    url: https://github.com/virusz4274/callery/blob/main/docs/recording-filenames.md
---

**vivo and iQOO are conditional compatibility checks, not a promise of a supported Callery archive.** You need the manufacturer's working Phone app, original call audio accessible through a file manager, and filenames that Callery recognizes. We have not verified a vivo/iQOO filename profile, so this guide does not certify automatic caller/date organization on these phones.

Google Phone's ability to record or share a call does not meet this requirement. Callery's archive workflow uses original files copied together from accessible storage; repeated per-recording sharing can lose filename metadata and is not a practical bulk transfer. Read the [Google Phone limitation](/guides/export-google-phone-call-recordings) if that is your current dialer.

For a walkthrough with an AI assistant, use the [AI-assisted setup instructions](/guides/set-up-call-recording-with-ai) together with this guide. Only the existing OEM app and on-device settings described here are in scope. Do not use external APKs, root or Magisk, bootloader unlocking, replacement ROMs or firmware flashing, hidden-API changes, or permission bypasses.

## 1. Check whether the manufacturer's Phone app is available

If vivo/iQOO Phone is already installed, check whether **Settings → Apps → Default apps → Phone app** offers it. Select the OEM app if you intend to test it. Menu labels may differ; [Android's default-app instructions](https://support.google.com/gemini/answer/15575143) explain the selection.

Some builds also expose **Enable Alternate Phone & Contacts** under Settings → Apps. An [iQOO community member's first-hand walkthrough](https://community.iqoo.com/in/thread/42056) shows that setting and its confirmation/default-phone prompts. This is community evidence of an available setting, not an official compatibility list or confirmation for every Funtouch OS or OriginOS release.

If the setting exists on your phone, read its explanation before enabling it and choose the manufacturer's Phone app when prompted. If neither the setting nor the OEM Phone app is available, **stop here: the current firmware is incompatible with this supported setup**. We have not established a universal official installation, hidden code, or ADB procedure that adds the missing dialer to every build. An assistant must report that result and may direct you to vivo/iQOO support about the exact model, region, and firmware; it must not propose a downloaded APK or an unlisted package-restoration command.

Keep the old Phone app and its data. Changing the default affects future calling; it does not move recordings previously made in Google Phone into an accessible folder.

## 2. Enable recording in the OEM dialer

[vivo's support instructions](https://www.vivo.com/en/support/questionList?categoryId=53700&FAQId=71763) describe **Phone → ⋮ → Call Settings → Call Recording → Record all calls automatically** for its own dialer. Recording is unavailable in some countries or regions. Use only controls present on the installed OEM app; Google Phone's separate recording menu is not this workflow.

With the other participant's consent, make a short test call. Confirm both voices are audible, and verify incoming and outgoing calls after changing dialers. If the app crashes, calling fails, or the recording controls are missing, restore the previous default Phone app and stop; the replacement has not established recording support on this firmware.

## 3. Find an actual folder of originals

[vivo India's storage FAQ](https://www.vivo.com/in/support/questionList?categoryId=50789&FAQId=55169) distinguishes its own Phone app from Google Phone. For OEM recordings it describes:

- **Files → Audio**, or
- **File Manager → All files (Phone storage) → Record** on applicable software.

Use the sample call's time to locate the original, then open its file details and parent folder. An Audio category is a view of files, not a universal folder name. The FAQ also says recordings can be accessed in **Recorder** starting with Android 15. That statement does **not** establish that the originals remain visible in shared storage on every Android 15 or newer build.

Before treating the phone as a Callery archive source, verify on the device that:

1. A normal file manager can see the original audio and its complete filename in phone storage.
2. The parent folder lets you select and copy several originals together.
3. Copying preserves those filenames without going through individual Phone/Recorder Share actions.

If recordings are visible only inside Phone or Recorder, with no accessible folder of originals, **this configuration is unsupported for Callery's bulk archive workflow**. The Recorder app's ability to play or share a file does not pass the folder-access check.

The OEM app needs to write original recordings into shared storage, and the file manager needs normal access to browse and copy that folder. Callery's browser file picker grants its web app or PWA access to the originals you select; it does not require unrestricted write access to phone storage. If the normal folder access is unavailable, stop instead of changing private-folder permissions.

## 4. Copy a small sample and check its metadata

Copy several originals to a computer through file transfer, preserving filenames and extensions. Play the copies and retain the phone originals. Callery currently accepts MP3, WAV, M4A, MP4, and WebM; check the actual file type. Renaming AMR or AAC to a supported extension does not convert it.

Then check the [filename compatibility rules](/docs/recording-filenames). There is no verified vivo/iQOO-specific parser profile. Supported audio with an unrecognized filename can upload as unknown caller with upload time; **that is not a successful organized call-history import**. Do not import a large archive expecting Callery to infer contact names or call dates that the files do not contain.

Proceed with the [bulk backup guide](/guides/backup-and-organize-android-call-recordings) only after original-file access, playback, and caller/date recognition all pass on a small sample. If recognition fails, preserve the original archive and use the [support page](/support) to describe the model, regional build, dialer version, and filename pattern using synthetic names and numbers rather than private recordings.

The complete check is: incoming and outgoing calls work, both voices record, original files appear in a normal folder, bulk copying preserves their names, and Callery recognizes caller/date metadata. An available alternate Phone setting means **OEM setup required**, not that these final checks have already passed. If no applicable setting or usable originals are found, the workflow is **not established for this build**; the brand alone does not determine compatibility.

## Restore the previous Phone app if needed

Return to Default apps and select the previous Phone app. Verify incoming and outgoing calls before disabling an alternate-app setting. Keep both apps' data until your copies are verified; changing the default does not require clearing either app's storage.
