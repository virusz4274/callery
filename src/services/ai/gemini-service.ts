import { GoogleGenAI } from "@google/genai";
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
        this.apiKey = process.env.GOOGLE_GENERATIVE_AI_API_KEY || process.env.GEMINI_API_KEY;

        if (!this.apiKey) {
            logger.warn('GOOGLE_GENERATIVE_AI_API_KEY or GEMINI_API_KEY is not defined. AI features will be disabled.');
        }

        // Initialize even if key is missing to avoid crash on constructor, but methods will check.
        this.ai = new GoogleGenAI({ apiKey: this.apiKey || 'dummy_key_for_init' });
    }

    private async handleUnavailableConfiguration<T>(
        operation: string,
        fallbackValue: T,
        options?: AIRequestOptions
    ): Promise<T> {
        const error = new Error('GOOGLE_GENERATIVE_AI_API_KEY or GEMINI_API_KEY is not defined');

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
                model: process.env.GEMINI_MODEL_SUMMARY || 'gemini-2.0-flash-lite-preview-02-05', // Updated to newer model as default if not set
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
                model: process.env.GEMINI_MODEL_TRANSLITERATION || 'gemini-2.0-flash-lite-preview-02-05',
                contents: prompt,
                config: {
                    responseMimeType: "application/json"
                }
            });

            const responseText = result.text;
            if (!responseText) return segments;

            const transliteratedSegments = JSON.parse(responseText) as TranscriptionSegment[];

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
                model: 'gemini-embedding-001',
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
