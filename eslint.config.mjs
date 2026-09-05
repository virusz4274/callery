import nextConfig from "eslint-config-next";

const config = [
    ...nextConfig,
    {
        ignores: [
            "public/",
            ".next/",
            ".open-next/",
            "android/app/build/",
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
