import { ObjectId } from 'mongodb';

export interface TranscriptionWord {
    text: string;
    start?: number;  // in seconds
    end?: number;    // in seconds
    speakerId?: string;
    confidence?: number;  // Soniox confidence score (0-1)
}

export interface TranscriptionSegment {
    speakerId: string;
    text: string;
    start?: number;
    end?: number;
    words: TranscriptionWord[];
    transliteratedText?: string;
}

/**
 * Recording document stored in MongoDB.
 */
export interface Recording {
    _id: ObjectId;
    firebaseUid: string;
    contactId: ObjectId | null;
    contactName: string | null;
    phoneNumber: string;
    normalizedPhoneNumber: string;

    // File metadata
    r2Key: string;
    fileName: string;
    fileSize: number;
    mimeType: string;
    duration: number;

    // Additional file metadata (new)

    standardizedDisplayName: string;

    // Timestamps
    recordedAt: Date;
    createdAt: Date;
    updatedAt: Date;

    // Transcription
    transcriptionStatus: 'pending' | 'processing' | 'completed' | 'failed';
    fullTranscript?: TranscriptionSegment[]; // Structured transcript with diarization
    languageCode?: string; // e.g. 'mal', 'eng'

    // Transcription Metadata
    transcriptionProvider?: 'soniox' | 'elevenlabs';
    transcriptionModel?: string;
    transcriptionCostMultiplier?: number;
    externalTranscriptionId?: string; // For webhook correlation with external providers
    transcriptionUsageReportId?: string;
    transcriptionUsageReportedAt?: Date;


    // Future-proof fields for translations/transliterations
    transliteratedTranscript?: string; // e.g., Manglish
    translatedTranscript?: string; // e.g., English translation
    additionalTranscriptions?: Record<string, string>; // Flexible bucket for other variations

    // Summary & Embeddings
    summary?: string; // English summary for search
    summaryEmbedding?: number[]; // Vector embedding of the summary
    // Metadata
    tags: string[];
    isStarred: boolean;
    isArchived: boolean;
}

export type CreateRecordingInput = Omit<Recording, '_id' | 'createdAt' | 'updatedAt' | 'normalizedPhoneNumber'>;
export type UpdateRecordingInput = Partial<Omit<Recording, '_id' | 'firebaseUid' | 'createdAt'>>;

export interface RecordingResponse {
    id: string;
    firebaseUid: string;
    contactId: string | null;
    contactName: string | null;
    phoneNumber: string;
    r2Key: string;
    fileName: string;
    standardizedDisplayName: string;
    fileSize: number;
    mimeType: string;
    duration: number;
    recordedAt: string;
    createdAt: string;
    updatedAt: string;
    transcriptionStatus: 'pending' | 'processing' | 'completed' | 'failed';
    fullTranscript?: TranscriptionSegment[];
    languageCode?: string;
    transcriptionProvider?: 'soniox' | 'elevenlabs';
    transcriptionModel?: string;
    transcriptionCostMultiplier?: number;
    summary?: string;
    tags: string[];
    isStarred: boolean;
    isArchived: boolean;
    /** Signed URL for playback (generated on request) */
    playbackUrl?: string;
}
