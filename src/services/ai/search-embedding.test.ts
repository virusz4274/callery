import test from 'node:test';
import assert from 'node:assert/strict';
import { registerHooks } from 'node:module';
import type { AiStepContext } from './types';

type State = { rows: Map<string, Record<string, unknown>>; calls: string[]; rateCount: number; source: 'trial' | 'admin' | 'subscription';
    planKey: string; paused?: boolean; denied?: boolean; trialExpired?: boolean; billingBlocked?: boolean; paidBaseUnavailable?: boolean; proofChecks?: number; loseResponse?: boolean; unmeasured?: boolean; authorize?: (context: AiStepContext) => void };
const key = Symbol.for('vosift.test.search-execution');
const root = globalThis as typeof globalThis & { [key]: State };
const state = `globalThis[Symbol.for('vosift.test.search-execution')]`;
const hooks = registerHooks({ resolve(specifier, context, next) {
    if (context.parentURL?.endsWith('/ai/search-embedding.ts') || context.parentURL?.endsWith('/ai/usage.ts')) {
        const source = specifier === '@/lib/config' ? `export function billingEnabled(){return true;} export function aiProvider(){return 'gemini';} export function geminiModel(){return 'test-embedding';} export function geminiApiKey(){return 'fixture';} export function compatTextConfig(){return undefined;}`
            : specifier === '@/lib/search/profile' ? `export function embeddingProfile(){return {id:'profile',provider:'gemini',model:'test-embedding',dimensions:2};} export function validateEmbedding(v){if(v.length!==2)throw new Error('Wrong dimensions');}`
            : specifier === '@/lib/mongodb' ? `export async function getMongoDb(){return {collection(name){return {async findOne(filter){if(name==='users')return {planKey:${state}.planKey,billingEntitlement:{source:${state}.source}};const row=${state}.rows.get(name+':'+filter._id);return row&&(!row.expiresAt||row.expiresAt>new Date())?structuredClone(row):null;},async updateOne(filter,patch){const k=name+':'+filter._id;${state}.rows.set(k,{...(${state}.rows.get(k)||patch.$setOnInsert||{}),...patch.$set});return {matchedCount:1};}};}};}`
            : specifier === '@/lib/access-control' ? `export function checkUserAccess(){return {allowed:!${state}.denied};}`
            : specifier === '@/lib/access-control-common' ? `export function isTrialExpired(){return Boolean(${state}.trialExpired);} export function hasBillingIssue(){return ${state}.billingBlocked?{allowed:false}:null;}`
            : specifier === '@/lib/stripe/ledger' ? `export async function ensurePaidBaseForNewWork(){${state}.proofChecks=(${state}.proofChecks||0)+1;if(${state}.paidBaseUnavailable)throw new Error('Paid base needs synchronization');}`
            : specifier === '@/lib/processing-availability' ? `export async function assertProcessingAvailable(){if(${state}.paused)throw Object.assign(new Error('Paused'),{code:'processing_paused'});}`
            : specifier === '@/lib/rate-limit' ? `export async function consumeRateLimit(input){return {allowed:++${state}.rateCount<=input.limit};}`
            : specifier === './index' ? `export function getAiService(){return {async generateEmbedding(text,context){const s=${state};s.authorize?.(context);s.calls.push(text);if(s.loseResponse)throw new Error('Response lost');await context.onUsage({provider:'gemini',model:'test-embedding',step:'embedding',inputTokens:s.unmeasured?undefined:9,outputTokens:s.unmeasured?undefined:0,measured:!s.unmeasured,requestId:'request'});return [0.25,0.75];}};}`
            : undefined;
        if (source) return { url: `data:text/javascript,${encodeURIComponent(source)}`, shortCircuit: true };
    }
    return next(specifier, context);
} });
const { getSearchEmbedding } = await import('./search-embedding');
const { assertAiCallAuthorized } = await import('./usage');
hooks.deregister();
const setup = (): State => root[key] = { rows: new Map(), calls: [], rateCount: 0, source: 'subscription', planKey: 'standard' };

test('semantic search preserves the full query and caches without any customer or operator monetary reservation', async () => {
    const s = setup(); const query = '搜索 delivery';
    assert.deepEqual(await getSearchEmbedding('owner', query), { embedding: [0.25, 0.75] });
    assert.deepEqual(await getSearchEmbedding('owner', query), { embedding: [0.25, 0.75] });
    assert.equal(s.calls.length, 1); assert.ok(Buffer.byteLength(s.calls[0]) <= 496);
    assert.equal([...s.rows.values()].filter(row => row.kind === 'search:embedding')[0].state, 'completed');
    assert.ok([...s.rows.keys()].every(name => !name.startsWith('billing_')));
    await getSearchEmbedding('another-owner', query); assert.equal(s.calls.length, 2);
    for (let i = 0; i < 8; i++) await getSearchEmbedding('owner', `different ${i}`);
    assert.deepEqual(await getSearchEmbedding('owner', 'rate limited'), { embedding: [], fallbackReason: 'search_rate_limited' });
});
test('manual pause blocks fresh calls but cached downloads remain available', async () => {
    const s = setup(); await getSearchEmbedding('owner', 'cached'); s.paused = true;
    assert.deepEqual(await getSearchEmbedding('owner', 'cached'), { embedding: [0.25, 0.75] });
    assert.deepEqual(await getSearchEmbedding('owner', 'fresh'), { embedding: [], fallbackReason: 'processing_paused' });
    assert.equal(s.calls.length, 1);
});
test('response loss remains unknown operationally without a monetary commitment', async () => {
    const s = setup(); s.loseResponse = true;
    assert.deepEqual(await getSearchEmbedding('owner', 'query'), { embedding: [], fallbackReason: 'embedding_unavailable' });
    const row = [...s.rows.values()][0]; assert.equal(row.state, 'unknown');
    assert.equal(row.maximumCostMicros, undefined); assert.equal(row.actualCostMicros, undefined);
});
test('Trial, finite Custom and ordinary-user Internal searches require no cost policy', async () => {
    for (const [source, planKey] of [['trial', 'free-trial'], ['admin', 'custom'], ['admin', 'internal']] as const) {
        const s = setup(); s.source = source; s.planKey = planKey;
        s.authorize = context => assertAiCallAuthorized('gemini', 'test-embedding', 'embedding', context);
        assert.deepEqual(await getSearchEmbedding('owner', 'query'), { embedding: [0.25, 0.75] });
        assert.equal(s.calls.length, 1);
    }
});
test('successful usage without token itemization remains unknown cost instead of measured zero', async () => {
    const s = setup(); s.unmeasured = true;
    assert.deepEqual(await getSearchEmbedding('owner', 'query'), { embedding: [0.25, 0.75] });
    const row = [...s.rows.values()].find(row => row.kind === 'search:embedding')!;
    assert.equal(row.state, 'completed'); assert.equal((row.usage as { measured: boolean }).measured, false);
    assert.equal(row.actualCostMicros, undefined);
});
test('missing execution provenance is rejected while cost configuration is irrelevant', () => {
    setup();
    assert.throws(() => assertAiCallAuthorized('gemini', 'test-embedding', 'embedding', { authSubject: 'owner', reservationId: 'fixture', onUsage: async () => undefined }), /owned execution call/);
    assert.doesNotThrow(() => assertAiCallAuthorized('gemini', 'test-embedding', 'embedding', { authSubject: 'owner', reservationId: 'fixture', fundingSource: 'customer', onUsage: async () => undefined }));
});
test('unavailable entitlement falls back without provider calls', async () => {
    const s = setup(); s.denied = true;
    assert.deepEqual(await getSearchEmbedding('owner', 'query'), { embedding: [], fallbackReason: 'processing_unavailable' });
    assert.equal(s.calls.length, 0);
});


test('cached semantic results survive billing holds while fresh calls require actual paid-service proof', async () => {
    const s = setup();
    await getSearchEmbedding('owner', 'cached');
    const calls = s.calls.length, checks = s.proofChecks;
    s.paidBaseUnavailable = true;
    assert.deepEqual(await getSearchEmbedding('owner', 'cached'), { embedding: [0.25, 0.75] });
    assert.equal(s.proofChecks, checks);
    assert.deepEqual(await getSearchEmbedding('owner', 'fresh-unpaid'), { embedding: [], fallbackReason: 'processing_unavailable' });
    assert.equal(s.calls.length, calls);
    s.paidBaseUnavailable = false; s.trialExpired = true;
    assert.deepEqual(await getSearchEmbedding('owner', 'fresh-expired'), { embedding: [], fallbackReason: 'processing_unavailable' });
    s.trialExpired = false; s.billingBlocked = true;
    assert.deepEqual(await getSearchEmbedding('owner', 'fresh-debt'), { embedding: [], fallbackReason: 'processing_unavailable' });
    assert.deepEqual(await getSearchEmbedding('owner', 'cached'), { embedding: [0.25, 0.75] });
    assert.equal(s.calls.length, calls);
});


test('oversized queries are rejected rather than silently losing their search meaning', async () => {
    const s = setup();
    assert.deepEqual(await getSearchEmbedding('owner', '搜索'.repeat(1000)), { embedding: [], fallbackReason: 'query_too_long' });
    assert.equal(s.calls.length, 0);
});
