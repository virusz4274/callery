import test from 'node:test';
import assert from 'node:assert/strict';
import { registerHooks } from 'node:module';
import { ObjectId, type Db } from 'mongodb';
import type { Recording } from '@/lib/db/types';
import type { RecordingPassage } from './passages';
import type { EmbeddingProfile } from './types';
import type { AiCallCheckpoint, AiPlannedCall } from '@/lib/transcription/ai-work-plan';

const key = Symbol.for('vosift.test.passages');
type Row = Record<string, unknown>;
type Store = { rows: Map<string, Map<string, Row>>; afterBulk?: () => void; beforeUpdateMany?: () => void; db: Db };
const world = globalThis as typeof globalThis & { [key]: Store };
const valueAt = (row: Row, path: string) => path.split('.').reduce<unknown>((value, part) => value && typeof value === 'object' ? (value as Row)[part] : undefined, row);
function matches(row: Row, filter: Row): boolean {
    return Object.entries(filter).every(([path, wanted]) => {
        if (path === '$or') return (wanted as Row[]).some(part => matches(row, part));
        const value = valueAt(row, path);
        if (wanted instanceof ObjectId) return String(value) === wanted.toString();
        if (wanted && typeof wanted === 'object') {
            const op = wanted as Row;
            if ('$exists' in op) return (value !== undefined) === op.$exists;
            if ('$ne' in op) return value !== op.$ne;
            if ('$in' in op) return (op.$in as unknown[]).includes(value);
            if ('$lt' in op) return typeof value === 'number' && value < Number(op.$lt);
        }
        return value === wanted;
    });
}
function setup() {
    const state: Store = { rows: new Map(), db: {} as Db };
    state.db = { collection(name: string) {
        if (!state.rows.has(name)) state.rows.set(name, new Map());
        const rows = state.rows.get(name)!;
        return {
            async findOne(filter: Row) { const row = [...rows.values()].find(row => matches(row, filter)); return row ? { ...structuredClone(row), _id: row._id, contactId: row.contactId } : null; },
            async bulkWrite(operations: { updateOne: { filter: Row; update: { $setOnInsert: Row } } }[]) {
                for (const { updateOne } of operations) {
                    if (![...rows.values()].some(row => matches(row, updateOne.filter))) rows.set(String(updateOne.filter._id), structuredClone({ ...updateOne.filter, ...updateOne.update.$setOnInsert }));
                }
                state.afterBulk?.();
            },
            async updateOne(filter: Row, patch: { $set: Row }) {
                const row = [...rows.values()].find(row => matches(row, filter)); if (row) Object.assign(row, structuredClone(patch.$set));
                return { matchedCount: row ? 1 : 0 };
            },
            async updateMany(filter: Row, patch: { $set: Row }) {
                state.beforeUpdateMany?.();
                const selected = [...rows.values()].filter(row => matches(row, filter)); selected.forEach(row => Object.assign(row, structuredClone(patch.$set)));
                return { matchedCount: selected.length };
            },
            async countDocuments(filter: Row) { return [...rows.values()].filter(row => matches(row, filter)).length; },
            async deleteMany(filter: Row) { for (const [id, row] of rows) if (matches(row, filter)) rows.delete(id); },
        };
    } } as unknown as Db;
    world[key] = state; return state;
}
const hook = registerHooks({ resolve(specifier, context, next) {
    if (specifier === '@/lib/mongodb' && context.parentURL?.endsWith('/search/passages.ts')) return {
        url: `data:text/javascript,${encodeURIComponent("export const Collections={RECORDINGS:'recordings'};export async function getMongoDb(){return globalThis[Symbol.for('vosift.test.passages')].db;}")}`, shortCircuit: true,
    };
    return next(specifier, context);
} });
const { claimPassageAttempt, preparePassageRows, savePassageResponse, savedPassageResponse, publishPassageGeneration, passageId, removeRecordingPassages } = await import('./passages');
hook.deregister();
const id = new ObjectId(), owner = 'owner';
const profile: EmbeddingProfile = { id: 'profile', provider: 'gemini', model: 'test', dimensions: 2, adapterVersion: 1, chunkerVersion: 1, countBasis: 'utf8_byte_bound' };
const source: Recording = { _id: id, authSubject: owner, contactId: null, recordedAt: new Date('2026-01-01'), isArchived: false } as Recording;
const passage = { ordinal: 0, text: 'The detail is hidden from the summary.', sources: [{ segmentIndex: 1, from: 0, to: 43 }], inputTokens: 43 };
const request: AiPlannedCall = { id: 'passage-0', version: 1, step: 'embedding', provider: 'gemini', model: 'test', prompt: passage.text, promptVersion: 'test', inputTokens: 43, maxOutputTokens: 0, thinking: 'off' };
const checkpoint: AiCallCheckpoint = { request, attempts: 1, reservationId: 'attempt', state: 'started' };
function putRecording(state: Store) {
    state.rows.set('recordings', new Map([[id.toString(), { ...source, searchIndex: { generation: 'generation', transcriptRevision: 'revision' } }]]));
}

test('external vector and response receipt recover a missing parent checkpoint and publication is gated', async () => {
    const state = setup(); putRecording(state);
    await preparePassageRows(owner, id.toString(), 'generation', 'revision', profile, [passage]);
    const ref = passageId(owner, id.toString(), 'generation', 0);
    await assert.rejects(publishPassageGeneration(owner, id.toString(), 'generation', 1), /unfinished/);
    const usage = { provider: 'gemini' as const, model: 'test', step: 'embedding' as const, measured: false };
    await claimPassageAttempt(ref, owner, request, checkpoint);
    await savePassageResponse(ref, owner, request, checkpoint, [0.5, 0.5], usage);
    const recovered = await savedPassageResponse(ref, owner, request, checkpoint);
    assert.deepEqual(recovered?.vector, [0.5, 0.5]); assert.deepEqual(recovered?.response?.usage, usage);
    assert.equal(await savedPassageResponse(ref, owner, { ...request, prompt: 'changed request' }, checkpoint), null);
    assert.equal(await savedPassageResponse(ref, 'another-owner', request, checkpoint), null);
    await publishPassageGeneration(owner, id.toString(), 'generation', 1);
    assert.equal((state.rows.get('recording_passages')!.get(ref) as unknown as RecordingPassage).published, true);
});

test('late responses cannot overwrite a newer passage attempt', async () => {
    const state = setup(); putRecording(state);
    await preparePassageRows(owner, id.toString(), 'generation', 'revision', profile, [passage]);
    const ref = passageId(owner, id.toString(), 'generation', 0), newer = { ...checkpoint, attempts: 2, reservationId: 'new-attempt' };
    await claimPassageAttempt(ref, owner, request, checkpoint);
    await claimPassageAttempt(ref, owner, request, newer);
    await assert.rejects(savePassageResponse(ref, owner, request, checkpoint, [1, 0]), /deleted/);
    await assert.rejects(claimPassageAttempt(ref, owner, request, checkpoint), /newer attempt/);
    await savePassageResponse(ref, owner, request, newer, [0, 1]);
    assert.deepEqual((await savedPassageResponse(ref, owner, request, newer))?.vector, [0, 1]);
});

test('preparation and publication use live metadata and repair a concurrent contact/archive write', async () => {
    const state = setup(); putRecording(state);
    const changedContact = new ObjectId(), latestContact = new ObjectId();
    const live = state.rows.get('recordings')!.get(id.toString())!;
    Object.assign(live, { contactId: changedContact, recordedAt: new Date('2026-10-01'), isArchived: true });
    await preparePassageRows(owner, id.toString(), 'generation', 'revision', profile, [passage]);
    const ref = passageId(owner, id.toString(), 'generation', 0), row = state.rows.get('recording_passages')!.get(ref)!;
    assert.equal(row.contactId, changedContact.toString()); assert.equal(row.isArchived, true);
    await claimPassageAttempt(ref, owner, request, checkpoint);
    await savePassageResponse(ref, owner, request, checkpoint, [1, 0]);
    state.beforeUpdateMany = () => {
        state.beforeUpdateMany = undefined;
        Object.assign(live, { contactId: latestContact, isArchived: false });
        Object.assign(row, { contactId: latestContact.toString(), isArchived: false });
    };
    await publishPassageGeneration(owner, id.toString(), 'generation', 1);
    assert.equal(row.contactId, latestContact.toString()); assert.equal(row.isArchived, false); assert.equal(row.published, true);
});

test('deletion during preparation cleans the late generation; provider completion never recreates deleted rows', async () => {
    const state = setup(); putRecording(state);
    state.afterBulk = () => state.rows.get('recordings')!.clear();
    await assert.rejects(preparePassageRows(owner, id.toString(), 'generation', 'revision', profile, [passage]), /changed during/);
    assert.equal(state.rows.get('recording_passages')!.size, 0);
    state.afterBulk = undefined; putRecording(state);
    await preparePassageRows(owner, id.toString(), 'generation', 'revision', profile, [passage]);
    await removeRecordingPassages([id.toString()], owner);
    await assert.rejects(savePassageResponse(passageId(owner, id.toString(), 'generation', 0), owner, request, checkpoint, [1, 0]), /deleted/);
    assert.equal(state.rows.get('recording_passages')!.size, 0);
});
