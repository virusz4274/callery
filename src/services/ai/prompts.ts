import type { TranscriptionSegment } from '@/lib/db/types';

/**
 * Shared text-task prompts so the Gemini and OpenAI-compatible AI backends
 * behave identically. Backends differ only in transport.
 */
export function buildSummaryPrompt(transcript: string, languageCode: string): string {
    return `
You are a helpful assistant. Please provide a concise summary (2-4 sentences) in ENGLISH of the following transcript.
The original language of the transcript is ${languageCode}.
Focus on the main points and action items if any.

Transcript:
${transcript.substring(0, 100000)} [Truncated if too long]
`;
}

export function buildTransliterationPrompt(
    segments: TranscriptionSegment[],
    languageCode: string,
): string {
    return `
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
}

/**
 * Merge model-returned transliteratedText values back onto the original
 * segments by index. Unknown shapes yield empty strings, never throws.
 */
export function mergeTransliteration(
    segments: TranscriptionSegment[],
    parsed: unknown,
): TranscriptionSegment[] {
    const list = Array.isArray(parsed) ? parsed : [];
    return segments.map((original, index) => {
        const entry = list[index] as { transliteratedText?: unknown } | undefined;
        return {
            ...original,
            transliteratedText: typeof entry?.transliteratedText === 'string' ? entry.transliteratedText : '',
        };
    });
}
