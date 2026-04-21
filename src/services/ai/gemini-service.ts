import { GoogleGenAI } from "@google/genai";
import { env } from '@/lib/env';
import { TranscriptionSegment } from '@/lib/db/types';
import { resolveExternalServiceIncident, safelyReportExternalServiceIncident } from '@/lib/external-service-incidents';
import { logger } from '@/lib/logger';
import { AIRequestOptions, IAIService } from './types';

const GEMINI_PROVIDER = 'gemini';
const GEMINI_SERVICE = 'Google Gemini';

export class GeminiService implements IAIService {
    private ai: GoogleGenAI;
    private apiKey: string | undefined;

    constructor() {
        this.apiKey = env.GOOGLE_GENERATIVE_AI_API_KEY;

        // Initialize even if key is missing to avoid crash on constructor, but methods will check.
        this.ai = new GoogleGenAI({ apiKey: this.apiKey });
    }

    private async handleUnavailableConfiguration<T>(
        operation: string,
        fallbackValue: T,
        options?: AIRequestOptions
    ): Promise<T> {
        const error = new Error('GOOGLE_GENERATIVE_AI_API_KEY is not defined');

        if (options?.reportIncident !== false) {
            await safelyReportExternalServiceIncident({
                provider: GEMINI_PROVIDER,
                service: GEMINI_SERVICE,
                operation,
                error,
                context: {
                    configured: false,
                },
                notifyAdmins: true,
            });
        }

        if (options?.throwOnError) {
            throw error;
        }

        return fallbackValue;
    }

    private extractFirstJsonArray(text: string): string | null {
        const trimmed = text.trim();
        const arrayStart = trimmed.indexOf('[');

        if (arrayStart === -1) {
            return null;
        }

        let depth = 0;
        let inString = false;
        let isEscaped = false;

        for (let index = arrayStart; index < trimmed.length; index += 1) {
            const character = trimmed[index];

            if (inString) {
                if (isEscaped) {
                    isEscaped = false;
                    continue;
                }

                if (character === '\\') {
                    isEscaped = true;
                    continue;
                }

                if (character === '"') {
                    inString = false;
                }

                continue;
            }

            if (character === '"') {
                inString = true;
                continue;
            }

            if (character === '[') {
                depth += 1;
                continue;
            }

            if (character !== ']') {
                continue;
            }

            depth -= 1;
            if (depth === 0) {
                return trimmed.slice(arrayStart, index + 1);
            }
        }

        return null;
    }

    private parseTransliterationSegments(responseText: string): TranscriptionSegment[] {
        const candidates = [responseText.trim()];
        const extractedJsonArray = this.extractFirstJsonArray(responseText);

        if (extractedJsonArray && extractedJsonArray !== candidates[0]) {
            candidates.push(extractedJsonArray);
        }

        let lastError: unknown;

        for (const candidate of candidates) {
            try {
                const parsed = JSON.parse(candidate) as unknown;

                if (!Array.isArray(parsed)) {
                    throw new Error('Gemini transliteration response was not a JSON array');
                }

                return parsed as TranscriptionSegment[];
            } catch (error) {
                lastError = error;
            }
        }

        throw lastError instanceof Error ? lastError : new Error('Failed to parse Gemini transliteration response');
    }

    async generateSummary(transcript: string, languageCode: string, options?: AIRequestOptions): Promise<string> {
        if (!this.apiKey) return this.handleUnavailableConfiguration('generate_summary', '', options);
        if (!transcript || !transcript.trim()) return '';

        const prompt = `
You are a helpful assistant. Please provide a concise summary (2-4 sentences) in ENGLISH of the following transcript.
The original language of the transcript is ${languageCode}.
Focus on the main points and action items if any.

Transcript:
${transcript.substring(0, 100000)} [Truncated if too long]
`;

        try {
            const result = await this.ai.models.generateContent({
                model: env.GEMINI_MODEL_SUMMARY,
                contents: prompt,
            });
            await resolveExternalServiceIncident({
                provider: GEMINI_PROVIDER,
                operation: 'generate_summary',
            });
            return result.text || '';
        } catch (error) {
            logger.error('Error generating summary:', error);
            if (options?.reportIncident !== false) {
                await safelyReportExternalServiceIncident({
                    provider: GEMINI_PROVIDER,
                    service: GEMINI_SERVICE,
                    operation: 'generate_summary',
                    error,
                    context: {
                        languageCode,
                    },
                    notifyAdmins: true,
                });
            }
            if (options?.throwOnError) {
                throw error;
            }
            // Fallback to empty string on error to not block flow
            return '';
        }
    }

    async generateTransliteration(
        segments: TranscriptionSegment[],
        languageCode: string,
        options?: AIRequestOptions
    ): Promise<TranscriptionSegment[]> {
        if (!this.apiKey) return this.handleUnavailableConfiguration('generate_transliteration', segments, options);
        if (!segments || segments.length === 0) return segments;

        let responseText = '';

        const prompt = `
You are a universal transliteration expert. 
I will provide a JSON array of transcription segments. 
The input text is in ${languageCode} language code.

Your task is to add a "transliteratedText" field to EACH segment.

Adhere strictly to the following rules:

1. **Output Script (Plain ASCII Only):** - Transliterate the text into the Latin alphabet using **ONLY** standard English letters (A-Z).
   - **STRICTLY FORBIDDEN:** Do not use diacritics, macrons, or ISO/academic symbols (e.g., remove ā, ē, ō, ṟ, ṇ, ṣ).
   - Use "Chat Style" spelling: Transliterate phonetically as a native speaker would type in a casual text message.

2. **English Loanwords & Mixed Grammar:**
   - Detect English words used in the speech. Always use standard English spelling for the root word.
   - **Suffix Handling:** If an English word has a native language suffix attached, keep the English spelling for the root and append the suffix phonetically in plain text.

3. **Numbers:** - Convert all spoken numbers into digits (Arabic numerals).

4. **Formatting:** - Return ONLY the valid JSON array. 
   - Do not use markdown blocks (json).

Segments:
${JSON.stringify(segments)}
`;

        try {
            const result = await this.ai.models.generateContent({
                model: env.GEMINI_MODEL_TRANSLITERATION,
                contents: prompt,
                config: {
                    responseMimeType: "application/json"
                }
            });

            responseText = result.text || '';
            if (!responseText) return segments;

            const transliteratedSegments = this.parseTransliterationSegments(responseText);

            await resolveExternalServiceIncident({
                provider: GEMINI_PROVIDER,
                operation: 'generate_transliteration',
            });

            return segments.map((original, index) => ({
                ...original,
                transliteratedText: transliteratedSegments[index]?.transliteratedText || ''
            }));

        } catch (error) {
            logger.error('Error generating transliteration:', error);
            if (options?.reportIncident !== false) {
                await safelyReportExternalServiceIncident({
                    provider: GEMINI_PROVIDER,
                    service: GEMINI_SERVICE,
                    operation: 'generate_transliteration',
                    error,
                    context: {
                        languageCode,
                        segmentCount: segments.length,
                        responsePreview: responseText.slice(0, 500),
                    },
                    notifyAdmins: true,
                });
            }
            if (options?.throwOnError) {
                throw error;
            }
            return segments;
        }
    }

    async generateEmbedding(text: string, options?: AIRequestOptions): Promise<number[]> {
        if (!this.apiKey) return this.handleUnavailableConfiguration('generate_embedding', [], options);
        if (!text) return [];

        try {
            const result = await this.ai.models.embedContent({
                model: env.GEMINI_MODEL_EMBEDDING,
                contents: text,
            });
            await resolveExternalServiceIncident({
                provider: GEMINI_PROVIDER,
                operation: 'generate_embedding',
            });
            return result.embeddings?.[0]?.values || [];
        } catch (error) {
            logger.error('Error generating embedding:', error);
            if (options?.reportIncident !== false) {
                await safelyReportExternalServiceIncident({
                    provider: GEMINI_PROVIDER,
                    service: GEMINI_SERVICE,
                    operation: 'generate_embedding',
                    error,
                    context: {
                        inputLength: text.length,
                    },
                    notifyAdmins: true,
                });
            }
            if (options?.throwOnError) {
                throw error;
            }
            return [];
        }
    }
}
