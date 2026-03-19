import test from 'node:test';
import assert from 'node:assert/strict';

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
    assert.equal(
        await verifyShareToken(await generateShareToken({
            recordingId: 'recording-123',
            clipStartSeconds: 30,
            clipEndSeconds: 30,
        })),
        null
    );
});
