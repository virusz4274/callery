import test from 'node:test';
import assert from 'node:assert/strict';
import { readBrowserUploadPart, assertBrowserUploadOrigin } from './browser-part';
import { PART_BYTES } from './contracts';
import { assertUploadAccess, type UploadSession } from './uploads';
import { userFixture } from '@/lib/stripe/test-support';
import type { Db } from 'mongodb';

const body = (size: number, declared?: number) => new Request('https://app.example.com/api/uploads/id/parts/1', {
    method: 'PUT', body: Buffer.alloc(size), ...(declared === undefined ? {} : { headers: { 'Content-Length': String(declared) } }),
});

test('resumable proxy reads exactly one reserved part and rejects surplus, short or invalid bodies', async () => {
    assert.equal((await readBrowserUploadPart(body(12), 12)).length, 12);
    await assert.rejects(readBrowserUploadPart(body(13), 12), /exceeds/);
    await assert.rejects(readBrowserUploadPart(body(11), 12), /shorter/);
    await assert.rejects(readBrowserUploadPart(body(12, 13), 12), /length/);
    await assert.rejects(readBrowserUploadPart(body(1), PART_BYTES + 1), /Invalid part/);
    await assert.rejects(readBrowserUploadPart(new Request('https://app.example.com', { method: 'PUT' }), 1), /body required/);
});

test('proxy cancellation aborts consumption and releases the stream', async () => {
    const controller = new AbortController();
    let cancelled = false;
    const stream = new ReadableStream<Uint8Array>({ cancel() { cancelled = true; } });
    const request = new Request('https://app.example.com', { method: 'PUT', body: stream, signal: controller.signal, duplex: 'half' } as RequestInit);
    const reading = readBrowserUploadPart(request, 12);
    controller.abort();
    await assert.rejects(reading, /abort/i);
    assert.equal(cancelled, true);
});

test('cookie-authenticated upload mutations require the configured origin', () => {
    const make = (origin?: string, site?: string) => new Request('https://app.example.com/api/uploads', { method: 'POST', headers: { ...(origin ? { Origin: origin } : {}), ...(site ? { 'Sec-Fetch-Site': site } : {}) } });
    assert.doesNotThrow(() => assertBrowserUploadOrigin(make('https://app.example.com'), 'https://app.example.com'));
    assert.throws(() => assertBrowserUploadOrigin(make(), 'https://app.example.com'), /origin/);
    assert.throws(() => assertBrowserUploadOrigin(make('https://other.example.com'), 'https://app.example.com'), /origin/);
    assert.throws(() => assertBrowserUploadOrigin(make('https://app.example.com', 'cross-site'), 'https://app.example.com'), /origin/);
});

test('browser upload principals recheck current access without an integration credential', async () => {
    const account = userFixture();
    const session = { owner: account.authSubject, mode: 'browser', createdAt: new Date('2026-10-10'), input: { fileSize: 2 }, _id: 'browser' } as UploadSession;
    const db = { collection: () => ({ findOne: async () => account }) } as unknown as Db;
    await assertUploadAccess(session, db, false);
    account.disabled = true;
    await assert.rejects(assertUploadAccess(session, db, false), /revoked/);
    account.disabled = false;
    account.accessRevokedAt = new Date('2026-10-11');
    await assert.rejects(assertUploadAccess(session, db, false), /revoked/);
});
