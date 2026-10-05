import { defineConfig } from "vite";
import vinext from "vinext";
import { cloudflare } from "@cloudflare/vite-plugin";
import { imagesOptimizer } from "@vinext/cloudflare/images/images-optimizer";
import { createRequire } from "node:module";
import path from "node:path";
import nextConfig from "./next.config";

// next.config.ts sets `output: "standalone"` for the Docker/Node deployment.
// vinext honors that by emitting a Node standalone bundle from dist/ — which
// conflicts with the Cloudflare Workers build (output goes to .cloudflare/).
// Pass the same config through with `output` stripped so the Workers build
// skips standalone emission. Next.js builds are unaffected (they still load
// next.config.ts from disk with `output: "standalone"` intact).
const { output: _output, ...vinextNextConfig } = nextConfig as Record<string, unknown>;
void _output;

// The MongoDB driver's `require("punycode/")` (via tr46) is handled by
// patches/tr46@5.1.1.patch. This alias additionally redirects any other bare
// `punycode` require (e.g. the firebase-admin chain's tr46@0.0.3) to the same
// package's ESM build, which bundles cleanly in dev and production.
// NOTE: exact-string aliases, not a regex — the dev runner receives a
// serialized config where regex `find` patterns do not survive.
const require = createRequire(import.meta.url);
const punycodeEsm = path.join(
  path.dirname(require.resolve("punycode/package.json")),
  "punycode.es6.js",
);

export default defineConfig({
  resolve: {
    alias: [
      { find: "punycode/", replacement: punycodeEsm },
      { find: "punycode", replacement: punycodeEsm },
    ],
  },
  environments: {
    // The AWS SDK's large ESM graph hangs the workerd dev runner when loaded
    // module-by-module; prebundle it (dev only, production builds bundle it).
    rsc: { optimizeDeps: { include: ["@aws-sdk/client-s3", "@aws-sdk/s3-request-presigner"] } },
    ssr: { optimizeDeps: { include: ["@aws-sdk/client-s3", "@aws-sdk/s3-request-presigner"] } },
  },
  plugins: [
    vinext({
      nextConfig: vinextNextConfig,
      images: { optimizer: imagesOptimizer() },
    }),
    cloudflare({
      viteEnvironment: {
        name: "rsc",
        childEnvironments: ["ssr"],
      },
    }),
  ],
});
