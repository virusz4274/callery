import type { RecordingResponse, TranscriptionSegment } from './db/types';

/** The content viewer needs no account, storage, or ingestion identifiers. */
export type RecordingContentData = Pick<RecordingResponse,
    'id' | 'mimeType' | 'transcriptionStatus' | 'transcriptionProvider' | 'transcriptionModel' | 'summary' | 'processingStatus' | 'processingProgress'
> & {
    fullTranscript?: Pick<TranscriptionSegment,
        'speakerId' | 'text' | 'start' | 'end' | 'transliteratedText'
    >[];
};
