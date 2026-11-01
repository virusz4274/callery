import test from 'node:test';
import assert from 'node:assert/strict';
import { SignJWT } from 'jose';
import { featureSigningKey } from './signing-key';

async function getSharingModule() {
    process.env.SHARE_LINK_SECRET = 'unit-test-share-secret';
    return import('@/lib/sharing');
}

test('verifies clip bounds embedded in the share token', async () => {
    const { generateShareToken, verifyShareToken } = await getSharingModule();
    const token = await generateShareToken({
        recordingId: 'recording-123',
        clipStartSeconds: 15,
        clipEndSeconds: 45,
    });

    const payload = await verifyShareToken(token);

    assert.deepEqual(payload, {
        recordingId: 'recording-123',
        clipStartSeconds: 15,
        clipEndSeconds: 45,
    });
});

test('rejects tampered share tokens and invalid clip windows', async () => {
    const { generateShareToken, verifyShareToken } = await getSharingModule();
    const token = await generateShareToken({
        recordingId: 'recording-123',
        clipStartSeconds: 10,
        clipEndSeconds: 20,
    });

    const [header, payload, signature] = token.split('.');
    const decodedPayload = JSON.parse(Buffer.from(payload, 'base64url').toString('utf8')) as {
        recordingId: string;
        clipStartSeconds: number;
        clipEndSeconds: number;
    };
    decodedPayload.clipEndSeconds = 999;
    const tamperedPayload = Buffer.from(JSON.stringify(decodedPayload)).toString('base64url');
    const tamperedToken = `${header}.${tamperedPayload}.${signature}`;

    assert.equal(await verifyShareToken(tamperedToken), null);
    await assert.rejects(
        generateShareToken({
            recordingId: 'recording-123',
            clipStartSeconds: 30,
            clipEndSeconds: 30,
        }),
        /Clip end must be greater/
    );
});

test('malformed signed clip bounds cannot fall back to full-recording access', async () => {
    const { verifyShareToken } = await getSharingModule();
    const invalidBounds = [
        { clipStartSeconds: -1 }, { clipEndSeconds: -1 },
        { clipStartSeconds: '10' }, { clipEndSeconds: '20' },
        { clipStartSeconds: null }, { clipEndSeconds: null },
        { clipEndSeconds: 0 }, { clipStartSeconds: 20, clipEndSeconds: 10 },
    ];
    for (const bounds of invalidBounds) {
        const token = await new SignJWT({ recordingId: 'recording-123', ...bounds })
            .setProtectedHeader({ alg: 'HS256' }).setAudience('vosift:share').setExpirationTime('1h')
            .sign(featureSigningKey('SHARE_LINK_SECRET', 'share'));
        assert.equal(await verifyShareToken(token), null, JSON.stringify(bounds));
    }
});

test('clip validation preserves fractional and one-sided bounds and checks recording duration', async () => {
    const { generateShareToken, verifyShareToken, parseShareClipBounds, resolveShareClipBounds } = await getSharingModule();
    const fractional = { clipStartSeconds: 10.75, clipEndSeconds: 20.25 };
    assert.deepEqual(await verifyShareToken(await generateShareToken({ recordingId: 'recording-123', ...fractional })), { recordingId: 'recording-123', ...fractional });
    assert.deepEqual(resolveShareClipBounds({ clipEndSeconds: 20 }, 60), { start: 0, end: 20 });
    assert.deepEqual(resolveShareClipBounds({ clipStartSeconds: 20 }, 60), { start: 20, end: 60 });
    assert.deepEqual(resolveShareClipBounds({ clipStartSeconds: 0 }, 60), { start: 0, end: 60 });
    assert.equal(resolveShareClipBounds({}, 60), null);
    for (const value of [-1, Number.NaN, Number.POSITIVE_INFINITY, '1', null]) {
        assert.throws(() => parseShareClipBounds({ clipStartSeconds: value }), /Clip bounds/);
    }
    for (const bounds of [{ clipStartSeconds: 60 }, { clipEndSeconds: 61 }]) {
        assert.throws(() => resolveShareClipBounds(bounds, 60), /recording duration/);
    }
    assert.throws(() => resolveShareClipBounds({ clipStartSeconds: 0 }, 0), /recording duration/);
});

test('valid full shares remain unrestricted and expired tokens remain invalid', async () => {
    const { generateShareToken, verifyShareToken } = await getSharingModule();
    assert.deepEqual(await verifyShareToken(await generateShareToken({ recordingId: 'recording-123' })), { recordingId: 'recording-123' });
    assert.equal(await verifyShareToken(await generateShareToken({ recordingId: 'recording-123' }, '-1s')), null);
});
