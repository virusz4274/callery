# Security policy

Report suspected vulnerabilities privately using [GitHub's vulnerability reporting page](https://github.com/virusz4274/callery/security/advisories/new). If private reporting is unavailable, open a public issue asking the maintainer for a private contact channel without including exploit details or sensitive data.

Include the affected version, deployment profile, impact, and reproduction using synthetic data. Never send deployment `.env` files, API keys, session/share/upload tokens, private recordings, transcripts, customer identities or signed storage URLs through public issues.

Only the latest tagged release is targeted for security fixes. This is a beta project; no response-time or availability guarantee is offered. Apply fixes promptly, configure verified email for public deployments, keep audio buckets private, and maintain tested database, object-storage and encrypted configuration backups.

## Retained history

The operator has stated that credentials formerly present in Git history were revoked. History is retained. Revocation is not evidence that every historical credential has been identified: a full-history audit and review of its findings are required before a public release.

### Audit on 2026-11-12

Pinned Gitleaks 8.30.1 found **zero current-source findings** across 1,071 tracked and untracked nonignored files. The saved deployment `.env` is ignored and untracked; credential fields in `.env.example` are empty. One synthetic authorization placeholder in a source comment was rewritten as prose without changing runtime behavior.

The retained-history audit covered all 496 locally stored commits, including 18 reflog-only commits. It reported 92 occurrences representing 25 distinct rule/value fingerprints: 19 potentially sensitive credentials, four intended public client configuration values, and two synthetic placeholders. Findings include API tokens and private-key material. Provider-side revocation and client-key restrictions were not independently verified. This audit does not cover unfetched remote branches or establish that historical credentials are safe to reuse.

The historical secret gate therefore remains failing until the findings are individually reviewed and any sensitive credentials are confirmed revoked. No historical findings were automatically acknowledged, no history was rewritten, and no replacement credentials were generated. Raw reports and the temporary scanner were deleted; retained audit evidence contains only redacted fingerprints and locations.

CI uses pinned Gitleaks to scan current tracked files, untracked nonignored files, and all reachable Git history. Ignored deployment environment files are excluded from the current-tree scan. The wrapper emits only locations and SHA-256 fingerprints; raw reports exist briefly in a private temporary directory and are deleted. Historical exceptions may contain only fingerprints of findings individually confirmed revoked by the operator. They never exempt the current source tree. Review new findings before adding a baseline; do not automatically accept all findings to make CI green.

```sh
# Requires an existing Gitleaks 8.30.1 executable; no tool is downloaded here.
node scripts/scan-secrets.mjs
# Only after reviewing a reported historical fingerprint and confirming revocation;
# replace the placeholder with that finding's SHA-256 (repeat for each reviewed key):
CONFIRM_REVOKED_HISTORY=yes node scripts/scan-secrets.mjs --acknowledge-fingerprint=REVIEWED_SHA256
```

Review and commit `security/revoked-history.json` with an explanation of the review. If Gitleaks or complete Git history is unavailable, the release audit remains pending. A clean scan complements provider-side revocation and repository secret protection; it does not certify that no secret has ever existed.
