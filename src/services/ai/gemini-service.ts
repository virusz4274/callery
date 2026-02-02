import { GoogleGenAI } from "@google/genai";
import { TranscriptionSegment } from '@/lib/db/types';
import { IAIService } from './types';
import { logger } from '@/lib/logger';

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

    async generateSummary(transcript: string, languageCode: string): Promise<string> {
        if (!this.apiKey) return '';
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
            return result.text || '';
        } catch (error) {
            logger.error('Error generating summary:', error);
            // Fallback to empty string on error to not block flow
            return '';
        }
    }

    async generateTransliteration(
        segments: TranscriptionSegment[],
        languageCode: string
    ): Promise<TranscriptionSegment[]> {
        if (!this.apiKey) return segments;
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

            return segments.map((original, index) => ({
                ...original,
                transliteratedText: transliteratedSegments[index]?.transliteratedText || ''
            }));

        } catch (error) {
            logger.error('Error generating transliteration:', error);
            return segments;
        }
    }

    async generateEmbedding(text: string): Promise<number[]> {
        if (!this.apiKey || !text) return [];

        try {
            const result = await this.ai.models.embedContent({
                model: 'gemini-embedding-001',
                contents: text,
            });
            return result.embeddings?.[0]?.values || [];
        } catch (error) {
            logger.error('Error generating embedding:', error);
            return [];
        }
    }
}
