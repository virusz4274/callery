import test from 'node:test';
import assert from 'node:assert/strict';
import { mkdtemp, readFile, readdir, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { syncWebsitePricing } from '../../scripts/sync-website-pricing';
import { websitePricingSchema } from '../../shared/website-pricing';

const fixture = {
    version: 1, sourceAppOrigin: 'https://app.example.com', generatedAt: '2026-11-12T00:00:00.000Z',
    pricing: { trial: null, plans: [{ key: 'standard', name: 'Standard', description: 'Test-only public plan.',
        price: 12, currency: 'USD', interval: 'monthly', storageBytes: 1024, weightedMinutes: 60,
        available: true, usage: { providers: [{ id: 'soniox', name: 'Soniox', multiplier: 1, usdPerMinute: '0.01' }],
            storageUsdPerGiB: '0.02', minimumRecordingUsd: '0' } }] },
};

test('valid export atomically replaces a snapshot without browser credentials', async () => {
    const directory = await mkdtemp(path.join(tmpdir(), 'callery-pricing-sync-'));
    const output = path.join(directory, 'pricing.json');
    try {
        await writeFile(output, 'previous snapshot');
        const result = await syncWebsitePricing({ from: fixture.sourceAppOrigin, output,
            fetcher: (async (url, options) => {
                assert.equal(String(url), 'https://app.example.com/api/public/pricing');
                assert.equal(options?.redirect, 'error');
                assert.deepEqual(options?.headers, { Accept: 'application/json' });
                return Response.json(fixture);
            }) as typeof fetch });
        assert.deepEqual(result, fixture);
        assert.deepEqual(JSON.parse(await readFile(output, 'utf8')), fixture);
        assert.deepEqual(await readdir(directory), ['pricing.json']);
    } finally { await rm(directory, { recursive: true, force: true }); }
});

test('network, HTTP, malformed and wrong-origin exports preserve the saved snapshot', async () => {
    const directory = await mkdtemp(path.join(tmpdir(), 'callery-pricing-failure-'));
    const output = path.join(directory, 'pricing.json');
    try {
        const failures = [
            async () => { throw new Error('Fixture offline'); },
            async () => new Response('Unavailable', { status: 503 }),
            async () => new Response('<html>Login</html>'),
            async () => Response.json({ ...fixture, sourceAppOrigin: 'https://other.example.com' }),
            async () => Response.json({ ...fixture, pricing: { trial: null, plans: [] } }),
            async () => Response.json({ ...fixture, pricing: { ...fixture.pricing, plans: [{ ...fixture.pricing.plans[0], checkout: 'must-not-cross-boundary' }] } }),
        ];
        for (const fetcher of failures) {
            await writeFile(output, 'last good catalog');
            await assert.rejects(syncWebsitePricing({ from: fixture.sourceAppOrigin, output, fetcher: fetcher as typeof fetch }));
            assert.equal(await readFile(output, 'utf8'), 'last good catalog');
            assert.deepEqual(await readdir(directory), ['pricing.json']);
        }
    } finally { await rm(directory, { recursive: true, force: true }); }
});

test('display contract rejects malformed prices, duplicate plans and checkout internals', () => {
    for (const change of [{ price: -1 }, { price: 0 }, { available: 'yes' }, { currency: 'usd' },
        { interval: 'lifetime' }, { stripePriceId: 'must-not-be-saved' }]) {
        assert.equal(websitePricingSchema.safeParse({ ...fixture,
            pricing: { ...fixture.pricing, plans: [{ ...fixture.pricing.plans[0], ...change }] } }).success, false);
    }
    assert.equal(websitePricingSchema.safeParse({ ...fixture,
        pricing: { ...fixture.pricing, plans: [fixture.pricing.plans[0], fixture.pricing.plans[0]] } }).success, false);
});

test('sync rejects remote plain HTTP and origins containing credentials or paths', async () => {
    for (const from of ['http://remote.example.com', 'https://user:password@app.example.com', 'https://app.example.com/pricing']) {
        await assert.rejects(syncWebsitePricing({ from, fetcher: (async () => { throw new Error('Should not fetch'); }) as typeof fetch }));
    }
});
