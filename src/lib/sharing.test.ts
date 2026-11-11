import test from 'node:test';
import assert from 'node:assert/strict';
import { decodeJwt, SignJWT } from 'jose';
import { featureSigningKey } from './signing-key';
import { generateShareToken, verifyShareToken } from './sharing';

const now = new Date('2030-01-01T00:00:00Z');
const claims = { shareId: '507f1f77bcf86cd799439011', issuedAt: now.getTime() / 1000, expiresAt: now.getTime() / 1000 + 3600 };

test('share tokens contain only grant identity and stable lifetime and can be reconstructed', async () => {
    const token = await generateShareToken(claims);
    assert.deepEqual(await verifyShareToken(token, now), claims);
    assert.equal(await generateShareToken(claims), token);
    assert.deepEqual(Object.keys(decodeJwt(token)).sort(), ['aud', 'exp', 'iat', 'shareId']);
    assert.equal(await verifyShareToken(token, new Date(claims.expiresAt * 1000)), null);
});

test('rejects tampering and another feature audience', async () => {
    const token = await generateShareToken(claims);
    const [header, payload, signature] = token.split('.');
    const modified = Buffer.from(JSON.stringify({ ...JSON.parse(Buffer.from(payload, 'base64url').toString()), shareId: '507f1f77bcf86cd799439012' })).toString('base64url');
    assert.equal(await verifyShareToken(`${header}.${modified}.${signature}`, now), null);
    const wrongAudience = await new SignJWT({ shareId: claims.shareId }).setProtectedHeader({ alg: 'HS256' })
        .setAudience('vosift:upload').setIssuedAt(claims.issuedAt).setExpirationTime(claims.expiresAt)
        .sign(featureSigningKey('SHARE_LINK_SECRET', 'share'));
    assert.equal(await verifyShareToken(wrongAudience, now), null);
});

test('recording-only, clip, missing-lifetime, and malformed grants do not authorize sharing', async () => {
    for (const payload of [
        { recordingId: '507f1f77bcf86cd799439011' },
        { shareId: claims.shareId, clipStartSeconds: 10 },
        { shareId: claims.shareId, recordingId: '507f1f77bcf86cd799439011' },
        { shareId: 'not-an-id' }, { shareId: claims.shareId },
    ]) {
        const token = await new SignJWT(payload).setProtectedHeader({ alg: 'HS256' }).setAudience('vosift:share')
            .setExpirationTime(claims.expiresAt).sign(featureSigningKey('SHARE_LINK_SECRET', 'share'));
        assert.equal(await verifyShareToken(token, now), null, JSON.stringify(payload));
    }
    const noExpiry = await new SignJWT({ shareId: claims.shareId }).setProtectedHeader({ alg: 'HS256' })
        .setAudience('vosift:share').setIssuedAt(claims.issuedAt).sign(featureSigningKey('SHARE_LINK_SECRET', 'share'));
    assert.equal(await verifyShareToken(noExpiry, now), null);
    await assert.rejects(generateShareToken({ ...claims, shareId: '' }), /Invalid share/);
    await assert.rejects(generateShareToken({ ...claims, expiresAt: claims.issuedAt }), /Invalid share/);
});
