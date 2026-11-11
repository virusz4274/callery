# AI client configuration templates

These files help operators prepare a remote Callery integration. They contain
example origins, not a verified production endpoint, private app binding,
publisher identity, or approved public listing. They are not a submission-ready
archive. Do not put API keys, OAuth client secrets, or reviewer credentials here.

## ChatGPT

Copy `chatgpt/plugin.template.json` to `plugin.json` and
`chatgpt/mcp.template.json` to `mcp.json` in a separate release directory.
Replace `https://your-callery.example` with the live public instance origin and
check its OAuth connection. Complete the verified publisher, listing URLs, icon,
review cases, demo and reviewer access through the current submission process.
Validate the exact archive before uploading; do not upload these templates.

The portable package names the remote service. The OAuth credentials belong in
the client's connection settings, not the package. For self-hosted users, prefer
a custom connector pointed directly at their instance.

## Claude

Add a remote connector using `https://YOUR_CALLERY_ORIGIN/mcp/v1`, with OAuth.
The connector directory form needs live server, listing, documentation, privacy,
support, and reviewer details. Optional plugin packaging is a separate step; a
desktop extension is not required for this remote integration.

## Gemini

Use `https://YOUR_CALLERY_ORIGIN/mcp/v1` as the Connected App's endpoint. Check
account/category eligibility and current protocol requirements before
registration. Use the Connected Console's actual fields; this repository does
not invent an import schema for that console.

See [platform setup and review checklist](../docs/mcp-platforms.md). Run real
web/mobile acceptance checks before claiming a client is supported.
