# Transcription batches

Open **Transcription → Bulk import** to upload a collection for processing later.
These uploads are held before any provider call, even when ordinary uploads
automatically transcribe. The normal Upload page keeps its existing policy.

## Prepare and run

- Waiting recordings are grouped by the validated date in their original filenames,
  newest first. Explicit timezone offsets do not change that calendar date. Files
  without a recognized call timestamp appear under **Recording date unavailable**.
- Select a date or a smaller selection from it. Save a named batch for another day,
  or start it immediately. A batch contains up to 1,000 recordings from one date
  group. Saving reserves those recordings so another batch cannot take them.
  Only an unstarted batch can be edited or removed; removing it returns its
  recordings to the waiting list without deleting the files. Started membership
  is fixed.
- Pause stops additional recordings from starting. An already submitted recording
  finishes, including related AI processing. Resume requires an explicit action.
- Completing one batch does not start another saved draft. Other batches you
  already started remain eligible for the shared dispatcher. Batches and history
  remain available across sign-outs, refreshes, and application restarts.

Each user manages their own recordings. Company provider/model restrictions and
existing access and billing checks still apply. A batch uses the provider and
model shown when saved; changing deployment defaults does not silently switch it.

## Usage and failures

Audio duration is a planning aid, not a provider credit balance or monetary cap.
Transcription may also generate a summary, transliteration, and search embedding.
Ordinary automatic work elsewhere in the instance can still use provider credits.

The shared MongoDB dispatcher allows one recording pipeline at a time across the
instance, including automatic transcription from ordinary uploads, manual
requests and cloud jobs awaiting callbacks. Errors stop the affected batch. Uncertain outcomes need
explicit review before retrying because the provider may already have charged.
Ordinary single-recording requests also ask for acknowledgment before an uncertain
retry. Provider callbacks carry an attempt identity to reject stale completions.

Use **Retry unfinished recordings** after resolving the displayed issue, or
**Resume enrichment** when the transcript is already saved. The retry covers all
failed or uncertain recordings in that batch and preserves completed work.
Insufficient prepaid credit, operator pause, provider quota and provider
configuration have different remedies. Results marked for administrator review
cannot be retried from the batch card.

Transcripts and successful AI steps are checkpointed. Retrying failed enrichment
uses that transcript and skips already saved steps, without retranscribing audio.
Manual results, Soniox callbacks and ElevenLabs callbacks use the same transcript
acceptance and charge-once completion path. A saved transcript with unfinished AI
appears as **Transcript saved**, with an enrichment remedy instead of a success
notification. Notifications are deduplicated per accepted result and outcome.

New AI plans pack adjacent indexed multilingual text into bounded requests while
retaining speaker, word and timing metadata locally. Summary chunks cover the
whole recording; intermediate requests state their 192-token limit and the final
summary remains limited to 512 tokens. Accepted v1 plans and checkpoints retain
their original prompts, models, request identities and chunk layout.

An accepted asynchronous request with no completion after 24 hours is marked for
review; it is never resubmitted automatically.

## Operations

Keep `/api/cron/process-ingestion` scheduled every five minutes with the existing
cron bearer secret. Starts, resumes, and callbacks also wake the dispatcher, while
cron repairs interrupted reservations and job creation and continues approved work.
MongoDB stores imports, batches, execution attempts, and the shared dispatch slot;
no Redis, extra worker service, or additional dependency is required.

Bulk imports are initiated through the web manager in this version. Scheduled batch
starts, provider balance synchronization, and monetary limits are not implemented.
