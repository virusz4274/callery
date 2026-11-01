import test, { after } from 'node:test';
import assert from 'node:assert/strict';
import { registerHooks } from 'node:module';
import { ObjectId } from 'mongodb';
import type { Recording } from '@/lib/db/types';
import { ProcessingError } from './processing-errors';

type Fixture = { recording: Partial<Recording>; events: string[]; plans: string[]; settlements: Set<string>;
    enrichmentCalls: number; error?: Error; takeoverOnRead?: boolean; settlementError?: boolean };
const key = Symbol.for('vosift.test.common-completion');
const root = globalThis as typeof globalThis & { [key]: Fixture };
const prelude = `const s=()=>globalThis[Symbol.for('vosift.test.common-completion')];`;
const modules: Record<string,string> = {
    '@/lib/db/recordings': `export async function getRecordingById(){if(s().takeoverOnRead&&s().events.includes('save')){s().takeoverOnRead=false;Object.assign(s().recording,{transcriptionResultAttemptId:'new-result',transcriptionAttemptId:'new-attempt',transcriptionJobId:'new-job',transcriptionReceipt:{id:'new-audio'}});}return structuredClone(s().recording);}
        export async function updateRecording(id,owner,patch){Object.assign(s().recording,patch);s().events.push('save');}
        export async function markTranscriptionUsageReported(id,owner,receipt){s().recording.transcriptionUsageReportId=receipt;s().events.push('usage-mark');}`,
    '@/lib/db/users': `export async function incrementTranscriptionUsed(){}`,
    '@/lib/config': `export function billingEnabled(){return true;}`,
    '@/lib/stripe/usage': `export async function drainLedgerOutbox(){} export async function reportUsage(){throw new Error('Unexpected legacy audio');}`,
    '@/lib/stripe/transcription-receipt': `export async function settleCanonicalTranscription(owner,receipt){if(!s().recording.fullTranscript)throw new Error('Audio billed before durable source');if(s().settlementError){s().settlementError=false;throw new Error('Ledger interrupted');}s().settlements.add(receipt.id);s().events.push('audio');}`,
    './execution': `export async function updateDeferredTranscriptionResult(owner,id,previous,execution,patch){if(execution.attemptId!==s().recording.transcriptionAttemptId)throw new Error('Stale attempt');Object.assign(s().recording,patch);s().events.push('save');} export async function updateLegacyTranscriptionResult(owner,id,previous,patch){if(s().recording.transcriptionAttemptId)throw new Error('Stale legacy callback');Object.assign(s().recording,patch);s().events.push('save');} export async function updateTranscriptionAttempt(owner,id,execution,patch){if(execution.attemptId!==s().recording.transcriptionAttemptId)throw new Error('Stale attempt');Object.assign(s().recording,patch);s().events.push('save');}`,
    './enrichment': `export async function finishTranscriptionEnrichment(){s().enrichmentCalls++;s().events.push('enrich');s().plans.push(JSON.stringify(s().recording.aiWorkCheckpoints));if(s().error)throw s().error;Object.assign(s().recording,{transcriptionStatus:'completed',transcriptionEnrichmentPending:false});}`,
    './notifications': `export async function notifyProcessingOutcome(owner,id,outcome){s().events.push('notify:'+outcome);}`,
};
const hook=registerHooks({resolve(specifier,context,next){const source=context.parentURL?.endsWith('/transcription/completion.ts')?modules[specifier]:undefined;return source?{url:'data:text/javascript,'+encodeURIComponent(prelude+source),shortCircuit:true}:next(specifier,context);}});
const { acceptTranscriptionResult, completeTranscriptionResult, continueSavedTranscription }=await import('./completion');
after(()=>hook.deregister());
const execution={jobId:'owned-job',attemptId:'attempt-1'};
function setup(){const f:Fixture={recording:{_id:new ObjectId(),authSubject:'owner',transcriptionStatus:'processing',transcriptionAttemptId:execution.attemptId,transcriptionJobId:execution.jobId,
    duration:60,transcriptionReceipt:{id:'audio-1',accountingMode:'retail_only',consumedSeconds:60,acceptedAt:new Date()} as Recording['transcriptionReceipt']},
    events:[],plans:[],settlements:new Set(),enrichmentCalls:0};root[key]=f;return f;}
function result(provider:'gemini'|'soniox'|'elevenlabs') {return {segments:[{speakerId:'A',text:'Owned fictional source',words:[]}],languageCode:'en',provider,providerResultId:'provider-1',multiplier:1};}

for(const provider of ['gemini','soniox','elevenlabs'] as const)test(`${provider} uses the common durable result and truthful partial outcome`,async()=>{
    const f=setup();f.error=new ProcessingError('Provider quota',{stage:'summary',state:'failed',retryAction:'resume_enrichment',providerOutcome:'responded'});
    const completion=await completeTranscriptionResult('owner',f.recording._id!.toHexString(),result(provider),execution);
    assert.equal(completion.outcome,'partial');assert.ok(f.recording.fullTranscript?.length);assert.equal(f.recording.transcriptionEnrichmentPending,true);
    assert.ok(f.events.indexOf('save')<f.events.indexOf('audio'));assert.ok(f.events.indexOf('audio')<f.events.indexOf('enrich'));
    assert.equal(f.recording.processingStatus?.stage,'summary');assert.equal(f.events.at(-1),'notify:partial');assert.equal(f.events.includes('notify:completed'),false);
    assert.equal(f.settlements.size,1);
});

test('callback replay preserves checkpoints, and enrichment continuation never replaces the original audio receipt',async()=>{
    const f=setup();f.error=new ProcessingError('Embedding failed',{stage:'embedding',state:'failed',retryAction:'resume_enrichment',providerOutcome:'responded'});
    const id=f.recording._id!.toHexString();await completeTranscriptionResult('owner',id,result('soniox'),execution);
    const checkpoint={state:'completed',result:'Saved summary'};f.recording.aiWorkCheckpoints={saved:checkpoint} as unknown as Recording['aiWorkCheckpoints'];
    assert.equal((await completeTranscriptionResult('owner',id,result('soniox'),execution)).outcome,'partial');assert.equal(f.enrichmentCalls,1,'A callback retry cannot repeat failed AI');
    f.error=undefined;const completion=await continueSavedTranscription('owner',id,execution);
    assert.equal(completion.outcome,'completed');assert.deepEqual(f.recording.aiWorkCheckpoints,{saved:checkpoint});assert.equal(f.settlements.size,1);
    await continueSavedTranscription('owner',id,execution);assert.equal(f.enrichmentCalls,2);assert.equal(f.settlements.size,1);
    assert.equal(f.recording.transcriptionReceipt?.id,'audio-1');
});

test('stale normalized results cannot replace a newer transcript or settle its audio',async()=>{
    const f=setup();f.recording.transcriptionAttemptId='new-attempt';
    await assert.rejects(completeTranscriptionResult('owner',f.recording._id!.toHexString(),result('gemini'),execution),/Stale/);
    assert.equal(f.recording.fullTranscript,undefined);assert.equal(f.settlements.size,0);assert.equal(f.enrichmentCalls,0);
});


test('takeover after durable save cannot settle or enrich the replacement receipt',async()=>{
    const f=setup();f.takeoverOnRead=true;
    await assert.rejects(completeTranscriptionResult('owner',f.recording._id!.toHexString(),result('soniox'),execution),/newer transcription result/);
    assert.equal(f.settlements.size,0);assert.equal(f.enrichmentCalls,0);assert.equal(f.events.includes('notify:completed'),false);
    assert.equal(f.recording.transcriptionReceipt?.id,'new-audio');
});


test('late response preserves a durable handoff through audio-settlement interruption and pins the original receipt',async()=>{
    const f=setup();f.settlementError=true;const id=f.recording._id!.toHexString(), acceptedAt=f.recording.transcriptionReceipt!.acceptedAt;
    await assert.rejects(acceptTranscriptionResult('owner',id,result('soniox'),execution,true),/Ledger interrupted/);
    assert.deepEqual(f.recording.transcriptionCompletionPending,execution);assert.equal(f.recording.transcriptionStatus,'pending');
    assert.ok(f.recording.fullTranscript?.length);assert.equal(f.enrichmentCalls,0);
    const accepted=await acceptTranscriptionResult('owner',id,result('soniox'),execution,true);
    assert.equal(accepted.recording.transcriptionReceipt?.id,'audio-1');assert.deepEqual(accepted.recording.transcriptionReceipt?.acceptedAt,acceptedAt);
    assert.equal(f.settlements.size,1);assert.equal(f.enrichmentCalls,0);assert.deepEqual(f.recording.transcriptionCompletionPending,execution);
});
