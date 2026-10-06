<!-- BEGIN:nextjs-agent-rules -->

# This is NOT the Next.js you know

This version has breaking changes — APIs, conventions, and file structure may all differ from your training data. Read the relevant guide in `node_modules/next/dist/docs/` (resolved from this file's directory; in monorepos the `next` package may not be visible from the repo root) before writing any code. Heed deprecation notices.

This block is written and re-added by `next dev` — verify at `node_modules/next/dist/server/lib/generate-agent-files.js`. Removing it from a diff only re-creates the uncommitted change; committing it with your work keeps the tree clean.

<!-- END:nextjs-agent-rules -->

## Preserve the self-host test environment

- The user's `.env` configures the shared self-host test deployment. Multiple local chats use this checkout. Preserve filled credentials, URLs, and integration choices during code changes, refactors, UI work, and testing. Never replace this file from `.env.example` to prepare a test.
- Use the saved `NEXT_PUBLIC_APP_URL` for browser checks and screenshots. The current test site is `https://vosift.coarde.com` through Cloudflare Tunnel. Preserve this URL, the Contacts callback, the selected email provider, and existing authentication, encryption, webhook, and push keys unless the user requests a specific change.
- Isolated automated tests must override environment variables in their own process or use a separate temporary workspace and service port. Do not persist fixture values into `.env`, `.env.local`, or `.env.development*`. Playwright supports `TEST_BASE_URL` for targeting the public test site.
- Before an authorized `.env` edit, read the latest file and change only the requested fields. Check that the file has not changed before writing so another chat's edits are preserved. Never print secrets.
