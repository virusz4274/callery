# Recording integration API

Connect a sync client, CRM, or other trusted tool to any Vosift instance using its
public server URL and a named API token from **Settings → Integrations**. No Android
client is included. The machine-readable contract is `GET /api/v1/openapi.json`.

## Credentials and permissions

Send `Authorization: Bearer <token>` on authenticated `/api/v1` requests. Never send
the Vosift token to a returned storage URL. Tokens default to 90 days; users can
choose a date or no expiration. The secret is displayed once and only its hash is
stored. Rotation immediately invalidates the previous credential while preserving
the integration identity and upload sessions. Revocation prevents further API
access. Disabling/deleting an account or revoking its access invalidates its tokens.

| Permission | Access |
| --- | --- |
| `recordings:upload` | Create, inspect, complete, and cancel this integration's uploads |
| `recordings:read` | List/read the owner's recordings, summaries, and transcripts |
| `recordings:download` | Get short-lived audio playback/download URLs |
| `recordings:transcribe` | Explicitly request transcription of an owned recording |
| `company:recordings:read` | Read the company archive, for current company administrators |
| `company:recordings:download` | Download company audio, for current company administrators |

Company permissions are explicit and checked against the administrator's current
role on every request. All uploads belong to the token creator. API tokens cannot
manage credentials, authenticate to browser/admin APIs, or replace share/upload
completion tokens. Token management endpoints require an instance-native session.

**Automatic transcription follows account/company settings**, including for
upload-only tokens. The transcription permission controls explicit API requests.
Transcription eligibility, quotas, configured providers, and company overrides
still apply. Recording retention also follows account/company settings.

## Quick start

The examples use placeholder credentials. Store real tokens in your client's
secure credential store. `BASE_URL` is the instance origin without a trailing slash.

```sh
BASE_URL=https://vosift.example.com
TOKEN=your-api-token
curl "$BASE_URL/api/v1/capabilities"
curl -H "Authorization: Bearer $TOKEN" "$BASE_URL/api/v1/me"
```

For a one-request upload, send the metadata JSON field **before** the file field:

```sh
curl -X POST "$BASE_URL/api/v1/recordings" \
  -H "Authorization: Bearer $TOKEN" \
  -H "Idempotency-Key: crm-call-123" \
  -F 'metadata={"fileName":"call.wav","fileSize":16044,"recordedAt":"2026-10-09T09:00:00+05:30","source":"crm","externalId":"call-123","tags":["sales"],"metadata":{"dealId":"deal-456"}}' \
  -F 'file=@call.wav;type=audio/wav'
```

`fileSize` must be the actual byte count. The default simple upload limit is
25 MiB; deployments can lower it with `INTEGRATION_SIMPLE_UPLOAD_MAX_BYTES`.
Check capabilities rather than assuming a platform's request-size allowance.
Recording formats are MP3, WAV, M4A, MP4, and WebM. Maximum recording size is
5 GiB; transcription eligibility remains limited to 2 GiB.

Explicit timestamp/contact fields take precedence over filename parsing. Timestamps
require a timezone. Contact IDs must belong to the uploader. Use `contactId: null`
to avoid linking a contact. Arbitrary metadata is an embedded JSON object limited
to 16 KiB, five nesting levels, and 100 characters per top-level key. Tags are
limited to 50 entries of 64 characters each.

## Resumable direct uploads

1. `POST /api/v1/uploads` with JSON metadata and a stable `Idempotency-Key`.
2. `POST /api/v1/uploads/{id}/parts` with `{"partNumbers":[1,2]}` to get signed URLs.
3. PUT each byte range to its returned URL. Each part is 8 MiB except the final
   part. Use the returned headers, method, and expected byte count.
4. After a restart or network interruption, `GET /api/v1/uploads/{id}` reports
   storage-confirmed part numbers. Upload only missing parts. Request fresh URLs
   when a signed URL expires.
5. `POST /api/v1/uploads/{id}/complete`. The server verifies parts, audio/container
   compatibility, and object size, then returns the recording ID.

Sessions last 24 hours and storage URLs last 15 minutes. Sessions belong to one
integration, and token rotation preserves access to them. Cancel unfinished work
with `DELETE /api/v1/uploads/{id}`. Expiration/cancellation aborts storage uploads
and releases reserved capacity. Finalized recordings use separate keys, so an old
upload URL cannot overwrite them. Existing signed storage URLs remain usable until
expiry or storage-side cancellation; token revocation alone cannot invalidate them.

Example for a trusted Node.js client (store session IDs locally for recovery):

```js
import { open, stat } from 'node:fs/promises';
import { randomUUID } from 'node:crypto';

const origin = process.env.VOSIFT_URL.replace(/\/$/, '');
const token = process.env.VOSIFT_TOKEN;
async function api(path, method = 'GET', body, key) {
  const response = await fetch(`${origin}/api/v1${path}`, {
    method,
    headers: { Authorization: `Bearer ${token}`, ...(body ? { 'Content-Type': 'application/json' } : {}), ...(key ? { 'Idempotency-Key': key } : {}) },
    ...(body ? { body: JSON.stringify(body) } : {}),
  });
  const result = await response.json();
  if (!response.ok) throw new Error(`${result.error.code}: ${result.error.message}`);
  return result.data;
}

const path = 'call.wav';
const metadata = { fileName: 'call.wav', fileSize: (await stat(path)).size, source: 'sync', externalId: 'device-1:recording-123' };
// Persist this key with the recording; reuse it after timeouts/restarts.
const requestKey = randomUUID();
const session = await api('/uploads', 'POST', metadata, requestKey);
if (session.state !== 'completed') {
  const status = await api(`/uploads/${session.id}`);
  const existing = new Set((status.parts || []).map(part => part.partNumber));
  const file = await open(path);
  try {
    for (let part = 1; part <= session.partCount; part++) {
      if (existing.has(part)) continue;
      const { parts: [target] } = await api(`/uploads/${session.id}/parts`, 'POST', { partNumbers: [part] });
      const bytes = Buffer.alloc(target.size);
      const { bytesRead } = await file.read(bytes, 0, bytes.length, (part - 1) * session.partSize);
      if (bytesRead !== bytes.length) throw new Error('Local file changed during upload');
      const response = await fetch(target.url, { method: target.method, headers: target.headers, body: bytes });
      if (!response.ok) throw new Error(`Part upload failed: ${response.status}`);
    }
  } finally { await file.close(); }
}
const completed = await api(`/uploads/${session.id}/complete`, 'POST');
console.log(completed.recordingId);
```

### Retries and duplicate prevention

Upload creation and simple uploads require `Idempotency-Key`; keep it stable across
retries. Matching retries return the original session/result. Changing request
metadata with the same key returns `409 idempotency_conflict`. Keys are retained
for at least seven days. Completion can be retried without an idempotency header.

Supply `source` plus `externalId` for persistent duplicate protection across token
rotation, app reinstalls, or different request keys. Their pair is unique within
the owner's account. Reusing it with conflicting metadata returns
`409 external_id_conflict`; it never overwrites the existing recording.

Clients should back off on `409 upload_busy`, `429`, and `503`, honoring
`Retry-After`. Inspect the existing session after a timeout. A cancelled/expired
session requires a new upload key. Simple uploads restart the transfer on retry;
resumable uploads retain confirmed parts. Multipart ETags are not whole-file hashes.

## Read, download, and process recordings

```sh
curl -H "Authorization: Bearer $TOKEN" "$BASE_URL/api/v1/recordings?source=crm&externalId=call-123"
curl -H "Authorization: Bearer $TOKEN" "$BASE_URL/api/v1/recordings/RECORDING_ID"
curl -H "Authorization: Bearer $TOKEN" "$BASE_URL/api/v1/recordings/RECORDING_ID/download"
curl -X POST -H "Authorization: Bearer $TOKEN" -H 'Content-Type: application/json' \
  -d '{}' "$BASE_URL/api/v1/recordings/RECORDING_ID/transcribe"
```

List results support `page` (default 1), `limit` (default 20, max 100), `search`,
`source`, `externalId`, `startDate`, `endDate`, and `includeArchived=true`. Recording
detail includes available transcript/summary and the latest persisted processing
job state. Poll it with backoff until transcription is completed or failed. Explicit
transcription returns `202` after work is persisted. Provider submissions with an
uncertain outcome are flagged for review rather than blindly submitted again.
Download URLs expire after five minutes. Outbound webhooks are deferred.

Responses use `{ "success": true, "data": ..., "requestId": ... }` or
`{ "success": false, "error": { "code": ..., "message": ... }, "requestId": ... }`.
The request ID is also returned in `X-Request-Id`. Authenticated responses are not
cached. Limits are 120 requests/minute per token, 600 per owner, 10 new uploads/minute
per token, and 10 simultaneously reserved uploads per owner.

## Self-hosting and operations

- Keep `NEXT_PUBLIC_APP_URL` set to the public instance origin. The future client
  accepts that URL; no Vosift cloud host is hard-coded. Preserve existing OAuth,
  webhook, and deployment URLs when configuring clients.
- Storage supports R2, MinIO, and S3-compatible backends with multipart create,
  list, complete, abort, head, get, and copy operations. `S3_PUBLIC_ENDPOINT` must
  be reachable by clients; internal and public endpoints can differ.
- Browser integrations need bucket CORS allowing their trusted origins, PUT,
  and required headers. Expose `ETag` when a browser reads it. Native/server clients
  do not need browser CORS. The bearer-only versioned API allows browser preflights
  without cookie credentials; never embed a long-lived account token in a public site.
- Run `pnpm db:init` during deployment. Required unique indexes are also checked
  lazily; API requests return `503 api_not_ready` if index setup fails.
- Schedule `GET /api/cron/process-ingestion` every five minutes with the existing
  `CRON_SECRET` bearer header. Compose and Vercel schedules include it. Other hosts
  must configure the caller. Pending completion, cleanup, and processing survive
  application restarts; `after(...)` provides immediate execution when available.
- Proxy/platform body limits can be lower than 25 MiB. Set the effective simple
  upload limit accordingly and use direct uploads for larger files. The simple
  upload endpoint bypasses Next Proxy request-body cloning and buffers at most
  one storage part rather than the whole recording.
- Failed cleanup keeps its durable object references for retry. Successful upload
  sessions are kept for 30 days; settled accounting receipts compact after one day.
  Neither rotation nor API versioning changes existing browser/mobile contracts.
- Configure the bucket to abort incomplete multipart uploads through a lifecycle
  rule. This covers storage creation requests that succeed before a lost response
  prevents the application from receiving or persisting the upload ID.

## Verification

`pnpm test` includes schema, token, error-envelope, and DTO regression tests.
For concurrency and crash recovery, provide an isolated MongoDB service via
`VOSIFT_TEST_MONGODB_URI` and run `src/lib/integrations/ingestion.integration.test.ts`.
The test creates and drops a random database; it never changes deployment `.env`
files. `storage.integration.test.ts` additionally accepts an isolated S3-compatible
service through its `VOSIFT_TEST_STORAGE_*` process variables.

`http.integration.test.ts` exercises the actual Next route with
`VOSIFT_TEST_API_BASE_URL` and `VOSIFT_TEST_API_MONGODB_URI`. Start a separate app
process with that database first. Both targets must use loopback hosts, and the
database name must start with `vosift_api_`. The test removes only its fixtures.
The browser test is `e2e/integration-settings.spec.ts`; `TEST_BASE_URL` may point
to an isolated preview with process-only configuration.

Run standalone packaging checks with dependencies installed inside that workspace.
A junction to another checkout makes Next copy an external dependency link, which
`prepare-standalone.mjs` correctly rejects. Such a preview can verify compilation
and browser behavior, but does not verify standalone packaging. Full storage
compatibility testing must run without `VOSIFT_TEST_STORAGE_PARTS_UNSUPPORTED`;
the explicit S3rver mode omits unsupported list-parts and abort operations.
