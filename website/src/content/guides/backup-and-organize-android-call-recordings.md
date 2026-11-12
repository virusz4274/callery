---
title: Back up and organize call recordings after changing phones
description: Keep call recordings organized after changing phones or copying them to a computer. Preserve original filenames, check caller and dates, and import a small sample into Callery.
manufacturer: Android
task: Bulk backup and organization
publishedAt: 2026-11-12
updatedAt: 2026-11-12
draft: false
verification: limited
devices: Phones whose supported dialer saves original call recordings in file-manager-accessible shared internal storage
region: Recording availability and supported OEM dialers depend on the phone, firmware, and market
dialer: A supported dialer that produces accessible original recording files
osVersion: Verify the recording folder and filename on your exact software build
access: files
archiveWorkflow: conditional
formats: [MP3, WAV, M4A, MP4, WebM]
metadataRecognition: Original recognized filenames supply caller and call date; generic or altered exports cannot be assumed to retain them.
verifiedAt: 2026-11-12
sources:
  - title: Samsung Electronics Service — Copy recordings to a PC (Korean)
    url: https://www.samsungsvc.co.kr/solution/38168
  - title: Google Phone Help — Use the Phone app to record calls
    url: https://support.google.com/phoneapp/answer/9803950
  - title: Callery upload and archive user guide
    url: https://github.com/virusz4274/callery/blob/main/docs/user-guide.md
  - title: Callery recording filename compatibility
    url: https://github.com/virusz4274/callery/blob/main/docs/recording-filenames.md
---

Callery's archive workflow starts with **original call recordings in a folder you can open in your phone's file manager**. Copy those files in bulk, preserve their filenames, then check that Callery recognizes the caller and call date before importing the full collection.

Callery organizes recordings you already have. It does not enable phone recording, read a dialer's restricted app storage, or retrieve contact/date information from its call-history database.

For an AI-assisted walkthrough, use the [AI-assisted setup instructions](/guides/set-up-call-recording-with-ai) with this backup guide and the matching device guide. Keep the assistant within ordinary file copying and explicitly documented OEM setup. Do not use external APKs, root or Magisk, bootloader unlocking, replacement ROMs or firmware flashing, hidden-API changes, or permission bypasses to obtain recordings.

## Check your phone before building an archive

You need all three of these:

1. A dialer supported on your exact device and software that records the calls you need.
2. Original audio files visible in shared internal storage, so you can select and copy many files without exporting each call from the dialer.
3. A supported audio format and a [recognized filename layout](/docs/recording-filenames) containing the caller and call date you want Callery to organize.

For Samsung Phone, start in **My Files → Internal storage → Recordings → Call** and follow the [Samsung folder-copy guide](/guides/find-and-export-samsung-call-recordings). Samsung documents [copying call recordings to a PC](https://www.samsungsvc.co.kr/solution/38168), with some older devices using a different folder.

For other devices, use the [phone compatibility page](/phone-compatibility) and the [dialer setup guides](/call-recording). Some phones need their existing OEM dialer selected or restored first. Follow only the settings, existing-firmware restoration, or official manufacturer app-store route explicitly permitted by the matching guide. If the required OEM app is absent or the permitted installation or restoration fails, stop: the current firmware is incompatible with that supported setup. Do not continue with a sideload, a bulk phone-fix script, or additional package changes.

If recordings are available only inside Google Phone, that current setup does not provide the originals for this import. Its [documented per-call Share action](https://support.google.com/phoneapp/answer/9803950) does not establish an accessible original folder or a reliable metadata-preserving bulk export. Read [the Google Phone limitation](/guides/export-google-phone-call-recordings) and check whether an OEM setup exists for future recordings. Sharing old recordings individually is not the supported archive workflow, and changing dialers does not move them into a new folder.

## Before changing phones

Copy the old phone's original recording folder while you can still access it. Keep a separate backup before resetting, selling, or trading in the phone. A phone-transfer utility restoring call history does not by itself establish that the original audio files and filenames have transferred too.

You can keep recordings from more than one phone in your archive. Keep each phone's copied files in a separate backup folder initially, so files with the same name cannot overwrite one another. Check original caller/date filenames and play samples from each source before uploading. The new phone's dialer affects future recordings; it does not change the compatibility of original files you already copied from the old one.

## Already copied the recordings to a computer or cloud folder?

Start with that existing copy rather than exporting the calls again from a dialer. Look for the actual audio files and compare their full names with the originals or an older backup. Preserve a copy before making any changes.

If they are in Google Drive or another cloud folder, download the files or make them fully available on the computer, then upload the local originals through Callery's browser uploader. Callery does not automatically connect to or import a Google Drive recording folder. If a download is packaged as a ZIP, extract it first and keep the contained audio filenames intact; upload the supported audio files, not the ZIP.

Copying may change the computer's created or modified dates. Those filesystem dates are not a substitute for the call date in a recognized original filename. Do not rename files to match the transfer date. If the files now have generic names, look for an untouched phone folder or backup; Callery cannot reconstruct missing caller/date information from a new name or a transcript.

When several downloaded folders contain the same original files, review the copies before choosing what to upload. Do not assume every copy is a different call or that matching names alone prove identical audio. Keep the original backup structure until the sample import is checked.

## Copy the original folder to a computer

Create a backup folder on your computer. Connect your unlocked phone using a supported USB file-transfer connection, or use another folder-transfer method that preserves filenames and file contents. Copy the originals from the recording folder; leave the phone copies in place.

The recording dialer must write the originals into an accessible shared folder. Your file manager needs normal permission to browse the source and write the copied files to the destination you choose. Callery's web app and PWA read the files you select through the browser's file picker; they do not require unrestricted write access to phone storage. If normal access cannot copy the originals, stop instead of bypassing private-folder restrictions.

Keep the full original filename, including the caller, date, time, and extension. Do not rename every file to a generic label, send recordings through a service that changes names, or use an audio/transcript export instead of copying the source audio.

Compare file counts and filenames after the transfer. Open several copied files, including an older and a longer call. Check that both sides of each conversation are audible. Keep your phone copies until you have verified the backup. A synchronized folder is not an independent backup if one deletion removes every copy.

## Verify a small import before proceeding

Callery accepts MP3, WAV, M4A, MP4, and WebM. AMR, standalone AAC, and OGG/Opus are not currently supported uploads. Changing an extension does not convert audio.

Sign in to your Callery instance, open Upload, and choose a few copied originals. Verify each of these before selecting the rest:

- The audio plays correctly.
- The caller or phone number matches the original call.
- The historical call date and time are correct; names without a timezone need an additional time check.

An unfamiliar filename can upload with an unknown caller and the upload time. Treat that result as a compatibility problem for an organized historical archive. Callery does not infer missing call-history metadata merely because the audio uploaded or a transcript exists.

## Import the rest and keep a recoverable backup

Select multiple recordings for upload in batches you can review. The queue supports pausing and resuming. If you close the browser, transfers stop; choose the original file when asked to resume a saved session.

Organizing and playing audio do not require transcription. Review your instance's processing settings and charges before transcribing a large collection.

Keep an independent copy of the original folder. Callery's full archive export includes original audio, available transcripts, metadata, and a browser viewer. Download all archive parts, extract them into the same folder, and test the viewer and sample audio. Self-hosters should also back up the database and object storage according to their recovery plan.
