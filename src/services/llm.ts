import { GoogleGenAI } from "@google/genai";
import { TranscriptionSegment } from '@/lib/db/types';

// The client gets the API key from the environment variable `GOOGLE_GENERATIVE_AI_API_KEY` mapped to GEMINI_API_KEY or we pass it explicitly.
// The new SDK looks for GEMINI_API_KEY by default or accepts it in constructor.
const apiKey = process.env.GOOGLE_GENERATIVE_AI_API_KEY || process.env.GEMINI_API_KEY;

if (!apiKey) {
    console.warn('GOOGLE_GENERATIVE_AI_API_KEY or GEMINI_API_KEY is not defined. LLM features will be disabled.');
}

const ai = new GoogleGenAI({ apiKey });

/**
 * Generates a concise English summary of the transcript.
 */
export async function generateSummary(transcript: string, languageCode: string): Promise<string> {
    if (!apiKey) return '';
    if (!transcript || !transcript.trim()) return '';

    const prompt = `
You are a helpful assistant. Please provide a concise summary (2-4 sentences) in ENGLISH of the following transcript.
The original language of the transcript is ${languageCode}.
Focus on the main points and action items if any.

Transcript:
${transcript.substring(0, 100000)} [Truncated if too long]
`;

    try {
        const result = await ai.models.generateContent({
            model: process.env.GEMINI_MODEL_SUMMARY || 'gemini-3-flash-preview',
            contents: prompt,
        });
        return result.text || '';
    } catch (error) {
        console.error('Error generating summary:', error);
        return '';
    }
}

/**
 * Transliterates all segments into English characters (e.g. Manglish) using the native structure.
 * Returns the updated segments with 'transliteratedText' populated.
 */
export async function generateTransliteration(
    segments: TranscriptionSegment[],
    languageCode: string
): Promise<TranscriptionSegment[]> {
    if (!apiKey) return segments;

    const prompt = `
You are a universal transliteration expert. 
I will provide a JSON array of transcription segments. 
The input text is in ${languageCode} language code.

Your task is to add a "transliteratedText" field to EACH segment.

Adhere strictly to the following rules:

1. **Output Script (Plain ASCII Only):** - Transliterate the text into the Latin alphabet using **ONLY** standard English letters (A-Z).
   - **STRICTLY FORBIDDEN:** Do not use diacritics, macrons, or ISO/academic symbols (e.g., remove ā, ē, ō, ṟ, ṇ, ṣ).
   - Use "Chat Style" spelling: Transliterate phonetically as a native speaker would type in a casual text message (e.g., use "tt" or "t" instead of "ṭṭ").

2. **English Loanwords & Mixed Grammar:**
   - Detect English words used in the speech. Always use standard English spelling for the root word.
   - **Suffix Handling:** If an English word has a native language suffix attached, keep the English spelling for the root and append the suffix phonetically in plain text.
   - *Example:* "Accountinṟe" → "Accountinte"
   - *Example:* "Companyile" → "Companyile"

3. **Numbers:** - Convert all spoken numbers into digits (Arabic numerals).
   - *Example:* "Seven" or "Ezhu" → "7".

4. **Formatting:** - Return ONLY the valid JSON array. 
   - Do not use markdown blocks (json).

Segments:
${JSON.stringify(segments)}
`;

    try {
        const result = await ai.models.generateContent({
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
        console.error('Error generating transliteration:', error);
        return segments;
    }
}
