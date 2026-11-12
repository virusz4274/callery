---
title: Why Google Phone recordings are not supported for Callery's bulk archive workflow
description: Google Phone's in-app sharing is not a supported Callery folder-import workflow. Check accessible original files and filenames before choosing a recording setup.
manufacturer: Google Phone
task: Understand the storage limitation
publishedAt: 2026-11-12
updatedAt: 2026-11-12
draft: false
verification: limited
devices: Phones using Google Phone, including Pixel and OEM phones shipped with Google's dialer
region: Google Phone recording availability varies; recording support does not establish Callery archive compatibility
dialer: Google Phone
osVersion: Applies to the documented Google Phone recording and individual sharing workflow
access: unavailable
archiveWorkflow: unsupported
formats: [MP3, WAV, M4A, MP4, WebM]
metadataRecognition: Google Phone exports have no verified Callery caller/date filename layout; uploading audio alone does not recover call-history metadata.
verifiedAt: 2026-11-12
sources:
  - title: Google Phone Help — Use the Phone app to record calls
    url: https://support.google.com/phoneapp/answer/9803950
  - title: Callery recording filename compatibility
    url: https://github.com/virusz4274/callery/blob/main/docs/recording-filenames.md
---

**Google Phone's individual Share workflow is not a supported way to build an organized Callery call archive.** Callery's supported workflow needs the original recordings in a folder you can open with the phone's file manager and bulk copy with their filenames intact. Being able to play a recording inside the dialer is insufficient.

This limitation also applies to Google Phone on Xiaomi, OnePlus, OPPO, realme, vivo, or other manufacturers' phones. A recording button, a Google Phone update, or Pixel call-recording support does not establish compatibility with Callery's folder-based workflow.

This is a limitation of the **current dialer and recording setup**, not a claim that every phone shipped with Google Phone is permanently incompatible. An applicable OEM dialer route may make future recordings accessible; its availability must be checked on the installed build.

If you ask an AI assistant for help, use the [AI-assisted setup instructions](/guides/set-up-call-recording-with-ai) with this page. The assistant must preserve this unsupported-workflow result. It must not recommend external APKs, root or Magisk, bootloader unlocking, ROM replacement or flashing, hidden-API changes, or permission bypasses to extract private recordings or add a missing dialer.

## What Google documents

Google's [recording help](https://support.google.com/phoneapp/answer/9803950) describes opening a recorded call in the Phone app's call history and optionally sharing that recording to another app. It says recordings remain on the device rather than being backed up off-device, and deleting a call log also deletes its recording.

That help page does **not** document a shared-storage folder for copying an entire recording library, a bulk export, or a filename format that preserves caller and call time. On-device storage does not itself mean files are available through a file manager or a computer's USB connection. Recordings kept in the dialer's restricted app storage are outside Callery's reach.

Granting a file manager more access does not establish a supported original-folder workflow. Callery's web app and PWA use the browser's file picker to read files you select; unrestricted phone-storage write permission is not a Callery requirement and must not be proposed as a workaround for Google Phone's private storage.

## Why per-call exports are unsuitable

Exporting years of calls one at a time is impractical for a repeatable backup. The exported or received filename can also differ from the original. A generic or random-looking name gives Callery no reliable way to identify the caller or historical call time, even when that information remains visible in the dialer's history.

There is no verified Google Phone filename profile in Callery. We do not claim every Google Phone version or sharing destination produces the same name; the problem is that this route does not provide the original accessible folder and reliable metadata that the archive workflow requires.

Callery may accept an individual exported file if its audio format is supported. **Audio upload success does not mean Callery recovered the contact or call date.** Renaming a random export cannot reconstruct information you do not have, and transcription does not recover the dialer's call-history metadata.

## Choose a setup that produces accessible originals

For future recordings, check whether your exact device, region, and firmware offer an OEM dialer that saves recordings into shared internal storage. Start with the [dialer compatibility checklist](/guides/choose-android-dialer-for-call-recording), then use the matching [Xiaomi](/guides/enable-call-recording-xiaomi-hyperos), [OnePlus/OPPO/realme](/guides/enable-call-recording-oppo-odialer), [vivo/iQOO](/guides/enable-call-recording-vivo-iqoo), or [Samsung folder guide](/guides/find-and-export-samsung-call-recordings). The Xiaomi guide distinguishes manufacturer settings from scoped community-reported ADB restoration. The OnePlus/OPPO/realme guide compares the built-in OEM dialer, official ODialer, and model/build-specific activation reports; phones from the same brand can need different methods.

A different dialer needs evidence for the installed build. Follow only the device settings, existing-firmware restoration, official manufacturer app-store route, or clearly scoped community activation route explicitly described in the matching guide. If a route’s required app or setting is absent, or its permitted installation or restoration fails, **stop that route on the current firmware**. Another documented route may still apply to this exact model and build; a failure does not establish brand-wide incompatibility. If no working route produces files you can browse and bulk copy, the archive workflow is not established for this build. Preserve Google Phone and its data rather than removing it to force another dialer to work.

Changing the dialer does not migrate recordings already held by Google Phone into the new dialer's folder. Preserve existing recordings according to Google's instructions if you need them, but do not treat that individual preservation task as a Callery bulk-import solution.
