import { defineConfig, normalizePath } from "vite";
import vinext from "vinext";
import { cloudflare } from "@cloudflare/vite-plugin";
import { imagesOptimizer } from "@vinext/cloudflare/images/images-optimizer";
import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import nextConfig from "./next.config";

// next.config.ts sets `output: "standalone"` for the Docker/Node deployment.
// vinext honors that by emitting a Node standalone bundle from dist/ — which
// conflicts with the Cloudflare Workers build (output goes to .cloudflare/).
// Pass the same config through with `output` stripped so the Workers build
// skips standalone emission. Next.js builds are unaffected (they still load
// next.config.ts from disk with `output: "standalone"` intact).
const { output: _output, ...vinextNextConfig } = nextConfig as Record<string, unknown>;
void _output;

const brandImageModule = normalizePath(fileURLToPath(new URL("./src/lib/brand-image.ts", import.meta.url)));
const brandLogoPath = fileURLToPath(new URL("./public/brand/callery-logo.png", import.meta.url));

export default defineConfig({
  environments: {
    // The AWS SDK's large ESM graph hangs the workerd dev runner when loaded
    // module-by-module; prebundle it (dev only, production builds bundle it).
    rsc: { optimizeDeps: { include: ["@aws-sdk/client-s3", "@aws-sdk/s3-request-presigner"] } },
    ssr: { optimizeDeps: { include: ["@aws-sdk/client-s3", "@aws-sdk/s3-request-presigner"] } },
  },
  plugins: [
    {
      name: "vosift:brand-image",
      // Workers' filesystem contains bundled modules, not the public assets
      // directory. Embed the same logo at build time so importing social-image
      // routes never tries to read a missing file during Worker startup.
      load(id) {
        if (normalizePath(id) !== brandImageModule) return;
        this.addWatchFile(brandLogoPath);
        const logo = `data:image/png;base64,${readFileSync(brandLogoPath, "base64")}`;
        return `export const brandLogoSrc = ${JSON.stringify(logo)};`;
      },
    },
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
