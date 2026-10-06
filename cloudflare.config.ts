import { bindings, defineConfig, defineWorker } from "cf/config";

// Cloudflare Workers deployment for the vinext build of this app.
// Secrets are NEVER committed here: set them with `cf workers secrets`
// (or the Cloudflare dashboard) — see docs/cloudflare-workers.md.
// Non-secret vars use bindings.text(); secret slots use bindings.secret()
// (value comes from the secret store at deploy time).
export default defineConfig({
  // Set via CLOUDFLARE_ACCOUNT_ID env var or uncomment:
  // accountId: "<your-account-id>",
  worker: defineWorker({
    name: "vosift",
    entrypoint: "vinext/server/fetch-handler",
    compatibilityDate: "2026-10-04",
    compatibilityFlags: ["nodejs_compat"],
    assets: { notFoundHandling: "none" },
    env: {
      ASSETS: bindings.assets(),
      IMAGES: bindings.images(),
      // --- Non-secret configuration (safe to commit) ---
      EMAIL_PROVIDER: bindings.text("resend"),
      // --- Secrets (set via `cf workers secrets`, never commit values) ---
      // MONGODB_URI: bindings.secret(),
      // BETTER_AUTH_SECRET: bindings.secret(),
      // RESEND_API_KEY: bindings.secret(),
      // NEXT_PUBLIC_APP_URL is inlined into the client bundle at build time
      // from the build environment (see docs/cloudflare-workers.md).
    },
  }),
});
