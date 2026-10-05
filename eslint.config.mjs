import nextConfig from "eslint-config-next";

const config = [
    ...nextConfig,
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
