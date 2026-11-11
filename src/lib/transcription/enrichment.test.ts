import test from 'node:test';
import assert from 'node:assert/strict';
import { registerHooks } from 'node:module';
import type { RecordingPassage } from '@/lib/search/passages';
import type { Recording, User } from '@/lib/db/types';
import type { AiStepContext, IAIService } from '@/services/ai/types';
import type { ExecutionPolicySnapshot } from '@/lib/stripe/execution-policy';
import { ProcessingError } from './processing-errors';
import { defaultTranscriptEnvelope, processingModels } from './ai-work-plan';
import { AI_PROMPT_V1 } from '@/services/ai/prompts';

type Fixture = { passages: Map<string, RecordingPassage>; recording: Partial<Recording> | null; user: Partial<User>; service: IAIService; budgets: Map<string, ExecutionPolicySnapshot>;
    children: Map<string, { receipt: { id: string; parentReceiptId: string }; outcome?: string }>;
    calls: string[]; writes: number; settlementFailures: number; budgetDenial?: boolean; operatingError?: Error; saveFailure?: string; policy: Record<string, unknown>; legacyRetirements?: string[] };
const key = Symbol.for('vosift.test.bundle.v1');
const root = globalThis as typeof globalThis & { [key]: Fixture };
const hook = registerHooks({ resolve(specifier, context, next) {
    if (context.parentURL?.endsWith('/transcription/enrichment.ts')) {
        const prelude = `const s=()=>globalThis[Symbol.for('vosift.test.bundle.v1')];`;
        const modules: Record<string, string> = {
            '@/lib/db/recordings': `export async function getRecordingById(){return structuredClone(s().recording);}`,
            '@/lib/db/users': `export async function findUserByAuthSubject(){return structuredClone(s().user);}`,
            '@/services/ai': `export function getAiService(){return s().service;}`,
            '@/lib/search/passages': `export async function claimPassageAttempt(){} export function passageId(o,r,g,n){return g+':'+n;} export async function preparePassageRows(o,r,g,rev,profile,parts){for(const p of parts){const id=g+':'+p.ordinal;if(!s().passages.has(id))s().passages.set(id,{...p,_id:id,owner:o,recordingId:r,generation:g,transcriptRevision:rev,profileId:profile.id});}} export async function savedPassageResponse(id,o,req,c){const p=s().passages.get(id);return p?.response?.reservationId===c.reservationId?structuredClone(p):null;} export async function savePassageResponse(id,o,req,c,vector,usage){const p=s().passages.get(id);if(!p)throw new Error('Deleted');Object.assign(p,{vector,response:{reservationId:c.reservationId,usage}});} export async function publishPassageGeneration(){}` ,
            '@/lib/stripe/legacy-processing-budget': `export async function retireLegacyProcessingBudget(owner,id){(s().legacyRetirements??=[]).push(id);return true;}`,
            './execution': `export async function updateEnrichmentCheckpoint(owner,id,previous,patch){const f=s();if(!f.recording||f.recording.aiWorkRevision!==previous.aiWorkRevision||JSON.stringify(f.recording.fullTranscript)!==JSON.stringify(previous.fullTranscript))throw new Error('A newer processing checkpoint owns this recording');if(f.saveFailure&&patch.aiWorkCheckpoints&&Object.values(patch.aiWorkCheckpoints).some(c=>c.state===f.saveFailure)){f.saveFailure=undefined;throw new Error('Checkpoint unavailable');}const revision=(previous.aiWorkRevision||0)+1;Object.assign(f.recording,structuredClone(patch),{aiWorkRevision:revision});f.writes++;return revision;}`,
            '@/lib/stripe/execution-policy': `export async function getExecutionPolicy(owner,id){return structuredClone(s().budgets.get(id));}
                export async function prepareExecutionPolicy(owner,input){const old=s().budgets.get(input.id);if(old)return structuredClone(old);s().budgets.set(input.id,input);return structuredClone(input);}
                export async function acceptExecutionCall(owner,parent,id,hash){if(s().budgetDenial)throw new Error('Processing paused');s().children.set(id,{receipt:{id,parentReceiptId:parent}});}
                export async function recordExecutionOutcome(owner,parent,id,outcome){if(s().settlementFailures-->0)throw new Error('Checkpoint unavailable');let child=s().children.get(id);if(!child){child={receipt:{id,parentReceiptId:parent}};s().children.set(id,child);}child.outcome=outcome;}
                export async function closeExecutionPolicy(owner,id){if([...s().children.values()].some(c=>c.receipt.parentReceiptId===id&&c.outcome!=='completed'))throw new Error('Unresolved child');}`,

        };
        if (modules[specifier]) return { url: `data:text/javascript,${encodeURIComponent(prelude + modules[specifier])}`, shortCircuit: true };
    }
    return next(specifier, context);
} });
const { finishTranscriptionEnrichment } = await import('./enrichment');
hook.deregister();

const prior = { billing: process.env.NEXT_PUBLIC_ENABLE_BILLING, cost: process.env.MANAGED_COST_POLICY_JSON };
test.after(() => { for (const [name, value] of [['NEXT_PUBLIC_ENABLE_BILLING', prior.billing], ['MANAGED_COST_POLICY_JSON', prior.cost]]) { if (value === undefined) delete process.env[name!]; else process.env[name!] = value; } });
function setup(text = 'A fictional demo recording.'): Fixture {
    const rate = { inputUsdMicrosPerMillionTokens: 300_000, outputUsdMicrosPerMillionTokens: 2_500_000 };
    const policy = { version: 'bundle-test', expiresAt: '2999-01-01', ai: { 'gemini:test': rate } };
    process.env.NEXT_PUBLIC_ENABLE_BILLING = 'true'; process.env.MANAGED_COST_POLICY_JSON = JSON.stringify(policy);
    const f: Fixture = { passages: new Map(), recording: { duration: 30, fullTranscript: [{ speakerId: 'A', text, words: [{ text, start: 0, end: 30 }] }], languageCode: 'en',
        transcriptionEnrichmentPending: true, transcriptionResultAttemptId: 'original-audio', transcriptionStatus: 'processing' },
        user: { planKey: 'internal', billingEntitlement: { source: 'admin', grantedAt: new Date() } }, budgets: new Map(), children: new Map(), calls: [], writes: 0, settlementFailures: 0, policy,
        service: { countInputTokens: async (_model, text) => Math.ceil(Buffer.byteLength(text) / 4),
            generateSummary: async (_text, _language, context) => { f.calls.push('summary'); await measured(context); return 'All fictional main points and actions.'; },
            generateTransliteration: async (segments, _language, context) => { f.calls.push('transliteration'); await measured(context); return segments.map(s => ({ ...s, transliteratedText: 'latin' })); },
            generateEmbedding: async (_text, context) => { f.calls.push('embedding'); await context?.onUsage?.({ provider: 'gemini', model: 'test', step: 'embedding', measured: false }); return [0.1, 0.2]; } } };
    root[key] = f; return f;
}
async function measured(context?: AiStepContext) { await context?.onUsage?.({ provider: 'gemini', model: 'test', step: context?.plannedRequest?.maxOutputTokens === 0 ? 'embedding' : 'summary', inputTokens: context?.plannedRequest?.inputTokens || 10, outputTokens: context?.plannedRequest?.maxOutputTokens === 0 ? 0 : 8, thoughtTokens: context?.plannedRequest?.maxOutputTokens === 0 ? 0 : 2, measured: true } as never); }

test('Internal accepts a fresh bounded enrichment operation without rewriting the old600microdollar audio receipt', async () => {
    const f = setup(); f.recording!.transcriptionReceipt = { id: 'old-audio', aiBudgetMicros: 600 } as Recording['transcriptionReceipt'];
    const original = structuredClone(f.recording!.transcriptionReceipt);
    await finishTranscriptionEnrichment('owner', 'recording');
    assert.deepEqual(f.recording!.transcriptionReceipt, original);
    assert.equal(f.recording!.aiWorkPlan!.maximumCostMicros, undefined);
    assert.deepEqual(f.calls, ['summary', 'embedding']);
    assert.equal(f.recording!.fullTranscript![0].transliteratedText, f.recording!.fullTranscript![0].text);
    assert.equal(f.recording!.transcriptionStatus, 'completed');
});
test('saved response and checkpoint survive a completion-journal crash without another API call', async () => {
    const f = setup(); f.settlementFailures = 1;
    await assert.rejects(finishTranscriptionEnrichment('owner', 'recording'), /response is saved/);
    assert.equal(f.recording!.aiWorkCheckpoints!['summary-leaf-0'].state, 'response_saved');
    await finishTranscriptionEnrichment('owner', 'recording');
    assert.equal(f.calls.filter(s => s === 'summary').length, 1);
    assert.equal(f.recording!.transcriptionEnrichmentPending, false);
});
test('completed summary is reused when a bounded embedding retry is requested', async () => {
    const f = setup(); let fail = true;
    f.service.generateEmbedding = async (_text, context) => { f.calls.push('embedding'); if (fail) throw Object.assign(new Error('Provider429 quota'), { status: 429 }); await measured(context); return [0.5, 0.25]; };
    await assert.rejects(finishTranscriptionEnrichment('owner', 'recording'), (e: unknown) => e instanceof ProcessingError && e.processingStatus.retryAction === 'resume_enrichment');
    fail = false; await finishTranscriptionEnrichment('owner', 'recording');
    assert.deepEqual(f.calls, ['summary', 'embedding', 'embedding']);
    assert.equal(f.recording!.searchIndex?.state, 'ready');
    assert.deepEqual([...f.passages.values()][0].vector, [0.5, 0.25]);
});
test('unknown response remains reviewable and never starts an automatic paid retry', async () => {
    const f = setup(); f.service.generateSummary = async () => { f.calls.push('summary'); throw new Error('Socket reset after request'); };
    await assert.rejects(finishTranscriptionEnrichment('owner', 'recording'), (e: unknown) => e instanceof ProcessingError && e.processingStatus.providerOutcome === 'unknown');
    await assert.rejects(finishTranscriptionEnrichment('owner', 'recording'), /earlier provider response is uncertain/);
    assert.equal(f.calls.length, 1); assert.equal([...f.children.values()][0].outcome, 'unknown');
});
test('exactly one extra paid attempt is permitted after known provider rejection', async () => {
    const f = setup(); f.service.generateSummary = async () => { f.calls.push('summary'); throw Object.assign(new Error('429'), { status: 429 }); };
    await assert.rejects(finishTranscriptionEnrichment('owner', 'recording'));
    await assert.rejects(finishTranscriptionEnrichment('owner', 'recording'));
    await assert.rejects(finishTranscriptionEnrichment('owner', 'recording'), /normal attempt and single retry/);
    assert.equal(f.calls.length, 2);
});
test('saved customer transcript enriches without historical monetary funding or cost configuration', async () => {
    const f = setup(); f.user = { planKey: 'standard', billingEntitlement: { source: 'subscription', grantedAt: new Date() } };
    delete process.env.MANAGED_COST_POLICY_JSON;
    const original = structuredClone(f.recording!.fullTranscript);
    await finishTranscriptionEnrichment('owner', 'recording');
    assert.deepEqual(f.calls, ['summary', 'embedding']);
    assert.equal(f.recording!.fullTranscript![0].text, original![0].text);
    assert.equal(f.recording!.transcriptionReceipt, undefined);
    assert.equal(f.recording!.transcriptionStatus, 'completed');
});
test('missing saved transcript stops before token counting, provider work, or funding', async () => {
    const f = setup(); f.recording = null;
    await assert.rejects(finishTranscriptionEnrichment('owner', 'recording'), /saved transcript is unavailable/);
    assert.equal(f.writes, 0); assert.equal(f.budgets.size, 0);
});
test('full recording summary covers first and last sections through bounded reduction', async () => {
    const f = setup('BEGIN ' + 'fictional source text '.repeat(160) + ' END');
    await finishTranscriptionEnrichment('owner', 'recording');
    const leaves = f.recording!.aiWorkPlan!.summaryLeaves;
    assert.ok(leaves.length > 1); assert.ok(leaves[0].source.startsWith('BEGIN')); assert.ok(leaves.at(-1)!.source.endsWith('END'));
    assert.equal(leaves.map(l => l.source).join(''), f.recording!.fullTranscript![0].text);
    assert.ok(Object.keys(f.recording!.aiWorkCheckpoints!).some(id => id.startsWith('summary-reduce-')));
    for (const checkpoint of Object.values(f.recording!.aiWorkCheckpoints!)) {
        if (checkpoint.request.step === 'summary') assert.ok(checkpoint.request.prompt.includes(`at most ${checkpoint.request.maxOutputTokens} tokens.`));
    }
});
test('multilingual long segments preserve original timings, words and every source character', async () => {
    const text = 'മലയാളം שלום नमस्ते '.repeat(75); const f = setup(text);
    const original = structuredClone(f.recording!.fullTranscript![0]);
    await finishTranscriptionEnrichment('owner', 'recording');
    assert.equal(f.recording!.aiWorkPlan!.transliterationChunks.flatMap(c => c.segments.map(s => s.text)).join(''), text);
    const result = f.recording!.fullTranscript![0]; assert.equal(result.text, original.text); assert.deepEqual(result.words, original.words); assert.equal(result.speakerId, original.speakerId);
    assert.ok(result.transliteratedText!.length > 0);
});
test('accepted model and prompt remain frozen after runtime configuration changes', async () => {
    const f = setup(); f.settlementFailures = 1;
    await assert.rejects(finishTranscriptionEnrichment('owner', 'recording'));
    const original = structuredClone(f.recording!.aiWorkPlan);
    process.env.MANAGED_COST_POLICY_JSON = '{}';
    await finishTranscriptionEnrichment('owner', 'recording');
    assert.deepEqual(f.recording!.aiWorkPlan, original);
});
test('new transcript revision cannot be overwritten by stale enrichment checkpoints', async () => {
    const f = setup(); f.settlementFailures = 1;
    await assert.rejects(finishTranscriptionEnrichment('owner', 'recording'));
    f.recording!.fullTranscript![0].text = 'A newer transcript';
    await assert.rejects(finishTranscriptionEnrichment('owner', 'recording'), /another transcript revision/);
    assert.equal(f.calls.length, 1);
});
test('concurrent resumptions issue only one summary call', async () => {
    const f = setup();
    await Promise.allSettled([finishTranscriptionEnrichment('owner', 'recording'), finishTranscriptionEnrichment('owner', 'recording')]);
    assert.equal(f.calls.filter(s => s === 'summary').length, 1);
});
test('execution models contain no required monetary rates', async () => {
    const f = setup(); process.env.MANAGED_COST_POLICY_JSON = '{}';
    await finishTranscriptionEnrichment('owner', 'recording');
    assert.equal('rate' in f.recording!.aiWorkPlan!.aiModels.summary, false);
    assert.ok([...f.budgets.values()].every(policy => !('totalCostMicros' in policy)));
});

test('accepted policies without a planner version materialize their original v1 requests', async () => {
    const f = setup();
    f.recording!.fullTranscript = Array.from({ length: 8 }, () => ({ speakerId: 'A', text: 'മലയാളം', words: [] }));
    const policy: ExecutionPolicySnapshot = { version: 1, id: 'accepted-before-packing', parentReceiptId: 'accepted-before-packing', fundingSource: 'internal',
        provider: 'gemini', model: 'test', aiModels: processingModels(), transcriptEnvelope: defaultTranscriptEnvelope(30),
        promptVersion: AI_PROMPT_V1, maximumAttempts: 2, acceptedAt: new Date().toISOString() };
    f.recording!.transcriptionReceipt = { id: policy.id, executionPolicy: policy } as Recording['transcriptionReceipt'];
    f.budgets.set(policy.id, policy);
    await finishTranscriptionEnrichment('owner', 'recording');
    assert.equal(f.recording!.aiWorkPlan!.version, 1);
    assert.equal(f.recording!.aiWorkPlan!.transliterationChunks.length, 8);
    assert.deepEqual(f.recording!.aiWorkPlan!.transliterationChunks.map(chunk => chunk.call.id), Array.from({ length: 8 }, (_, i) => `transliteration-${i}-0`));
});

test('new policies pack multiple source segments and preserve their completed requests on continuation', async () => {
    const f = setup();
    f.recording!.fullTranscript = Array.from({ length: 8 }, () => ({ speakerId: 'A', text: 'മലയാളം', words: [] }));
    f.settlementFailures = 1;
    await assert.rejects(finishTranscriptionEnrichment('owner', 'recording'));
    const plan = structuredClone(f.recording!.aiWorkPlan!);
    assert.equal(plan.version, 2);
    assert.equal(plan.transliterationChunks.length, 1);
    await finishTranscriptionEnrichment('owner', 'recording');
    assert.deepEqual(f.recording!.aiWorkPlan, plan);
    assert.equal(f.calls.filter(step => step === 'summary').length, 1);
    assert.equal(f.calls.filter(step => step === 'transliteration').length, 1);
});

test('failed response persistence never claims that the payload was durably saved', async () => {
    const f = setup(); f.saveFailure = 'response_saved';
    await assert.rejects(finishTranscriptionEnrichment('owner', 'recording'), (e: unknown) => e instanceof ProcessingError && e.processingStatus.code === 'ai_response_persistence_unknown');
    assert.equal(f.recording!.aiWorkCheckpoints!['summary-leaf-0'].state, 'started');
    await assert.rejects(finishTranscriptionEnrichment('owner', 'recording'), /earlier provider response is uncertain/);
    assert.equal(f.calls.length, 1);
});


test('a second attempt paused before submission remains resumable and does not use a third attempt', async () => {
    const f = setup(); let rejectFirst = true;
    f.service.generateSummary = async (_text, _language, context) => {
        f.calls.push('summary');
        if (rejectFirst) { rejectFirst = false; throw Object.assign(new Error('Provider quota'), { status: 429 }); }
        await measured(context); return 'Recovered summary';
    };
    await assert.rejects(finishTranscriptionEnrichment('owner', 'recording'));
    f.budgetDenial = true;
    await assert.rejects(finishTranscriptionEnrichment('owner', 'recording'), /Processing paused/);
    assert.equal(f.recording!.aiWorkCheckpoints!['summary-leaf-0'].state, 'prepared');
    assert.equal(f.recording!.aiWorkCheckpoints!['summary-leaf-0'].attempts, 2);
    assert.equal(f.calls.length, 1);
    f.budgetDenial = false;
    await finishTranscriptionEnrichment('owner', 'recording');
    assert.equal(f.calls.filter(call => call === 'summary').length, 2);
    assert.equal(f.recording!.aiWorkCheckpoints!['summary-leaf-0'].attempts, 2);
    assert.equal(f.recording!.transcriptionStatus, 'completed');
});


test('a completion for an older provider result cannot enrich the newer saved transcript', async () => {
    const f = setup();
    await assert.rejects(finishTranscriptionEnrichment('owner', 'recording', undefined, 'older-provider-result'), /newer transcription result/);
    assert.equal(f.calls.length, 0); assert.equal(f.writes, 0); assert.equal(f.budgets.size, 0);
});


test('accepted legacy processing snapshots pin models, limits and planner without changing audio accounting', async t => {
    const f = setup();
    f.recording!.fullTranscript = Array.from({ length: 3 }, (_, index) => ({ speakerId: `Speaker ${index}`, start: index, end: index + 1, text: 'മലയാളം', words: [] }));
    const physical = { ...defaultTranscriptEnvelope(30), maxSourceTextBytes: 8192 };
    const models = {
        summary: { provider: 'gemini', model: 'accepted-summary-model', rate: { inputUsdMicrosPerMillionTokens: 1, outputUsdMicrosPerMillionTokens: 2 } },
        transliteration: { provider: 'gemini', model: 'accepted-transliteration-model', stale: true },
        embedding: { provider: 'gemini', model: 'accepted-embedding-model', unpriced: true },
    };
    const historical = { version: 1, id: 'accepted-legacy-parent', parentReceiptId: 'accepted-legacy-parent', fundingSource: 'customer',
        provider: 'soniox', model: 'accepted-asr-model', aiModels: models,
        transcriptEnvelope: { ...physical, externalAsrCostBoundMicros: 600, externalBoundProof: { kind: 'provider_contract', reference: 'historical-only', expiresAt: '2026-01-01', verifiedAt: '2025-01-01', verifiedBy: 'historical-operator' } },
        asrCostMicros: 600, aiCostMicros: 300, totalCostMicros: 900, costPolicyVersion: 'expired-policy',
        acceptedAt: '2025-12-01T00:00:00.000Z', recordingId: 'recording', audioDurationSeconds: 30, fileSize: 1234 };
    f.recording!.transcriptionReceipt = { id: 'accepted-legacy-parent', maximumCostMicros: 600, processingBudget: historical } as Recording['transcriptionReceipt'];
    const receipt = structuredClone(f.recording!.transcriptionReceipt);
    const names = ['GEMINI_MODEL_SUMMARY', 'GEMINI_MODEL_TRANSLITERATION', 'GEMINI_MODEL_EMBEDDING'];
    const previous = names.map(name => [name, process.env[name]] as const);
    t.after(() => { for (const [name, value] of previous) { if (value === undefined) delete process.env[name]; else process.env[name] = value; } });
    for (const name of names) process.env[name] = 'today-different-model';
    delete process.env.MANAGED_COST_POLICY_JSON;
    f.settlementFailures = 1;
    await assert.rejects(finishTranscriptionEnrichment('owner', 'recording'), /response is saved/);
    const plan = structuredClone(f.recording!.aiWorkPlan!);
    assert.equal(plan.version, 1); assert.equal(plan.parentReceiptId, historical.id); assert.equal(plan.promptVersion, AI_PROMPT_V1);
    assert.equal(plan.transliterationChunks.length, 3);
    const execution = f.budgets.get(historical.id)!;
    assert.deepEqual(execution.aiModels, Object.fromEntries(Object.entries(models).map(([step, model]) => [step, { provider: model.provider, model: model.model }])));
    assert.deepEqual(execution.transcriptEnvelope, physical);
    assert.equal(execution.fundingSource, 'customer'); assert.equal(execution.acceptedAt, historical.acceptedAt);
    assert.equal(execution.model, historical.model); assert.equal(execution.plannerVersion, 1);
    assert.equal(execution.audioDurationSeconds, 30); assert.equal(execution.fileSize, 1234);
    assert.equal('totalCostMicros' in execution, false); assert.equal('costPolicyVersion' in execution, false);
    await finishTranscriptionEnrichment('owner', 'recording');
    assert.deepEqual(f.recording!.transcriptionReceipt, receipt);
    assert.deepEqual(f.recording!.aiWorkPlan, plan);
    assert.equal(f.calls.filter(call => call === 'summary').length, 1);
    assert.equal(f.recording!.transcriptionStatus, 'completed');
    assert.deepEqual(f.legacyRetirements, [historical.id]);
});

test('a legacy physical envelope still constrains first enrichment after defaults change', async () => {
    const f = setup();
    f.recording!.transcriptionReceipt = { id: 'accepted-small-envelope', processingBudget: {
        version: 1, id: 'accepted-small-envelope', parentReceiptId: 'accepted-small-envelope', fundingSource: 'internal',
        provider: 'gemini', model: 'old-asr', aiModels: processingModels(), transcriptEnvelope: { ...defaultTranscriptEnvelope(30), maxSourceTextBytes: 1 },
        asrCostMicros: 0, aiCostMicros: 0, totalCostMicros: 0, acceptedAt: '2026-01-01T00:00:00.000Z',
    } } as Recording['transcriptionReceipt'];
    const receipt = structuredClone(f.recording!.transcriptionReceipt);
    await assert.rejects(finishTranscriptionEnrichment('owner', 'recording'), /accepted processing envelope/);
    assert.equal(f.calls.length, 0); assert.equal(f.recording!.aiWorkPlan, undefined);
    assert.deepEqual(f.recording!.transcriptionReceipt, receipt);
});


test('saved external embedding repairs a lost parent reference without another paid call or inline vector', async () => {
    const f = setup();
    f.service.generateEmbedding = async (_text, context) => {
        f.calls.push('embedding'); await measured(context); f.saveFailure = 'response_saved'; return [0.25, 0.75];
    };
    await assert.rejects(finishTranscriptionEnrichment('owner', 'recording'), /durable result could not be confirmed/);
    assert.equal(f.recording!.aiWorkCheckpoints!['passage-0'].state, 'started');
    assert.ok([...f.passages.values()][0].vector);
    await finishTranscriptionEnrichment('owner', 'recording');
    assert.equal(f.calls.filter(call => call === 'embedding').length, 1);
    assert.equal(f.recording!.aiWorkCheckpoints!['passage-0'].result, undefined);
    assert.equal(typeof f.recording!.aiWorkCheckpoints!['passage-0'].resultRef, 'string');
    assert.equal(f.recording!.searchIndex?.state, 'ready');
});
