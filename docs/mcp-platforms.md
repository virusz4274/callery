# Connect AI assistants to Callery

Callery exposes a remote MCP endpoint at **`https://YOUR_CALLERY_ORIGIN/mcp/v1`**.
Replace the origin with your instance's public HTTPS address. Your computer does
not need to run a local MCP process. The same service is intended for ChatGPT,
Claude, Gemini where eligible, and other compatible clients.

This document describes connection configuration and release preparation. It is
not evidence that a public listing has been approved or that a particular mobile
client has passed testing. Platform availability and requirements can change.

## Choose authentication

For ChatGPT and public user-facing connections, choose **OAuth**. The client
discovers Callery's authorization endpoints, opens Callery sign-in and consent,
and receives a resource-bound token. A new connection requests personal recording
read access; transcription and other actions require their own permissions.

For clients that support a fixed bearer credential, create a separately named API
key in **Settings → Integrations**. Put it in that client's secure credential
store or header configuration, never in a public package or prompt. API-key
rotation and OAuth reconnection are different operations. Disconnect an OAuth app
or revoke an API key in Callery to stop its future authorized requests.

The MCP resource is the exact public endpoint, including `/mcp/v1`. An OAuth token
issued for `/api/v1` is not an MCP token, and the reverse is also true. Do not
reuse browser session tokens as integration credentials.

## What assistants can do

| Tool | Purpose |
| --- | --- |
| `search_recordings` | Find conversations with optional contact/date filters and return evidence and Callery links. |
| `list_recordings` | Browse the personal recording archive. |
| `get_recording` | Read metadata, summary, and processing state. |
| `get_transcript` | Read bounded transcript pages. |
| `open_upload` | Return the Callery upload page; it does not transfer a file or start transcription. |
| `request_transcription` | Request processing with the separate transcription permission. |

Recording links open Callery, where the browser signs in if needed and obtains
authorized playback. Results do not create public shares or return permanent
bucket URLs. The HTTP API separately supports real file uploads and explicitly
authorized audio downloads; see the [integration API guide](integration-api.md).

Start with questions such as:

- “Use Callery to find calls where we discussed changing the delivery date.”
- “Show the relevant transcript passages and links to those recordings.”
- “Open Callery so I can upload a new recording.”

Names mentioned in a transcript are not verified speaker identities. Search
reports missing indexing coverage and keyword fallback; searching does not
automatically start indexing or retranscription.

## ChatGPT web and Android

1. In ChatGPT's web plugin interface, add a custom remote MCP server.
2. Set the endpoint to your exact `https://YOUR_CALLERY_ORIGIN/mcp/v1` URL and
   choose OAuth. Use discovery rather than a manually copied API key.
3. Complete Callery sign-in and approve the requested permissions.
4. Install/enable the connection for a normal conversation and try a search.
5. Test the connected account in the Android app, including Callery links and
   the return from sign-in. If the client requires initial setup on the web,
   document that setup path.

A custom connection is separate from a public directory listing. For a public
plugin, start from the [configuration templates](../integrations/README.md),
replace the example endpoint, validate every tool against the public deployment,
and provide the publisher/listing materials described below. A plugin backed only
by a local desktop server does not satisfy this web/mobile integration.

Official references: [custom MCP connection](https://developers.openai.com/api/docs/guides/custom-mcp-server),
[OAuth authentication](https://developers.openai.com/plugins/build/auth),
[plugin packaging](https://developers.openai.com/plugins/build/plugins), and
[submission](https://developers.openai.com/plugins/deploy/submission).

## Claude web and mobile

1. Add a remote custom connector using the same MCP endpoint.
2. Use OAuth and complete Callery consent. A compatible custom client can also
   use its supported bearer-header setup with a separately scoped API key.
3. Run the example search in normal chat and open a recording link.
4. Test mobile access after connection, permission errors, reconnection, and
   revocation. Record the account type and device used.

Public distribution uses Claude's connector directory process. A plugin may
package a remote connector, but its listing does not replace the server's
authorization. Self-hosted custom URLs need their own setup; do not assume a
single managed-service listing automatically routes to other instances.

Official references: [custom connectors](https://support.claude.com/en/articles/11175166-get-started-with-custom-connectors-using-remote-mcp),
[supported surfaces](https://support.claude.com/en/articles/11725091-when-to-use-desktop-and-web-connectors),
and [directory submission](https://claude.com/docs/connectors/building/submission).

## Gemini Connected Apps

Use the same HTTPS endpoint with Streamable HTTP and OAuth. Add a custom app in
Gemini's web Connected Apps settings where available, or use the applicable
developer test workflow. Validate search and Callery links on the web and mobile.

Custom-app account/region availability and the reviewed Connected Apps program
are separate checks. Do not describe Gemini as generally supported based only on
a local protocol test. Before public registration, verify category eligibility,
Connected Console access, domain ownership, OAuth, and current product/region
availability. Record the actual protocol negotiated; the server must support a
version accepted by the target client. Version changes to registered tools and
schemas through the platform's release process.

Official references: [custom apps](https://support.google.com/gemini/answer/17209137),
[MCP server guide](https://developers.google.com/connected-apps/mcp/),
[integration standards](https://developers.google.com/connected-apps/mcp/server-optimization),
and [registration prerequisites](https://developers.google.com/connected-apps/gpc/prerequisites).

## Review and publication materials

Prepare these against the final deployed tools. They are not supplied by an API
or MCP implementation alone:

- Verified publisher identity, intended countries/languages, live endpoint, and
  support contact.
- Actual product, documentation, privacy, and terms URLs.
- A brand icon meeting the platform's current requirements.
- A reviewer account with synthetic recordings and populated search results;
  deliver credentials only through the platform's secure reviewer fields.
- A recorded demo and test evidence where required; a script is not a recording.
- Accurate permission and processing-usage descriptions. Legal attestations are
  completed by the publisher.

Suggested positive review cases: find a topic, filter by date/contact, inspect a
transcript page, follow a recording link, and open the upload page. Add a scoped
transcription case if that write tool is included in the reviewed configuration.
Negative cases: inaccessible recording ID, missing action scope, and revoked
connection. Use synthetic data and record expected IDs/results before running.

| Release check | Current status |
| --- | --- |
| ChatGPT web connection and OAuth | Not tested in a platform account |
| ChatGPT Android use and sign-in return | Not tested |
| Claude web/mobile connector | Not tested in a platform account |
| Gemini custom/reviewed app eligibility and web/mobile | Not verified |
| Public listings, reviewer demo, publisher verification | Not submitted |

Update statuses with dated evidence after real tests. Local unit/protocol tests
are separate from platform account tests. Submission, approval, and publication
are separate actions; configuration templates are not submission-ready packages.
