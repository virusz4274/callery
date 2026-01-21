import { TranscriptionSegment } from '@/lib/db/types';

export interface IAIService {
    /**
     * Generates a concise summary of the transcript.
     * @param transcript The full text transcript
     * @param languageCode The ISO language code of the transcript
     */
    generateSummary(transcript: string, languageCode: string): Promise<string>;

    /**
     * Transliterates transcription segments into English characters (e.g. Manglish).
     * @param segments Array of transcription segments
     * @param languageCode The ISO language code of the input text
     */
    generateTransliteration(
        segments: TranscriptionSegment[],
        languageCode: string
    ): Promise<TranscriptionSegment[]>;

    /**
     * Generates a vector embedding for the given text.
     * @param text The text to embed
     */
    generateEmbedding(text: string): Promise<number[]>;
}
