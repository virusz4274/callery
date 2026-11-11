import test from 'node:test';
import assert from 'node:assert/strict';
import { ObjectId } from 'mongodb';
import type { Recording } from './db/types';
import { createRecordingShareService, type RecordingShare, type RecordingShareDependencies } from './recording-share-service';

function fixture() {
    let now = new Date('2030-01-01T00:00:00Z');
    let team = false, active = true;
    let recording: Recording | null = { _id: new ObjectId(), authSubject: 'owner' } as Recording;
    const id = recording._id.toString();
    const grants = new Map<string, RecordingShare>();
    const deps: RecordingShareDependencies = {
        now: () => now, publicOrigin: () => 'https://app.example.test',
        teamEnabled: async () => team, ownerActive: async () => active,
        recording: async (owner, value) => recording?.authSubject === owner && value === id ? recording : null,
        grant: async value => grants.get(value) ?? null,
        insert: async grant => { grants.set(grant._id.toString(), grant); },
        list: async (owner, value) => [...grants.values()].filter(grant => grant.owner === owner && grant.recordingId.toString() === value),
        revoke: async (value, owner, at) => { const grant = grants.get(value); if (grant?.owner === owner && !grant.revokedAt) grant.revokedAt = at; },
    };
    return { service: createRecordingShareService(deps), grants, id,
        token: (url: string) => new URL(url).pathname.slice('/s/'.length),
        setNow: (value: string) => { now = new Date(value); },
        setTeam: (value: boolean) => { team = value; }, setActive: (value: boolean) => { active = value; },
        removeRecording: () => { recording = null; }, changeOwner: () => { recording!.authSubject = 'another-owner'; } };
}

test('owner creates, lists and reconstructs a full share; revocation immediately denies the same token', async () => {
    const f = fixture();
    const created = await f.service.create('owner', f.id, '2030-01-02T00:00:00Z');
    assert.equal(created.status, 'active');
    assert.deepEqual(await f.service.list('owner', f.id), [created]);
    assert.equal((await f.service.resolve(f.token(created.url)))?.recording.authSubject, 'owner');
    await f.service.revoke('owner', created.id);
    await f.service.revoke('owner', created.id);
    assert.equal(await f.service.resolve(f.token(created.url)), null);
    assert.equal((await f.service.list('owner', f.id))[0].status, 'revoked');
});

test('grant access is rechecked against expiration, company mode, account access and the current recording', async () => {
    for (const change of ['expiry', 'company', 'account', 'recording', 'ownership', 'grant-expiry', 'deleted-grant']) {
        const f = fixture();
        const created = await f.service.create('owner', f.id, '2030-01-02T00:00:00Z');
        if (change === 'expiry') f.setNow('2030-01-02T00:00:00Z');
        if (change === 'company') f.setTeam(true);
        if (change === 'account') f.setActive(false);
        if (change === 'recording') f.removeRecording();
        if (change === 'ownership') f.changeOwner();
        if (change === 'grant-expiry') f.grants.get(created.id)!.expiresAt = new Date('2030-01-03T00:00:00Z');
        if (change === 'deleted-grant') f.grants.clear();
        assert.equal(await f.service.resolve(f.token(created.url)), null, change);
    }
});

test('owner actions reject another account, inactive accounts and company policy', async () => {
    const f = fixture();
    const created = await f.service.create('owner', f.id, '2030-01-02T00:00:00Z');
    await assert.rejects(f.service.create('other', f.id, '2030-01-02T00:00:00Z'), /Recording not found/);
    await assert.rejects(f.service.list('other', f.id), /Recording not found/);
    await assert.rejects(f.service.revoke('other', created.id), /Share link not found/);
    assert.equal(f.grants.get(created.id)!.revokedAt, undefined);
    f.setActive(false);
    await assert.rejects(f.service.create('owner', f.id, '2030-01-02T00:00:00Z'), /account cannot share/);
    await assert.rejects(f.service.list('owner', f.id), /account cannot share/);
    f.setActive(true); f.setTeam(true);
    await assert.rejects(f.service.create('owner', f.id, '2030-01-02T00:00:00Z'), /Public sharing is disabled/);
});

test('expiry is required, future and timezone-qualified; canonical dates keep list tokens stable', async () => {
    const f = fixture();
    for (const date of ['', 'not-a-date', '2030-01-02', '2030-01-02T00:00:00', '2029-12-31T23:59:59Z', '2030-01-01T00:00:00Z']) {
        await assert.rejects(f.service.create('owner', f.id, date), /expiration date and time/);
    }
    assert.equal(f.grants.size, 0);
    const created = await f.service.create('owner', f.id, '2030-01-02T05:30:00.999+05:30');
    assert.equal(created.expiresAt, '2030-01-02T00:00:00.000Z');
    assert.equal((await f.service.list('owner', f.id))[0].url, created.url);
    f.setNow('2030-01-02T01:00:00Z');
    assert.equal((await f.service.list('owner', f.id))[0].status, 'expired');
});
