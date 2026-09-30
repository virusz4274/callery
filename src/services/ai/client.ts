import { GoogleGenAI } from '@google/genai';

import { geminiApiKey } from '@/lib/config';

let cached: GoogleGenAI | undefined;

/** True when a Gemini key is configured. */
export function hasGeminiKey(): boolean {
    return geminiApiKey() !== undefined;
}

/**
 * Shared Gemini client used by every Gemini feature (transcription,
 * summaries, transliteration, embeddings) so one API key serves them all.
 * Throws an actionable error when no key is configured — callers whose
 * features degrade (summaries etc.) must check hasGeminiKey() first.
 */
export function getGeminiClient(): GoogleGenAI {
    if (!cached) {
        const key = geminiApiKey();
        if (!key) {
            throw new Error(
                'Missing GOOGLE_GENERATIVE_AI_API_KEY environment variable (Gemini features need it). See .env.example.',
            );
        }
        cached = new GoogleGenAI({ apiKey: key });
    }
    return cached;
}
