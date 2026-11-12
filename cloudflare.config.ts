import { bindings, defineConfig, defineWorker } from "cf/config";
import productionProfile from "./deployment/production.json" with { type: "json" };

// Opt in through the production scripts; shared local/self-host settings stay separate.
const production = process.env.CALLERY_DEPLOYMENT === "production";

// Cloudflare Workers deployment for the vinext build of this app.
// Secrets are NEVER committed here: set them with `cf workers secrets`
// (or the Cloudflare dashboard) — see docs/cloudflare-workers.md.
// Non-secret vars use bindings.text(); secret slots use bindings.secret()
// (value comes from the secret store at deploy time).
export default defineConfig({
  // Set via CLOUDFLARE_ACCOUNT_ID env var or uncomment:
  // accountId: "<your-account-id>",
  worker: defineWorker({
    name: production ? "callery" : "vosift",
    ...(production ? { domains: [new URL(productionProfile.appOrigin).hostname] } : {}),
    entrypoint: "vinext/server/fetch-handler",
    compatibilityDate: "2026-10-04",
    compatibilityFlags: ["nodejs_compat"],
    assets: { notFoundHandling: "none" },
    env: {
      ASSETS: bindings.assets(),
      IMAGES: bindings.images(),
      // --- Non-secret configuration (safe to commit) ---
      EMAIL_PROVIDER: bindings.text("resend"),
      ...(production ? {
        NEXT_PUBLIC_APP_URL: bindings.text(productionProfile.appOrigin),
        NEXT_PUBLIC_MARKETING_URL: bindings.text(productionProfile.websiteOrigin),
        NEXT_PUBLIC_ENABLE_BILLING: bindings.text("true"),
        // Values come exclusively from the deployment's Cloudflare secret store.
        MONGODB_URI: bindings.secret(),
        BETTER_AUTH_SECRET: bindings.secret(),
        R2_ACCESS_KEY_ID: bindings.secret(),
        R2_SECRET_ACCESS_KEY: bindings.secret(),
        RESEND_API_KEY: bindings.secret(),
        STRIPE_SECRET_KEY: bindings.secret(),
        STRIPE_WEBHOOK_SECRET: bindings.secret(),
        CRON_SECRET: bindings.secret(),
      } : {}),
      // --- Secrets (set via `cf workers secrets`, never commit values) ---
      // MONGODB_URI: bindings.secret(),
      // BETTER_AUTH_SECRET: bindings.secret(),
      // RESEND_API_KEY: bindings.secret(),
      // NEXT_PUBLIC_APP_URL is inlined into the client bundle at build time
      // from the build environment (see docs/cloudflare-workers.md).
    },
  }),
});
