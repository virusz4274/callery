import test from 'node:test';
import assert from 'node:assert/strict';
import { GITHUB_SUPPORT_URL, documentationHref, marketingPageHref, publicSitePolicy, workspaceHomeHref } from './public-site-policy';
import { navigationConfig } from '@/config/navigation';
import sitemap from '@/app/sitemap';
import robots from '@/app/robots';
import { createAppPageMetadata, createSiteMetadata, siteSeoConfig } from './seo';

function withPolicy(values: Record<string, string | undefined>, work: () => void) {
    const previous = Object.fromEntries(Object.keys(values).map(key => [key, process.env[key]]));
    try {
        for (const [key, value] of Object.entries(values)) {
            if (value === undefined) delete process.env[key];
            else process.env[key] = value;
        }
        work();
    } finally {
        for (const [key, value] of Object.entries(previous)) {
            if (value === undefined) delete process.env[key];
            else process.env[key] = value;
        }
    }
}

test('managed services remain available independently of website configuration and app indexing', () => {
    for (const value of [undefined, 'false', 'true']) {
        for (const marketingUrl of [undefined, 'https://callery.example']) {
            withPolicy({ NEXT_PUBLIC_ENABLE_BILLING: value, NEXT_PUBLIC_MARKETING_URL: marketingUrl }, () => {
                const managed = value === 'true';
                const marketingHref = marketingUrl ? `${marketingUrl}/` : null;
                assert.deepEqual(publicSitePolicy(), {
                    managedEnabled: managed,
                    supportHref: managed ? '/support' : GITHUB_SUPPORT_URL,
                    marketingHref,
                });
                assert.deepEqual(navigationConfig.public.map(link => link.href), [
                    ...(marketingHref ? [marketingHref] : []), ...(managed ? ['/pricing'] : []),
                ]);
                assert.deepEqual(sitemap(), []);
                assert.deepEqual(robots(), { rules: { userAgent: '*', disallow: '/' } });
                assert.deepEqual(createSiteMetadata(siteSeoConfig).robots, {
                    index: false, follow: false, googleBot: { index: false, follow: false },
                });
                const metadata = createAppPageMetadata({ config: siteSeoConfig, title: 'Account support', description: 'Instance account support.', path: '/support' });
                assert.equal(typeof metadata.robots === 'object' && metadata.robots?.index, false);
            });
        }
    }
});

test('website destinations use a valid configured origin and only fixed information paths', () => {
    withPolicy({ NEXT_PUBLIC_APP_URL: 'https://same.example', NEXT_PUBLIC_MARKETING_URL: 'https://same.example/' }, () => {
        assert.equal(marketingPageHref('/privacy-policy'), null, 'Same-origin configuration must not redirect a page to itself.');
    });
    withPolicy({ NEXT_PUBLIC_MARKETING_URL: 'https://callery.example:8443/' }, () => {
        assert.equal(marketingPageHref('/privacy-policy'), 'https://callery.example:8443/privacy-policy');
        assert.equal(marketingPageHref('/terms-of-service'), 'https://callery.example:8443/terms-of-service');
        assert.equal(marketingPageHref('/changelog'), 'https://callery.example:8443/changelog');
        assert.equal(marketingPageHref('/developers'), 'https://callery.example:8443/developers');
        assert.equal(documentationHref('integration-api'), 'https://callery.example:8443/docs/integration-api');
        assert.equal(marketingPageHref('//other.example' as '/'), null);
    });
    for (const value of ['', 'invalid', 'javascript:alert(1)', 'https://user:pass@callery.example',
        'https://callery.example/path', 'https://callery.example?redirect=other', 'https://callery.example#fragment']) {
        withPolicy({ NEXT_PUBLIC_MARKETING_URL: value }, () => {
            assert.equal(marketingPageHref('/privacy-policy'), null);
            assert.equal(publicSitePolicy().marketingHref, null);
        });
    }
});

test('public documentation has a GitHub fallback without creating local app pages', () => {
    for (const marketingUrl of [undefined, 'https://same.example', 'https://callery.example/path']) {
        withPolicy({ NEXT_PUBLIC_APP_URL: 'https://same.example', NEXT_PUBLIC_MARKETING_URL: marketingUrl }, () => {
            assert.equal(documentationHref('integration-api'), 'https://github.com/virusz4274/callery/blob/main/docs/integration-api.md');
            assert.equal(documentationHref('mcp-platforms'), 'https://github.com/virusz4274/callery/blob/main/docs/mcp-platforms.md');
            assert.equal(documentationHref('releases'), 'https://github.com/virusz4274/callery/blob/main/docs/releases.md');
            assert.throws(() => documentationHref('../private' as 'integration-api'), RangeError);
        });
    }
});

test('workspace entry preserves repeated, empty and escaped query values', () => {
    assert.equal(workspaceHomeHref({}), '/recordings');
    assert.equal(workspaceHomeHref({ id: 'a/b', tag: ['one', 'two'], empty: '', omitted: undefined }),
        '/recordings?id=a%2Fb&tag=one&tag=two&empty=');
});
