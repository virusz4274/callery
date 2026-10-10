import test from 'node:test';
import assert from 'node:assert/strict';
import { GITHUB_SUPPORT_URL, publicSitePolicy, workspaceHomeHref } from './public-site-policy';
import { navigationConfig } from '@/config/navigation';
import sitemap from '@/app/sitemap';
import robots from '@/app/robots';
import { createMarketingMetadata, createSiteMetadata, siteSeoConfig } from './seo';

test('public pages, navigation and indexing follow the billing opt-in', () => {
    const previous = process.env.NEXT_PUBLIC_ENABLE_BILLING;
    try {
        for (const value of [undefined, 'false', 'true']) {
            if (value === undefined) delete process.env.NEXT_PUBLIC_ENABLE_BILLING;
            else process.env.NEXT_PUBLIC_ENABLE_BILLING = value;
            const managed = value === 'true';
            assert.deepEqual(publicSitePolicy(), {
                marketingEnabled: managed,
                supportHref: managed ? '/support' : GITHUB_SUPPORT_URL,
            });
            assert.equal(navigationConfig.public.length, managed ? 2 : 0);
            assert.equal(sitemap().length, managed ? 6 : 0);
            if (!managed) {
                assert.deepEqual(robots(), { rules: { userAgent: '*', disallow: '/' } });
                assert.deepEqual(createSiteMetadata(siteSeoConfig).robots, {
                    index: false, follow: false, googleBot: { index: false, follow: false },
                });
            } else {
                assert.equal(createSiteMetadata(siteSeoConfig).robots, undefined);
                assert.ok(robots().sitemap);
            }
            const metadata = createMarketingMetadata({ config: siteSeoConfig, title: 'Test', description: 'Test', path: '/' });
            assert.equal(typeof metadata.robots === 'object' && metadata.robots?.index, managed);
        }
    } finally {
        if (previous === undefined) delete process.env.NEXT_PUBLIC_ENABLE_BILLING;
        else process.env.NEXT_PUBLIC_ENABLE_BILLING = previous;
    }
});

test('workspace entry preserves repeated, empty and escaped query values', () => {
    assert.equal(workspaceHomeHref({}), '/recordings');
    assert.equal(workspaceHomeHref({ id: 'a/b', tag: ['one', 'two'], empty: '', omitted: undefined }),
        '/recordings?id=a%2Fb&tag=one&tag=two&empty=');
});
