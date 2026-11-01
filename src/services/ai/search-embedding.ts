import { createHash, randomUUID } from 'node:crypto';
import { aiProvider, billingEnabled, compatTextConfig, geminiApiKey, geminiModel } from '@/lib/config';
import { getMongoDb } from '@/lib/mongodb';
import { consumeRateLimit } from '@/lib/rate-limit';
import { getAiService } from './index';
import { AI_LIMITS, AI_PROMPT_VERSION, truncateUtf8 } from './prompts';
import type { AiUsage } from './types';
import type { User } from '@/lib/db/types';
import { resolveFundingSource } from '@/lib/stripe/funding-source';
import { assertProcessingAvailable } from '@/lib/processing-availability';
import { checkUserAccess } from '@/lib/access-control';
import { hasBillingIssue, isTrialExpired } from '@/lib/access-control-common';
import { ensurePaidBaseForNewWork } from '@/lib/stripe/ledger';

export type SearchEmbeddingFallback = 'embedding_unavailable' | 'search_rate_limited' | 'processing_paused' | 'processing_unavailable';

/** Account-scoped cache and rate limits; query embeddings are never customer usage charges. */
export async function getSearchEmbedding(subject: string, query: string): Promise<{ embedding: number[]; fallbackReason?: SearchEmbeddingFallback }> {
    if (!billingEnabled()) {
        try {
            await assertProcessingAvailable();
            return { embedding: await getAiService().generateEmbedding(truncateUtf8(query, AI_LIMITS.embeddingInputTokens - 16)) };
        } catch (error) { return { embedding: [], fallbackReason: error && typeof error === 'object' && 'code' in error && error.code === 'processing_paused' ? 'processing_paused' : 'embedding_unavailable' }; }
    }
    try {
        const db = await getMongoDb();
        const provider = aiProvider();
        const model = provider === 'gemini' ? geminiModel('embedding') : compatTextConfig()?.embeddingModel;
        if (!model) return { embedding: [], fallbackReason: 'embedding_unavailable' };
        const user = await db.collection<User>('users').findOne({ authSubject: subject });
        const source = user && resolveFundingSource(user, true);
        if (!user || !checkUserAccess(user).allowed) return { embedding: [], fallbackReason: 'processing_unavailable' };
        const text = truncateUtf8(query.trim(), AI_LIMITS.embeddingInputTokens - 16);
        const key = createHash('sha256').update(`${subject}:${provider}:${model}:${text}`).digest('hex');
        const cached = await db.collection<{ _id: string; subject: string; values: number[]; expiresAt: Date }>('search_embedding_cache').findOne({ _id: key, subject, expiresAt: { $gt: new Date() } });
        if (cached) return { embedding: cached.values };
        if (!source || isTrialExpired(user) || hasBillingIssue(user)) return { embedding: [], fallbackReason: 'processing_unavailable' };
        if (provider === 'gemini' && !geminiApiKey()) return { embedding: [], fallbackReason: 'embedding_unavailable' };
        await ensurePaidBaseForNewWork(user, db);
        if (!(await consumeRateLimit({ key: `search-embedding:${subject}`, limit: 10, windowMs: 60_000 }, db)).allowed) return { embedding: [], fallbackReason: 'search_rate_limited' };
        await assertProcessingAvailable(db);
        const callId = `search-embedding:${key}:${new Date().toISOString().slice(0, 10)}`, claim = randomUUID();
        const rows = db.collection<{ _id: string; [key: string]: unknown }>('processing_provider_calls');
        const previousCall = await rows.findOne({ _id: callId });
        if (previousCall) return { embedding: [], fallbackReason: 'embedding_unavailable' };
        await rows.updateOne({ _id: callId }, { $setOnInsert: { subject, kind: 'search:embedding', provider, model, claim, state: 'started', createdAt: new Date() } }, { upsert: true });
        if ((await rows.findOne({ _id: callId }))?.claim !== claim) return { embedding: [], fallbackReason: 'embedding_unavailable' };
        let usage: AiUsage | undefined;
        try {
            const embedding = await getAiService(provider).generateEmbedding(text, { authSubject: subject, throwOnError: true, reservationId: callId, fundingSource: source,
                plannedRequest: { version: 1, id: callId, provider, model, prompt: text, promptVersion: AI_PROMPT_VERSION, inputTokens: Buffer.byteLength(text, 'utf8'), maxOutputTokens: 0, thinking: 'off' },
                onUsage: async observed => { usage = observed; } });
            if (!embedding.length || !embedding.every(Number.isFinite)) throw new Error('Embedding response was invalid.');
            await db.collection<{ _id: string; [key: string]: unknown }>('search_embedding_cache').updateOne({ _id: key }, { $set: { subject, values: embedding, expiresAt: new Date(Date.now() + 24 * 60 * 60_000) } }, { upsert: true });
            await rows.updateOne({ _id: callId }, { $set: { state: 'completed', usage, completedAt: new Date() } });
            return { embedding };
        } catch {
            await rows.updateOne({ _id: callId }, { $set: { state: usage ? 'failed' : 'unknown', usage, completedAt: new Date() } });
            return { embedding: [], fallbackReason: 'embedding_unavailable' };
        }
    } catch (error) { return { embedding: [], fallbackReason: error && typeof error === 'object' && 'code' in error && error.code === 'processing_paused' ? 'processing_paused' : 'processing_unavailable' }; }
}
