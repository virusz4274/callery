import { TranscriptionSegment } from '@/lib/db/types';




import { ElevenLabsClient } from '@elevenlabs/elevenlabs-js';

const client = new ElevenLabsClient({
    apiKey: process.env.ELEVENLABS_API_KEY,
});

/**
 * Transcribe audio using ElevenLabs Scribe API.
 * @param fileUrl URL of the audio file to transcribe (must be accessible by ElevenLabs, e.g., Presigned URL)
 */
export async function transcribeAudio(fileUrl: string): Promise<{
    text: string;
    languageCode: string;
    segments: TranscriptionSegment[];
    transcriptionId: string;
}> {
    if (!process.env.ELEVENLABS_API_KEY) {
        throw new Error('ELEVENLABS_API_KEY is not defined');
    }

    try {
        // The SDK might expect 'file' as a Blob/Stream usually.
        // But the user instructed to use 'cloud_storage_url'.
        // We might need to cast to 'any' if the SDK types are strict about 'file'.
        const response = await client.speechToText.convert({
            modelId: process.env.ELEVENLABS_MODEL_ID || 'scribe_v2',
            diarize: true,
            cloudStorageUrl: fileUrl,
        });

        // Map SDK response to our format
        // The SDK response structure usually matches the API JSON response.
        const result = response as any;

        // Process the response into segments
        const segments = processWordsIntoSegments(result.words || []);

        return {
            text: result.text,
            languageCode: result.language_code,
            segments,
            transcriptionId: result.transcription_id,
        };
    } catch (error) {
        console.error('ElevenLabs Transcription Error:', error);
        throw error;
    }
}

type ElevenLabsWord = {
    text: string;
    start: number;
    end: number;
    type: 'word' | 'spacing';
    speaker_id: string;
    logprob: number;
};

/**
 * Delete a transcription from ElevenLabs.
 * Should be called after saving the data to MongoDB.
 */
export async function deleteTranscript(transcriptionId: string): Promise<void> {
    const apiKey = process.env.ELEVENLABS_API_KEY;
    if (!apiKey) {
        throw new Error('ELEVENLABS_API_KEY is not defined');
    }

    const baseUrl = process.env.ELEVENLABS_API_URL || 'https://api.elevenlabs.io/v1/speech-to-text';
    const response = await fetch(`${baseUrl}/transcripts/${transcriptionId}`, {
        method: 'DELETE',
        headers: {
            'xi-api-key': apiKey,
        },
    });

    if (!response.ok) {
        if (response.status === 404) {
            console.warn(`[ElevenLabs] Transcript ${transcriptionId} not found during deletion (already deleted?)`);
            return;
        }
        const errorText = await response.text();
        throw new Error(`Failed to delete transcript: ${response.status} ${errorText}`);
    }
}

/**
 * Group words into segments by speaker.
 */
function processWordsIntoSegments(words: ElevenLabsWord[]): TranscriptionSegment[] {
    const segments: TranscriptionSegment[] = [];
    if (words.length === 0) return segments;

    let currentSegment: TranscriptionSegment | null = null;

    for (const word of words) {
        if (!currentSegment || word.speaker_id !== currentSegment.speakerId) {
            if (currentSegment) {
                segments.push(currentSegment);
            }
            currentSegment = {
                speakerId: word.speaker_id,
                text: '',
                start: word.start,
                end: word.end, // Will update
                words: [],
            };
        }

        // Add word to current segment
        currentSegment.words.push(word);
        currentSegment.text += word.text;
        currentSegment.end = word.end; // Extend segment end time
    }

    if (currentSegment) {
        segments.push(currentSegment);
    }

    return segments;
}
