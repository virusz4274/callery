# Hosted Ops: Sentry Runbook Template

This template is for the first-party hosted Callery deployment only. Do not link it from the public self-host setup flow, and do not commit real DSNs, auth tokens, or project identifiers into this file.

## Purpose

Use this runbook to track the Sentry settings required for the hosted Callery platform:

- runtime DSNs used by the hosted deployment
- build-time source map upload settings
- release conventions
- who owns alerting and incident response

## Runtime Configuration

Set these environment variables only in the hosted deployment environment:

```env
SENTRY_DSN=
NEXT_PUBLIC_SENTRY_DSN=
```

Notes:

- `SENTRY_DSN` is used by the server and edge runtimes
- `NEXT_PUBLIC_SENTRY_DSN` is used by the browser runtime
- if either value is absent, the corresponding runtime will no-op

## Build-Time Source Map Upload

Set these variables only where hosted production builds run:

```env
SENTRY_AUTH_TOKEN=
SENTRY_ORG=
SENTRY_PROJECT=
# Optional for self-hosted Sentry installations
SENTRY_URL=
```

Notes:

- [`next.config.ts`](/home/virusz4274/development/Vosift/next.config.ts) only enables the Sentry build plugin when `SENTRY_AUTH_TOKEN`, `SENTRY_ORG`, and `SENTRY_PROJECT` are all present
- if they are absent, the app still builds and runtime error capture can still work when DSNs are present
- keep these values out of public self-host documentation

## Release and Alerting Checklist

- Confirm runtime DSNs point to the hosted platform's Sentry project
- Confirm build env includes source map upload settings for production builds
- Confirm alerts route to the hosted platform on-call owners
- Confirm any customer self-host documentation does not mention hosted Sentry values

## Self-Host Boundary

Self-host operators are responsible for their own monitoring. If they want Sentry, they should add it in their deployment copy, typically by running:

```bash
npx @sentry/wizard@latest -i nextjs
```

Their Sentry configuration is separate from the hosted Callery platform.
