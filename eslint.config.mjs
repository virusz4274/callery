import nextConfig from "eslint-config-next";

export default [
    ...nextConfig,
    {
        ignores: [
            "public/",
            ".next/",
            "node_modules/",
            // vinext / Cloudflare Workers build output
            ".cloudflare/",
            ".vinext/",
            "dist/"
        ],
    },
];
