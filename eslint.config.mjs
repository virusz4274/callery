import nextConfig from "eslint-config-next";
import { fixupConfigRules } from "@eslint/compat";
import tsParser from "@typescript-eslint/parser";

const config = [
    // Adapt React rules that still use the context members removed in ESLint 10.
    ...fixupConfigRules(nextConfig),
    {
        files: ["**/*.{js,jsx,mjs,cjs,ts,tsx,mts,cts}"],
        // Next's bundled Babel parser has an older ScopeManager. This parser
        // implements the addGlobals contract required by ESLint 10.
        languageOptions: { parser: tsParser },
    },
    {
        ignores: [
            "public/",
            ".next/",
            ".open-next/",
            ".cloudflare/",
            ".vinext/",
            "dist/",
            "test-results/",
            "playwright-report/",
            "node_modules/"
        ],
    },
    {
        files: ["src/**/*.{ts,tsx}"],
        rules: {
            "@typescript-eslint/no-explicit-any": "warn",
        },
    },
];

export default config;
