// This file configures the initialization of Sentry on the client.
// The added config here will be used whenever a users loads a page in their browser.
// https://docs.sentry.io/platforms/javascript/guides/nextjs/

// Namespace import (not named imports): under vinext the RSC/edge build of
// @sentry/nextjs resolves here and lacks browser-only exports such as
// replayIntegration/captureRouterTransitionStart. Named imports would fail
// the bundle; property access degrades gracefully at runtime instead.
// Under Next.js all exports exist, so behavior there is unchanged.
import * as Sentry from "@sentry/nextjs";

if (typeof window !== "undefined") {
  Sentry.init({
    // Optional: when unset the SDK stays a no-op client. Browser bundles
    // can only read NEXT_PUBLIC_* variables, so the client DSN needs the
    // public name (SENTRY_DSN alone is server-only and would be undefined).
    dsn: process.env.NEXT_PUBLIC_SENTRY_DSN || process.env.SENTRY_DSN,

    // Add optional integrations for additional features
    integrations:
      typeof Sentry.replayIntegration === "function" ? [Sentry.replayIntegration()] : [],

    // Define how likely traces are sampled. Adjust this value in production, or use tracesSampler for greater control.
    tracesSampleRate: 1,

    // Define how likely Replay events are sampled.
    // This sets the sample rate to be 10%. You may want this to be 100% while
    // in development and sample at a lower rate in production
    replaysSessionSampleRate: 0.1,

    // Define how likely Replay events are sampled when an error occurs.
    replaysOnErrorSampleRate: 1.0,
  });
}

export const onRouterTransitionStart = (...args: unknown[]) =>
  typeof (Sentry as Record<string, unknown>).captureRouterTransitionStart === "function"
    ? (Sentry as unknown as { captureRouterTransitionStart: (...a: unknown[]) => unknown }).captureRouterTransitionStart(...args)
    : undefined;
