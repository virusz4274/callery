import { TranscriptionSegment, TranscriptionWord } from '@/lib/db/types';
import { ElevenLabsClient, ElevenLabs } from '@elevenlabs/elevenlabs-js';

const client = new ElevenLabsClient({
    apiKey: process.env.ELEVENLABS_API_KEY,
});

/**
 * Response from transcribeAudio function.
 */
export interface TranscriptionResult {
    text: string;
    languageCode: string;
    segments: TranscriptionSegment[];
    transcriptionId: string;
}

/**
 * Transcribe audio using ElevenLabs Scribe API with diarization.
 * @param fileUrl URL of the audio file to transcribe (must be accessible by ElevenLabs, e.g., Presigned URL)
 */
export async function transcribeAudio(fileUrl: string): Promise<TranscriptionResult> {
    if (!process.env.ELEVENLABS_API_KEY) {
        throw new Error('ELEVENLABS_API_KEY is not defined');
    }

    try {
        const response = await client.speechToText.convert({
            modelId: process.env.ELEVENLABS_MODEL_ID || 'scribe_v2',
            diarize: true,
            cloudStorageUrl: fileUrl,
        });

        // Log for debugging (remove in production)
        console.log('[ElevenLabs] Transcription response type:', typeof response);
        console.log('[ElevenLabs] Response keys:', Object.keys(response));

        // The SDK uses camelCase property names
        const result = response as ElevenLabs.SpeechToTextChunkResponseModel;

        // Process the response into segments
        const segments = processWordsIntoSegments(result.words || []);

        return {
            text: result.text || '',
            languageCode: result.languageCode || 'unknown',
            segments,
            transcriptionId: result.transcriptionId || '',
        };
    } catch (error) {
        console.error('ElevenLabs Transcription Error:', error);
        throw error;
    }
}

/**
 * Delete a transcription from ElevenLabs.
 * Should be called after saving the data to MongoDB.
 */
export async function deleteTranscript(transcriptionId: string): Promise<void> {
    if (!transcriptionId) {
        console.warn('[ElevenLabs] No transcription ID provided for deletion');
        return;
    }

    try {
        await client.speechToText.transcripts.delete(transcriptionId);
    } catch (error: unknown) {
        // Handle 404 gracefully - transcript may already be deleted
        if (error && typeof error === 'object' && 'statusCode' in error && error.statusCode === 404) {
            console.warn(`[ElevenLabs] Transcript ${transcriptionId} not found (already deleted?)`);
            return;
        }
        console.error('[ElevenLabs] Failed to delete transcript:', error);
        throw error;
    }
}

/**
 * Format speaker ID for display.
 * Converts "speaker_0" to "Speaker 0" or "Speaker 0" to "Speaker 0" (idempotent).
 */
function formatSpeakerId(speakerId: string | undefined | null): string {
    if (!speakerId) return 'Unknown';

    // Already in display format?
    if (/^Speaker \d+$/i.test(speakerId)) {
        return speakerId;
    }

    // Handle "speaker_0" format -> "Speaker 0"
    const match = speakerId.match(/^speaker_(\d+)$/i);
    if (match) {
        return `Speaker ${match[1]}`;
    }

    // Return as-is if unknown format
    return speakerId;
}

/**
 * Group words into segments by speaker.
 * Maps SDK word format (camelCase) to our storage format.
 */
function processWordsIntoSegments(
    words: ElevenLabs.SpeechToTextWordResponseModel[]
): TranscriptionSegment[] {
    const segments: TranscriptionSegment[] = [];
    if (!words || words.length === 0) return segments;

    let currentSegment: TranscriptionSegment | null = null;
    let currentSpeakerId: string | null = null;

    for (const word of words) {
        const wordSpeakerId = word.speakerId || null;

        // Start new segment when speaker changes
        if (!currentSegment || wordSpeakerId !== currentSpeakerId) {
            if (currentSegment) {
                segments.push(currentSegment);
            }
            currentSpeakerId = wordSpeakerId;
            currentSegment = {
                speakerId: formatSpeakerId(wordSpeakerId),
                text: '',
                start: word.start ?? 0,
                end: word.end ?? 0,
                words: [],
            };
        }

        // Map SDK word to our TranscriptionWord format
        const mappedWord: TranscriptionWord = {
            text: word.text,
            start: word.start,
            end: word.end,
            type: word.type as 'word' | 'spacing' | 'audio_event',
            speakerId: word.speakerId,
            logprob: word.logprob,
        };

        // Add word to current segment
        currentSegment.words.push(mappedWord);
        currentSegment.text += word.text;
        currentSegment.end = word.end ?? currentSegment.end;
    }

    // Push final segment
    if (currentSegment) {
        segments.push(currentSegment);
    }

    return segments;
}
