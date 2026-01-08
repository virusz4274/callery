import { TranscriptionSegment } from './db/types';


const ELEVENLABS_API_KEY = process.env.ELEVENLABS_API_KEY;

type ElevenLabsWord = {
    text: string;
    start: number;
    end: number;
    type: 'word' | 'spacing';
    speaker_id: string;
    logprob: number;
};

type ElevenLabsResponse = {
    language_code: string;
    language_probability: number;
    text: string;
    words: ElevenLabsWord[];
    transcription_id: string;
};

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
    if (!ELEVENLABS_API_KEY) {
        throw new Error('ELEVENLABS_API_KEY is not defined');
    }

    const formData = new FormData();
    formData.append('model_id', process.env.ELEVENLABS_MODEL_ID || 'scribe_v2');
    formData.append('cloud_storage_url', fileUrl); // Use URL instead of file upload
    formData.append('diarize', 'true');

    const response = await fetch(process.env.ELEVENLABS_API_URL || 'https://api.elevenlabs.io/v1/speech-to-text', {
        method: 'POST',
        headers: {
            'xi-api-key': ELEVENLABS_API_KEY,
        },
        body: formData,
    });

    if (!response.ok) {
        const errorText = await response.text();
        throw new Error(`ElevenLabs API error: ${response.status} ${errorText}`);
    }

    const result = (await response.json()) as ElevenLabsResponse;

    // Process the response into segments
    const segments = processWordsIntoSegments(result.words);

    return {
        text: result.text,
        languageCode: result.language_code,
        segments,
        transcriptionId: result.transcription_id,
    };
}

/**
 * Delete a transcription from ElevenLabs.
 * Should be called after saving the data to MongoDB.
 */
export async function deleteTranscript(transcriptionId: string): Promise<void> {
    if (!ELEVENLABS_API_KEY) {
        throw new Error('ELEVENLABS_API_KEY is not defined');
    }

    const baseUrl = process.env.ELEVENLABS_API_URL || 'https://api.elevenlabs.io/v1/speech-to-text';
    const response = await fetch(`${baseUrl}/transcripts/${transcriptionId}`, {
        method: 'DELETE',
        headers: {
            'xi-api-key': ELEVENLABS_API_KEY,
        },
    });

    if (!response.ok) {
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
