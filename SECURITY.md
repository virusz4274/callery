# Security policy

Report suspected vulnerabilities privately using [GitHub's vulnerability reporting page](https://github.com/virusz4274/callery/security/advisories/new). If private reporting is unavailable, open a public issue asking the maintainer for a private contact channel without including exploit details or sensitive data.

Include the affected version, deployment profile, impact, and reproduction using synthetic data. Never send deployment `.env` files, API keys, session/share/upload tokens, private recordings, transcripts, customer identities or signed storage URLs through public issues.

Only the latest tagged release is targeted for security fixes. This is a beta project; no response-time or availability guarantee is offered. Apply fixes promptly, configure verified email for public deployments, keep audio buckets private, and maintain tested database, object-storage and encrypted configuration backups.

## Retained history

The operator has stated that credentials formerly present in Git history were revoked. History is retained. Revocation is not evidence that every historical credential has been identified: the full-history audit must still run before a public release.

CI uses pinned Gitleaks to scan the current tracked source and all reachable Git history. The wrapper emits only locations and SHA-256 fingerprints; raw reports exist briefly in a private temporary directory and are deleted. Historical exceptions may contain only fingerprints of findings individually confirmed revoked by the operator. They never exempt the current source tree. Review new findings before adding a baseline; do not automatically accept all findings to make CI green.

```sh
# Requires an existing Gitleaks 8.30.1 executable; no tool is downloaded here.
node scripts/scan-secrets.mjs
# Only after reviewing a reported historical fingerprint and confirming revocation;
# replace the placeholder with that finding's SHA-256 (repeat for each reviewed key):
CONFIRM_REVOKED_HISTORY=yes node scripts/scan-secrets.mjs --acknowledge-fingerprint=REVIEWED_SHA256
```

Review and commit `security/revoked-history.json` with an explanation of the review. If Gitleaks or complete Git history is unavailable, the release audit remains pending. A clean scan complements provider-side revocation and repository secret protection; it does not certify that no secret has ever existed.
