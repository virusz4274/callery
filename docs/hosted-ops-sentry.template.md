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
- `NEXT_PUBLIC_SENTRY_DSN` is used by the browser runtime and must be set before
  building; changing it requires rebuilding the browser bundle
- if either value is absent, the corresponding runtime will no-op
- the current server, edge and browser configurations use a trace sample rate of
  `1`; browser Replay samples `0.1` of sessions and `1.0` of sessions with errors
  when its integration is available. Review these settings in
  [`sentry.server.config.ts`](../sentry.server.config.ts),
  [`sentry.edge.config.ts`](../sentry.edge.config.ts) and
  [`src/instrumentation-client.ts`](../src/instrumentation-client.ts) as part of
  the hosted monitoring policy

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

- [`next.config.ts`](../next.config.ts) only enables the Sentry build plugin when `SENTRY_AUTH_TOKEN`, `SENTRY_ORG`, and `SENTRY_PROJECT` are all present
- if they are absent, the app still builds and runtime error capture can still work when DSNs are present
- keep actual credentials, DSNs and account/project identifiers out of public
  documentation; the optional variable names are documented in `.env.example`

Native builds can read these values from their build environment. The stock
Dockerfile and Compose build forward only the public build arguments, including
`NEXT_PUBLIC_SENTRY_DSN`; they do not deliver private Sentry upload credentials to
the builder. Putting those credentials in the runtime `env_file` does not enable
source-map uploads. Uploading maps from an image build requires an explicitly
configured secure build-time secret mechanism, which is not included here.

## Release and Alerting Checklist

- Confirm runtime DSNs point to the hosted platform's Sentry project
- Confirm build env includes source map upload settings for production builds
- Confirm alerts route to the hosted platform on-call owners
- Confirm any customer self-host documentation does not mention hosted Sentry values

## Self-Host Boundary

Self-host operators are responsible for their own monitoring. The repository
already includes optional Sentry instrumentation, so they can configure their
own runtime DSNs through the variables above without a setup wizard or source
change. Source-map uploads need the separate build-time configuration described
above. Their Sentry account,
alert routing and incident response remain separate from the hosted Callery
platform. See [optional integrations](setup-guide.md#optional-integrations).
