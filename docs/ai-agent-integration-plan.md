# Callery API and AI integration

**Status:** Local implementation delivered. Platform registration, browser acceptance, and publication have separate gates.

**Baseline:** Local `main` at `23e16f0`; pre-rewrite commit IDs are obsolete.

**Updated:** 2026-11-12.

This document preserves the six agreed workstreams. Existing passage search and
upload infrastructure are reused; their implementation is not an outstanding
summary-only search redesign. See [Integration API](integration-api.md) for the
customer-facing contract and [MCP platform setup](mcp-platforms.md) for deployment
and public listing preparation.

## 1. Product architecture

Build and maintain three connected interfaces over shared Callery services:

| Interface | Primary users | Capabilities |
| --- | --- | --- |
| Versioned HTTP API | Future mobile app, phone CRMs, sync clients, third-party services | Upload recordings, track processing, retrieve results, search, and obtain authorized audio access. |
| Remote MCP server | ChatGPT, Claude, Gemini, other agents | Search/read recordings, return Callery links, and request authorized transcription. |
| Callery app | People using a browser or PWA | View/play recordings, upload manually, and manage connections and API keys. |

Reuse the recently added transcript passage search, indexing, and resumable upload services.

Each instance exposes its own endpoints. Public integrations connect to the managed service; self-hosted instances support direct custom connections. Building the future native mobile app is a separate project, but its backend contract is included here.

## 2. Mobile and CRM recording API

Make `/api/v1` the documented interface for new mobile and CRM integrations. Preserve existing contracts and add capabilities without breaking current clients.

- **Authentication:** Support independently named API keys with upload, read, audio-download, and transcription permissions. Each customer connects their own account; the mobile app does not ship with a shared account key. Keep OAuth available for integrations that prefer user-consent flows.
- **File transfer:** Support simple multipart uploads and resumable direct-storage uploads, negotiated through capabilities. Clients receive limited signed URLs rather than storage credentials.
- **Mobile recovery:** Document persisting upload IDs and idempotency keys, refreshing expired part URLs, resuming after connectivity loss, cancellation, and recovery after application restarts.
- **Duplicate prevention:** Preserve idempotency keys for retries and owner-scoped `source` plus `externalId` for durable identification of calls.
- **CRM context:** Accept existing contact, phone, recorded-time, tags, and metadata fields. Clients can attach their call/customer/deal references and retrieve recordings by their external identifiers.
- **Processing:** Preserve automatic-transcription settings, quotas, retention, and explicit transcription permission. Provide polling for processing status and available transcript/summary results; outbound webhooks remain a later addition.
- **Ownership:** Uploads belong to the authenticated account. Acting on behalf of other users requires a future explicit delegation design.
- **Client guidance:** Provide mobile and CRM integration examples covering capabilities, upload, recovery, processing, and result retrieval. Keep OpenAPI synchronized.

API uploads transfer recording bytes into private storage. Callery links reference recordings after they have been uploaded. Large-file resumability requires advertised direct-multipart capability; cookie-authenticated browser upload routes are not a bearer-client fallback.

## 3. Shared authorization and OAuth

- Generalize integration identity so API keys and OAuth grants share permission enforcement, rate limits, upload ownership, idempotency, and durable processing checks. Keep browser sessions distinct.
- Preserve multiple API keys, expiry, rotation, revocation, and existing company API permissions.
- Add a compatible Better Auth OAuth provider inside the existing deployment: authorization code with S256 PKCE, consent, discovery, resource-bound tokens, refresh, and revocation.
- Support client metadata discovery, explicitly enabled rate-limited dynamic registration, and preconfigured clients.
- Use separate MCP and HTTP API token audiences, 15-minute access tokens, and rotating refresh credentials with a 30-day lifetime.
- New OAuth connections default to personal recording read access. Upload, download, and transcription permissions require separate grants; company OAuth access is outside this release.
- Show connected applications and permissions alongside API keys. Revocation, account closure, and disabled-account checks apply across protected operations and unfinished integration work.

## 4. Search, MCP, and public integrations

- Add an authenticated semantic-search API backed by the existing retrieval service. Preserve its contact/date filters, timestamped evidence, coverage, pagination, and keyword fallback.
- Add bounded transcript retrieval. Return allowlisted data rather than raw recording documents.
- Include canonical Callery recording links and transcript-position links. Preserve those destinations through browser sign-in.
- Expose `/mcp/v1` through stateless Streamable HTTP with supported client-version compatibility.
- Provide MCP tools for searching, listing, recording details, transcript pages, opening Callery’s upload page, and requesting transcription.
- AI search results use app links for playback. Direct audio download remains available to separately authorized API clients.
- Searching does not automatically start indexing or retranscription.
- Prepare separate ChatGPT plugin, Claude connector, and Gemini Connected App configurations and publication materials. Validate ordinary web/mobile use; record unsupported or unavailable platform paths honestly.
- Keep platform registration, review, and public publication as distinct release steps. Use verified publisher details and production URLs when available.

## 5. Implementation and acceptance

Implement in this order:

1. Refresh the Markdown draft against the current checkout and preserve recent fixes.
2. Add shared integration identity, OAuth, and connection management.
3. Validate and document mobile/CRM uploads, recovery, and processing contracts.
4. Add search/transcript APIs and safe app links.
5. Add MCP tools and platform packages.
6. Run isolated verification and platform acceptance tests.

Required scenarios:

- Mobile/CRM upload, interrupted resume, application restart, expired signed URLs, duplicate requests, conflicting external IDs, cancellation, quota failures, and unsupported files.
- API-key rotation preserves eligible sessions; revoked credentials cannot create or complete new work.
- OAuth consent, refresh, audience/scope enforcement, revocation, and account closure.
- Cross-account recording and upload isolation; existing browser uploads and company API behavior.
- Processing status and transcript/summary retrieval after uploads.
- Search parity with the app, safe serialization, stale transcript detection, evidence links, and unavailable-vector fallback.
- MCP discovery and tool execution with API keys and OAuth.
- ChatGPT web/Android, Claude web/mobile, and eligible Gemini connections, including sign-in and Callery links.
- Type checking, lint, build, focused tests, and isolated integration checks using the host toolchain.

Preserve deployment configuration and existing processes. Public publication and production indexing changes are separate rollout actions.

## 6. Developer documentation and discovery

Make documentation accessible to developers building mobile applications, CRM integrations, sync clients, and other services.

### Documentation location

- Add a public `/developers` page as the entry point.
- Link to the maintained GitHub integration guide for detailed instructions.
- Link to the current instance’s `/api/v1/openapi.json` for its deployed API contract.
- Link to Settings → Integrations for creating and managing API keys.
- Include links to MCP connection instructions for ChatGPT, Claude, and Gemini.
- Add `/developers` links to public navigation/footer and Settings → Integrations.

### Documentation content

Expand the customer-facing integration guide to cover:

- Choosing an instance URL and creating a separately scoped API key.
- API keys versus OAuth, permissions, expiration, rotation, and revocation.
- Capability discovery, supported formats, size limits, and deployment-dependent upload modes.
- Simple and resumable uploads, with working examples.
- Mobile offline/restart recovery, expired part URLs, cancellation, and retry behavior.
- Idempotency keys, `source`, `externalId`, and CRM/customer/deal metadata.
- Contact association and timestamps with timezones.
- Automatic and explicit transcription, processing status, transcripts, and summaries.
- Recording search, filters, evidence, pagination, and fallback behavior.
- Callery app links versus separately authorized audio-download URLs.
- Errors, rate limits, quotas, polling, and troubleshooting.
- Self-hosted configuration and version compatibility.

### Maintenance and verification

- Keep the detailed guide in repository Markdown as the maintained source; the website hub links to it.
- Keep internal Server Actions/private-route documentation separate from the public integration contract.
- Update the guide, OpenAPI, and examples alongside API changes.
- Deliver documentation work alongside implementation steps 3–5.
- Check public access to `/developers`, navigation links, instance-local OpenAPI, and examples against actual endpoints.
- Use placeholder credentials in examples and verify GitHub links after the corresponding documentation is available there.

## Delivery record

- Implemented shared API-key/OAuth authorization, session-bound consent and refresh, connected-app management, and grant/account revocation through durable upload processing.
- Added `/api/v1/recordings/search`, bounded transcript pages, safe app/evidence links, and six stateless MCP tools at `/mcp/v1` while preserving existing mobile/CRM upload contracts.
- Added `/developers`, navigation/settings links, expanded API documentation, and platform setup/configuration templates under [`integrations/`](../integrations/README.md).
- The complete unit suite passed: 1,090 passing checks, 33 opt-in/platform-specific skips. Real provider/MongoDB checks passed for OAuth consent, refresh, audience isolation, disconnect, reauthorization, upload ownership across refresh, and disabled-client recovery. Existing authentication, ingestion, and durable processing database tests also passed using disposable databases.
- Dependency/release/runtime regression checks passed. The dependency audit remains nonzero on inherited findings: baseline and updated production reports have the same 11 advisory IDs and vulnerable paths; the added packages introduce no new reported production findings.
- Browser checks of `/developers` at 360px and 1280px against the saved public URL were attempted but received HTTP 502 from the tunnel. No deployment URL or existing process was changed.

Type checking, lint, and production build/PWA packaging passed local verification. Platform-account tests, verified publisher details, recorded demos, public deployment, review, and publication remain unverified until evidence is recorded in [MCP platform setup](mcp-platforms.md). Do not treat a configuration template as an approved plugin or SDK protocol tests as real Android/iOS acceptance. New GitHub-linked documentation must be pushed before those repository URLs can serve it. No real credentials belong in the templates.

### Follow-ups from implementation audit

- Correct the shared OAuth connection's browser-session binding: a second session can invalidate the first, and browser-session expiry currently limits the planned 30-day refresh lifetime.
- Declare each operation's required OAuth scopes in the standard OpenAPI security requirements.
- Improve inherited keyword-fallback evidence to include the actual match when it occurs beyond the first 600 characters of a transcript segment.
- Add successful recording-tool execution through MCP with real API-key and OAuth authentication; complete real platform/browser acceptance and public release materials separately.

These findings remain open; passing existing automated tests does not close them.
