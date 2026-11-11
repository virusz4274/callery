import { createHash } from 'node:crypto';
import { aiProvider, compatTextConfig, geminiModel, searchEmbeddingDimensions } from '@/lib/config';
import type { EmbeddingProfile } from './types';

export function embeddingProfile(input?: {
    provider: 'gemini' | 'openai_compat'; model: string; countBasis?: EmbeddingProfile['countBasis'];
}): EmbeddingProfile {
    const provider = input?.provider ?? aiProvider();
    const model = input?.model ?? (provider === 'gemini' ? geminiModel('embedding') : compatTextConfig()?.embeddingModel);
    if (!model) throw new Error('Configure an embedding model before indexing or searching.');
    const profile = {
        provider, model, dimensions: searchEmbeddingDimensions(provider, model), adapterVersion: 1 as const,
        chunkerVersion: 1 as const, countBasis: input?.countBasis ?? (provider === 'gemini' ? 'provider_tokenizer' as const : 'utf8_byte_bound' as const),
    };
    return { ...profile, id: createHash('sha256').update(JSON.stringify(profile)).digest('hex') };
}

export function validateEmbedding(values: number[], profile: Pick<EmbeddingProfile, 'dimensions'>): void {
    if (values.length !== profile.dimensions || !values.every(Number.isFinite) || !values.some(value => value !== 0)) {
        throw new Error(`Embedding must contain ${profile.dimensions} finite values in the configured embedding space.`);
    }
}
