import { createHash, randomUUID } from 'node:crypto';
import { billingEnabled } from '@/lib/config';
import { getMongoDb } from '@/lib/mongodb';
import { consumeRateLimit } from '@/lib/rate-limit';
import { getAiService } from './index';
import { AI_LIMITS, AI_PROMPT_VERSION } from './prompts';
import type { AiUsage } from './types';
import type { User } from '@/lib/db/types';
import { resolveFundingSource } from '@/lib/stripe/funding-source';
import { assertProcessingAvailable } from '@/lib/processing-availability';
import { checkUserAccess } from '@/lib/access-control';
import { hasBillingIssue, isTrialExpired } from '@/lib/access-control-common';
import { ensurePaidBaseForNewWork } from '@/lib/stripe/ledger';
import { embeddingProfile, validateEmbedding } from '@/lib/search/profile';
import type { EmbeddingProfile } from '@/lib/search/types';

export type SearchEmbeddingFallback = 'embedding_unavailable' | 'search_rate_limited' | 'processing_paused' | 'processing_unavailable' | 'query_too_long';

/** Account/profile-scoped cache; retrieval queries are operator funded, never customer usage charges. */
export async function getSearchEmbedding(subject: string, query: string, selectedProfile?: EmbeddingProfile): Promise<{ embedding: number[]; fallbackReason?: SearchEmbeddingFallback }> {
    try {
        const profile = selectedProfile ?? embeddingProfile();
        const db = await getMongoDb(), managed = billingEnabled();
        const user = await db.collection<User>('users').findOne({ authSubject: subject });
        if (!user || !checkUserAccess(user).allowed) return { embedding: [], fallbackReason: 'processing_unavailable' };
        const text = query.trim();
        const key = createHash('sha256').update(JSON.stringify([subject, profile.id, text])).digest('hex');
        const cached = await db.collection<{ _id: string; subject: string; values: number[]; expiresAt: Date }>('search_embedding_cache').findOne({ _id: key, subject, expiresAt: { $gt: new Date() } });
        if (cached) { validateEmbedding(cached.values, profile); return { embedding: cached.values }; }
        const source = managed ? resolveFundingSource(user, true) : 'selfhost';
        if (!source || managed && (isTrialExpired(user) || hasBillingIssue(user))) return { embedding: [], fallbackReason: 'processing_unavailable' };
        if (managed) await ensurePaidBaseForNewWork(user, db);
        if (!(await consumeRateLimit({ key: `search-embedding:${subject}`, limit: 10, windowMs: 60_000 }, db)).allowed) return { embedding: [], fallbackReason: 'search_rate_limited' };
        await assertProcessingAvailable(db);
        const service = getAiService(profile.provider);
        const inputTokens = service.countInputTokens ? await service.countInputTokens(profile.model, text) : Buffer.byteLength(text, 'utf8');
        if (!Number.isSafeInteger(inputTokens) || inputTokens <= 0 || inputTokens > AI_LIMITS.embeddingInputTokens) return { embedding: [], fallbackReason: 'query_too_long' };
        const callId = `search-embedding:${key}:${new Date().toISOString().slice(0, 10)}`, claim = randomUUID();
        const rows = db.collection<{ _id: string; [key: string]: unknown }>('processing_provider_calls');
        if (await rows.findOne({ _id: callId })) return { embedding: [], fallbackReason: 'embedding_unavailable' };
        await rows.updateOne({ _id: callId }, { $setOnInsert: { subject, kind: 'search:embedding', provider: profile.provider, model: profile.model, profileId: profile.id, claim, state: 'started', createdAt: new Date() } }, { upsert: true });
        if ((await rows.findOne({ _id: callId }))?.claim !== claim) return { embedding: [], fallbackReason: 'embedding_unavailable' };
        let usage: AiUsage | undefined;
        try {
            const embedding = await service.generateEmbedding(text, { authSubject: subject, throwOnError: true, reservationId: callId, fundingSource: source,
                plannedRequest: { version: 1, id: callId, provider: profile.provider, model: profile.model, prompt: text, promptVersion: AI_PROMPT_VERSION,
                    inputTokens, maxOutputTokens: 0, thinking: 'off', embedding: { purpose: 'query', dimensions: profile.dimensions, profileId: profile.id } },
                onUsage: async observed => { usage = observed; } });
            validateEmbedding(embedding, profile);
            await db.collection<{ _id: string; [key: string]: unknown }>('search_embedding_cache').updateOne({ _id: key }, { $set: { subject, profileId: profile.id, values: embedding, expiresAt: new Date(Date.now() + 24 * 60 * 60_000) } }, { upsert: true });
            await rows.updateOne({ _id: callId }, { $set: { state: 'completed', usage, completedAt: new Date() } });
            return { embedding };
        } catch {
            await rows.updateOne({ _id: callId }, { $set: { state: usage ? 'failed' : 'unknown', usage, completedAt: new Date() } });
            return { embedding: [], fallbackReason: 'embedding_unavailable' };
        }
    } catch (error) {
        return { embedding: [], fallbackReason: error && typeof error === 'object' && 'code' in error && error.code === 'processing_paused' ? 'processing_paused' : 'processing_unavailable' };
    }
}
