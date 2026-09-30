import { aiProvider } from '@/lib/config';
import { GeminiService } from './gemini-service';
import { OpenAiCompatService } from './openai-compat-service';
import type { IAIService } from './types';

export type { IAIService };

let cached: IAIService | undefined;
let cachedProvider: string | undefined;

/**
 * Text-AI backend selected by AI_PROVIDER (summaries, transliteration,
 * embeddings). Default: gemini.
 */
export function getAiService(): IAIService {
    const provider = aiProvider();
    if (!cached || cachedProvider !== provider) {
        cachedProvider = provider;
        cached = provider === 'openai_compat' ? new OpenAiCompatService() : new GeminiService();
    }
    return cached;
}
