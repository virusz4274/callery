# Experimental Cloudflare build

Docker/Node with Next.js is the launch target. The uncommitted vinext/Vite/Workers configuration was retained as an experimental second runtime.

```sh
pnpm dev:vinext
pnpm build:vinext
```

Before auth unification, the combined app passed `build:vinext`. This verified bundling, not a deployed Worker, authenticated Workers requests, long transcription jobs, email transport, archive streaming or offline support. Auth now uses Better Auth and MongoDB in every deployment.

`cloudflare.config.ts` defines the Worker and `nodejs_compat`. Keep runtime secrets in the provider's secret store. Public settings must match the chosen auth/billing profile at build time. Workers still need reachable MongoDB and S3-compatible storage.

`vite.config.ts` strips Next's standalone setting and prebundles storage SDKs in development. The tr46 patch and punycode aliases are retained from the working snapshot for URL-parser compatibility.

Verification gaps:

- vinext ignores the webpack integration. Serwist/PWA behavior is verified only on Node.
- Node compatibility alone does not prove SMTP, archive streaming or `after(...)` lifecycle behavior.
- Scheduled jobs need an HTTP caller; see [scheduled jobs](cron-jobs.md).
- Some routes are reported as unclassified. Routing and auth require a deployment test.

vinext may write types under `.next`. `pnpm typecheck` regenerates Next's route types before TypeScript so the builds do not leave conflicting declarations.

Deployment remains opt-in. Use the [Node setup guide](setup-guide.md) for launch and [reconciliation record](branch-reconciliation.md) for preserved inputs and verification boundaries.
