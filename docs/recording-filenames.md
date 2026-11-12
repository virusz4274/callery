# Recording filename metadata

Web and mobile direct uploads share `prepareUploadContext` and the filename parser in
`src/lib/utils/filename-parser.ts`. Both upload initialization and completion use
validated caller metadata. Completion retains the signed timestamp and storage key.
Original filenames are stored unchanged. Existing recordings are not migrated.

## Archive requirements

Callery’s supported bulk archive workflow starts with original recordings that
the user can see in a phone file manager and copy together without renaming.
Samsung Phone’s documented folder is `Internal storage/Recordings/Call` on
supported setups. Other OEM dialers require a check on the actual firmware.
See the [device compatibility guide](https://getcallery.com/phone-compatibility).

Individual exports from Google Phone are not a supported archive workflow.
Google documents in-app sharing, not a bulk original-folder export or a stable
caller/date filename contract. Callery has no access to the dialer’s private
call log and cannot recover metadata absent from the copied filename. Accepting
an audio upload is separate from successfully organizing it by caller and call
date; the fallback below does not establish device compatibility.

## Recognized patterns

The extension is ignored for metadata recognition; it is checked separately by the
audio upload allowlist. Recognition describes a filename pattern, not certification
of every model, firmware version, or dialer shipped by a brand.

| Recorder | Filename stem | Metadata |
| --- | --- | --- |
| Samsung | `Call <caller>_YYMMDD_HHMMSS` or `Call recording <caller>_YYMMDD_HHMMSS` | Name or phone, local call timestamp |
| Xiaomi dialer (MIUI; HyperOS when the filename matches) | `<call label>@<phone>_YYYYMMDDHHMMSS` | Phone, local call timestamp; recognized localized labels are discarded |
| Huawei | `<name>@<phone>_YYYYMMDDHHMMSS` | Name and phone, local call timestamp; phone takes priority for contact matching |
| ColorOS | `<caller>-YYMMDDHHmm` | Name or phone, local call timestamp with minute precision |
| GrapheneOS | `CallRecord_YYYYMMDD-HHMMSS_<phone>` | Phone, local call timestamp |
| LineageOS | `<phone>_YYMMDD_HHMMSS[mmm]` | Phone, local call timestamp with optional milliseconds |
| BCR default | `YYYYMMDD_HHMMSS.mmm±HHMM[_in/out/conference][_simN][_<phone>][_<name>]` | Timestamp with offset and optional caller, direction and SIM |
| ASUS sequence exports | `Call recording <sequence>` | Recognized, but contains no caller or call date |
| OPPO voice recorder | `RECYYYYMMDDHHMMSS` | Recording end timestamp; never used as a call start date |

ASUS's older date/name layouts, arbitrary BCR custom templates, and unverified
Google Phone, Vivo/iQOO, Cube ACR, and other dialer variants are not guessed.
Apple-specific patterns are outside this change.

## Xiaomi dialer on HyperOS

HyperOS is included for compatible Xiaomi, Redmi, and POCO setups using Xiaomi's
own dialer. Some regional builds ship with Google Phone but can use Xiaomi's
dialer when the firmware includes and supports it. See the
[HyperOS dialer setup guide](https://getcallery.com/guides/enable-call-recording-xiaomi-hyperos)
for available settings and model-scoped community restoration reports. The guide
restores only verified firmware system packages. Missing required packages or a
failed restoration mean incompatible current firmware for that setup; external
APKs, root, and firmware changes are outside the supported guide. Its
[AI-assisted instructions](https://getcallery.com/guides/set-up-call-recording-with-ai)
use the same limits.

Support depends on the active dialer and its original files. A HyperOS recording
matching the Xiaomi layout above already uses the same parser as MIUI; there is
no separate OS check. The layout evidence is from older MIUI, so this does not
claim that every HyperOS build generates it. An unfamiliar HyperOS filename needs
a sample check before automatic caller/date recognition can be established.

On a compatible Xiaomi dialer setup, check the existing
`Internal storage/MIUI/sound_recorder/call_rec/` folder, copy a few original files
without renaming them, and verify caller, call date, and playback in Callery.
Changing the default dialer alone does not prove recording or folder access,
and it does not migrate recordings previously made in Google Phone.

## Validation and fallback

- Dates must represent a real calendar day from 2000 through 2099. Two-digit years
  map to 2000–2099. Hours, minutes, seconds and UTC offsets are range checked.
- Explicit BCR offsets determine the exact instant, including milliseconds.
  Filenames without an offset preserve the existing server-local timezone behavior;
  they do not identify the phone's timezone. Local DST gaps are rejected.
- Phone numbers preserve their leading zeros and formatting. Only a leading plus,
  digits, whitespace, hyphens and balanced parentheses are accepted, with 3–15 digits.
  Underscores in phone fields are removed. No country code is guessed. Name underscores become spaces; Unicode names and
  joining characters are preserved.
- Unknown/private caller placeholders and sequence numbers never identify contacts.
- Empty names, paths, control/bidirectional formatting characters and names over
  1024 characters are rejected before upload preparation.
- An unrecognized pattern or invalid metadata does not block an otherwise supported
  audio upload. It yields an unknown caller and the upload time. A recognized call
  date may still be used when the filename explicitly marks the caller unknown.

New uploads also retain `recordingDateKey`, the validated call calendar day as
written in the filename, for batch ordering. It is `null` when no recognized valid
call timestamp exists, including OPPO recording-end timestamps. This field does
not change the stored `recordedAt` instant or migrate older recordings.

`parseRecordingFilename` reports the format, recognition status and issues for
diagnostics. `parseUploadContactFromFilename` returns only validated call metadata.
The legacy `parseContactFromFilename` adapter preserves earlier filename-label
behavior and should not be used to infer contacts for new uploads.

Adding AMR, standalone AAC or OGG/Opus audio support requires separate validation
of decoding, playback and transcription; recognizing their filenames does not
add these extensions to the upload allowlist.

## Pattern evidence

- [ColorOS report](https://github.com/nicorac/bcr-gui/issues/100)
- [Huawei and GrapheneOS parser profiles](https://github.com/nicorac/bcr-gui/blob/dev/src/app/models/recording.ts)
- [LineageOS sample](https://github.com/nicorac/bcr-gui/issues/121)
- [BCR default template and optional fields](https://github.com/chenxiaolong/BCR#filename-template)
- [ASUS filename changes](https://zentalk.asus.com/t5/zenfone-9/call-recording-saved-records/m-p/168838)
- [OPPO ColorOS 6.1 guide: Audio Manager](https://ipics.oppo.com/oppo_nl/answer/ColorOS_6.1_User_Guide%281%29.pdf)
- [Older localized MIUI example](https://forums.xiaomi-miui.gr/bugtracker/index.php/Issue/294-%CE%91%CE%BD%CF%84%CE%B9%CE%B3%CF%81%CE%B1%CF%86%CE%AE-%CE%B1%CF%81%CF%87%CE%B5%CE%AF%CF%89%CE%BD-%CE%B7%CF%87%CE%BF%CE%B3%CF%81%CE%AC%CF%86%CE%B9%CF%83%CE%B7%CF%82-%CE%BA%CE%BB%CE%AE%CF%83%CE%B7%CF%82/)
- [Xiaomi's system-file locations, including the OEM call-recording folder](https://www.mi.com/sg/support/article/KA-07847/)
- [First-hand HyperOS recording setup on listed China firmware builds](https://cyrusyip.org/en/posts/2023/11/27/miui-call-recording/)
- [Community-reported HyperOS Xiaomi dialer restoration](https://www.reddit.com/r/HyperOS/comments/1k7ztyg/)
