---
title: OnePlus, OPPO, and realme call recording — choose the right dialer
description: Check your exact model, region, and software build before choosing a built-in OEM dialer, official ODialer, or a reported activation method. Then verify the original recording files.
manufacturer: OnePlus / OPPO / realme
category: setup
task: Choose a model-specific recording method and verify folder access
publishedAt: 2026-11-12
updatedAt: 2026-11-12
draft: false
verification: limited
devices: OnePlus, OPPO, and realme phones with a working OEM recording setup; no brand-wide or model-wide certification
region: Identify the country of purchase, regional firmware, carrier, and full build; methods can differ within the same brand or marketed model
dialer: Existing OEM Phone app, official ODialer where eligible, or separately evidenced model/build-specific activation; Google Phone is not a supported bulk archive source
osVersion: OxygenOS, ColorOS, or realme UI on the exact installed build; ODialer lists Android 12 or later, which alone does not establish compatibility
access: varies
archiveWorkflow: conditional
formats: [MP3, WAV, M4A, MP4, WebM]
metadataRecognition: A specific ColorOS caller/date filename layout is recognized; this does not certify OnePlus, OPPO, realme, or every ODialer filename. Verify a sample before bulk import.
verifiedAt: 2026-11-12
sources:
  - title: Google Play — ODialer by ColorOS
    url: https://play.google.com/store/apps/details?id=com.oplus.dialer&hl=en
  - title: OnePlus India — Nord 5 and OnePlus Dialer
    url: https://www.oneplus.in/nord-5
  - title: OnePlus India — OnePlus 13s and OnePlus Dialer
    url: https://www.oneplus.in/13s
  - title: OPPO — ColorOS 11 User Guide
    url: https://ipics.oppo.com/oppo_nl/answer/ColorOS_11.1_User_Guide_V1.1.pdf
  - title: OnePlus Community — User reports about dialer activation, not an official support bulletin
    url: https://community.oneplus.com/thread/2209950220253396997
  - title: OnePlus Community — Regional differences and a Nord CE5 failure report
    url: https://community.oneplus.com/thread/2210873546844930049
  - title: realme Community — Original user-submitted dialer post with unverified steps
    url: https://c.realme.com/in/post-details/2100265860689149952
  - title: realme Community — Follow-up user post and conflicting eligibility reports
    url: https://c.realme.com/in/post-details/2101090378361864192
  - title: Google — Check or change your default phone app
    url: https://support.google.com/gemini/answer/15575143?hl=en
  - title: Callery recording filename compatibility
    url: https://github.com/virusz4274/callery/blob/main/docs/recording-filenames.md
---

**The same brand can need different methods.** Some OnePlus, OPPO, and realme phones already have an OEM Phone app; others may use official ODialer, while some builds have a separately reported activation option. Choose using your exact model, region, software build, and current dialer. Sharing OxygenOS, ColorOS, or realme UI ancestry does not make the methods interchangeable.

**Yes, ODialer supports call recording as a feature:** its [official Google Play listing](https://play.google.com/store/apps/details?id=com.oplus.dialer&hl=en) advertises manual and automatic recording. That does not guarantee installation eligibility, working recording, or accessible files on your particular phone.

This is source-reviewed guidance, **not hands-on testing or a certified device list**. For help choosing, use **Copy AI instructions** above with ChatGPT or Gemini and fill in your phone details, or read the [AI research guide](/guides/set-up-call-recording-with-ai).

## Start here: which route applies?

| What you find on your phone | Next step | What it establishes |
| --- | --- | --- |
| A working manufacturer Phone app with recording controls | Use **Route A**. You do not need ODialer or an activation code. | An existing recording option; file access still needs testing. |
| Google Phone is the default, or the OEM app is absent | Check **Route B**, official ODialer, on that phone. | The store decides installation eligibility; recording still needs testing. |
| A source describes an alternate-dialer setting or code | Read **Route C** and check the exact model, region, and full build first. | A reported possibility, not permission to apply another phone's method. |
| None of the above is established | Keep the working dialer and use the research prompt or ask manufacturer support. | No verified OEM route for the current build; not permanent hardware incompatibility. |

Before changing anything, note **Settings → About device / About phone**: model number, country of purchase/use, regional variant or carrier, Android version, full OxygenOS/ColorOS/realme UI build, and security patch. Under **Phone → App info**, note the publisher and app version. An app called “Phone” may be Google Phone or an OEM app; the icon or the word “stock” alone does not identify it.

Keep the previous Phone app, Contacts app, and their data while testing. These instructions use existing apps and the official store; they do not use external APKs, root, firmware flashing, region changes, or storage-permission bypasses. A change of dialer does not migrate existing private Google Phone recordings.

## Route A: use the built-in OEM dialer when present

OnePlus's official India pages for the [Nord 5](https://www.oneplus.in/nord-5) and [13s](https://www.oneplus.in/13s) name **OnePlus Dialer**. This establishes that some current phones offer it, not that every OnePlus model or regional build does. OPPO's [ColorOS 11 manual](https://ipics.oppo.com/oppo_nl/answer/ColorOS_11.1_User_Guide_V1.1.pdf) documents OEM recording but explicitly scopes features by model and region. It is historical documentation, not proof of every current ColorOS or realme UI menu.

1. Open the installed manufacturer Phone app and its settings. Look for **Call recording**; the OPPO manual describes **Call → Settings → Call recording**. Labels vary.
2. Use manual recording or automatic rules only if those controls actually appear. An AI call summary or transcription feature alone does not prove that an exportable recording is saved.
3. If you need to select the app, note the previous default, then use **Settings → Apps → Default apps → Phone app**. [Google documents default-phone selection](https://support.google.com/gemini/answer/15575143?hl=en); menu names vary.
4. Run the calling and file checks below. If the app or recording control is missing, this route is not established; check the next route independently.

## Route B: check official ODialer eligibility

Open [ODialer on Google Play](https://play.google.com/store/apps/details?id=com.oplus.dialer&hl=en) **on the phone you want to use**. The publisher is **ColorOS**, the developer is **HEYTAP PTE. LTD.**, and the package is `com.oplus.dialer`. The listing requires **Android 12 or later**; that minimum is not a compatibility list for OnePlus, OPPO, or realme.

1. Install only if Google Play offers it for this device. If it says unavailable or incompatible, stop this route; do not substitute an APK mirror.
2. Open it, grant the normal calling permissions it requests, and select it as the default Phone app if prompted. Keep the previous dialer installed.
3. Look for **Settings → Call recording** and the recording control during a connected call. Menu wording and automatic-recording choices depend on the installed version and firmware.
4. Test incoming and outgoing calls and a short recording with the other participant's agreement. Confirm both voices in playback, then check the originals below.

If ODialer crashes, loses the call screen, switches unexpectedly to another app, or has no working recording control, restore the previous default through **Default apps → Phone app** and stop that route. Store eligibility alone does not prove it works. A failed ODialer route does not rule out a separately documented built-in dialer option.

## Route C: community-reported stock dialer activation

**This is a research option, not a universal code tutorial.** The [OnePlus Community megathread](https://community.oneplus.com/thread/2209950220253396997) contains user reports that entering `*#*#677776#*#*` in Google Phone opens a system install/restart prompt on some Indian builds, followed by a new Phone/Contacts app after restart. The reports are not an official support bulletin and do not supply a complete successful-build compatibility list or a reliable full rollback procedure.

[A separate OnePlus discussion](https://community.oneplus.com/thread/2210873546844930049) includes a failure report for a global Nord CE5 in Bangladesh on OxygenOS `16.0.5.1300`. An “August update or newer” claim is therefore insufficient to select this method. A OnePlus success report also does not establish an OPPO or realme route.

The [September 16, 2026 realme Community post](https://c.realme.com/in/post-details/2100265860689149952) is user-submitted, proposes disabling/re-enabling Google Phone and several different codes, and admits the method did not activate on the author's own device. Its [follow-up](https://c.realme.com/in/post-details/2101090378361864192) changes the code and steps; comments still report failure after the claimed prerequisite update. These posts do not establish a reproducible realme setup. We do not recommend their speculative code list or Google Phone disabling steps.

Before attempting any activation, require a readable source matching **your model number, region, and full firmware build**, an explanation of the exact system prompt and what it changes, and a documented way to undo it. Use the [research prompt](/guides/set-up-call-recording-with-ai) or manufacturer support to fill those gaps. The sources above alone do not satisfy that check. Do not try the example speculatively or cycle through alternate codes.

If a properly matched route is later established, preserve the original default and app data, follow only that route's documented system prompt, and complete the tests below. A new app icon or a restart is not recording verification. Restoring the old default Phone app restores the calling selection; it does not necessarily undo all changes made by an activation routine.

## Verify the recording and original files for every route

**Recording support and Callery archive compatibility are separate checks.** Google Phone can offer recording on supported configurations, but its individual Share workflow is not a supported Callery bulk archive source. Read [the Google Phone limitation](/guides/export-google-phone-call-recordings) if that is your current setup.

1. After a dialer change, verify ordinary **incoming and outgoing calls**, contacts, and access to the in-call screen. Make a short agreed test recording and confirm both voices are audible. Do not assume announcement behavior from another app or regional build.
2. Open **My Files / File Manager** and locate the newly recorded audio. The historical OPPO manual describes **File Manager → Audio**; use the sample's file details to find its actual parent folder. There is no verified universal folder for all three brands or current ODialer versions.
3. Confirm you can open that folder, select several **original files together**, and copy them without the dialer's or Recorder app's individual Share action. Playback inside Phone alone does not establish file access.
4. Copy, rather than move, a small sample to a computer using USB **File transfer** or another normal file-copy method. Preserve each filename and extension and keep the phone originals intact.
5. Import the sample into Callery. Check playback, the caller, and the historical call date against the phone before importing a large archive.

Callery accepts **MP3, WAV, M4A, MP4, and WebM**. AMR, AWB, and standalone AAC are not in the current upload allowlist; changing an extension does not convert audio. Its recognized ColorOS filename profile is `<caller>-YYMMDDHHmm`, a local timestamp with minute precision. That is a file pattern, not certification of every phone or dialer version. Check [the filename reference](/docs/recording-filenames) for other supported patterns.

If the originals are inaccessible, or a sample becomes **unknown caller** or **upload time**, the archive check has failed even when recording and playback work. Keep the originals and report exactly which check failed. Do not bypass private folders or give Callery unrestricted phone-storage access: its web app/PWA uses files you select through the browser picker.

Once the checks pass, follow the [bulk backup and import guide](/guides/backup-and-organize-android-call-recordings). Repeat a small check after significant OS or dialer updates before relying on the setup again.
