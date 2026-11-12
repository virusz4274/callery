import test from 'node:test';
import assert from 'node:assert/strict';
import { NextRequest } from 'next/server';
import { proxy } from './proxy';

function withMarketingUrl(value: string | undefined, work: () => void) {
    const previous = process.env.NEXT_PUBLIC_MARKETING_URL;
    try {
        if (value === undefined) delete process.env.NEXT_PUBLIC_MARKETING_URL;
        else process.env.NEXT_PUBLIC_MARKETING_URL = value;
        work();
    } finally {
        if (previous === undefined) delete process.env.NEXT_PUBLIC_MARKETING_URL;
        else process.env.NEXT_PUBLIC_MARKETING_URL = previous;
    }
}

const informationPaths = ['/privacy-policy', '/terms-of-service', '/changelog', '/developers'];

test('legacy information GET and HEAD requests use fixed website paths without app query values', () => {
    withMarketingUrl('https://callery.example', () => {
        for (const path of informationPaths) {
            for (const method of ['GET', 'HEAD']) {
                const response = proxy(new NextRequest(`https://app.example.com${path}?email=private%40example.com&redirect=https%3A%2F%2Fother.example`, { method }));
                assert.equal(response.status, 307);
                assert.equal(response.headers.get('location'), `https://callery.example${path}`);
            }
        }
    });
});

test('unconfigured instances have no legal fallback and use GitHub developer documentation', () => {
    for (const marketingUrl of [undefined, 'https://app.example.com', 'https://callery.example/path']) {
        withMarketingUrl(marketingUrl, () => {
            for (const path of informationPaths) {
                const response = proxy(new NextRequest(`https://app.example.com${path}?private=value`));
                assert.equal(response.headers.get('location'), path === '/developers'
                    ? 'https://github.com/virusz4274/callery/blob/main/docs/integration-api.md' : null);
                if (path !== '/developers') assert.equal(response.headers.get('x-middleware-next'), '1');
            }
        });
    }
});

test('information mutations and API requests never redirect to the website', () => {
    withMarketingUrl('https://callery.example', () => {
        for (const method of ['POST', 'PUT', 'PATCH', 'DELETE', 'OPTIONS']) {
            for (const path of [...informationPaths, '/api/v1/openapi.json', '/api/integrations/connections', '/api/support']) {
                const response = proxy(new NextRequest(`https://app.example.com${path}`, { method }));
                assert.equal(response.headers.get('location'), null);
                assert.equal(response.headers.get('x-middleware-next'), '1');
            }
        }
    });
});

test('workspace entry redirects before rendering and preserves the complete query string', () => {
    for (const query of ['', '?id=a%2Fb&tag=one&tag=two&empty=&search=a%20b']) {
        const response = proxy(new NextRequest(`https://app.example.com/${query}`));
        assert.equal(response.status, 307);
        assert.equal(response.headers.get('location'), `https://app.example.com/recordings${query}`);
    }
});

test('workspace redirect uses the configured public HTTPS origin behind a local listener', () => {
    const previous = process.env.NEXT_PUBLIC_APP_URL;
    try {
        process.env.NEXT_PUBLIC_APP_URL = 'https://public-tunnel.example';
        const response = proxy(new NextRequest('http://127.0.0.1:9000/?tag=one&tag=two'));
        assert.equal(response.headers.get('location'), 'https://public-tunnel.example/recordings?tag=one&tag=two');
    } finally {
        if (previous === undefined) delete process.env.NEXT_PUBLIC_APP_URL;
        else process.env.NEXT_PUBLIC_APP_URL = previous;
    }
});

test('app pages and binary/API paths are not redirected to the workspace', () => {
    for (const path of ['/login?redirect=%2Frecordings', '/settings?tab=integrations', '/api/v1/openapi.json', '/api/public/pricing', '/api/uploads/content']) {
        const response = proxy(new NextRequest(`https://app.example.com${path}`));
        assert.equal(response.headers.get('location'), null);
        assert.equal(response.headers.get('x-middleware-next'), '1');
    }
});
