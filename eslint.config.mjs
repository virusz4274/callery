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
];

export default config;
