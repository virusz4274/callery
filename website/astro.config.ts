import { defineConfig } from 'astro/config';
import sitemap from '@astrojs/sitemap';
import { satteri } from '@astrojs/markdown-satteri';
import { writeFile } from 'node:fs/promises';
import { siteConfig } from './src/lib/site';
import { documentationLinksPlugin } from './src/lib/documentation-links';

export default defineConfig({
    site: siteConfig.origin,
    output: 'static',
    trailingSlash: 'never',
    build: { format: 'file' },
    markdown: { processor: satteri({ mdastPlugins: [documentationLinksPlugin] }) },
    integrations: [
        sitemap({ filter: page => {
            const pathname = new URL(page).pathname.replace(/\/$/, '');
            return pathname !== '/404' && !(siteConfig.comingSoon && pathname === '/pricing');
        } }),
        {
            name: 'callery-static-headers',
            hooks: {
                'astro:build:done': async ({ dir }) => {
                    await writeFile(new URL('_headers', dir),
                        `/*\n  X-Content-Type-Options: nosniff\n  Referrer-Policy: strict-origin-when-cross-origin\n  X-Frame-Options: DENY\n${siteConfig.indexable ? '' : '  X-Robots-Tag: noindex, nofollow\n'}\n/_astro/*\n  Cache-Control: public, max-age=31536000, immutable\n`);
                },
            },
        },
    ],
    devToolbar: { enabled: false },
});
