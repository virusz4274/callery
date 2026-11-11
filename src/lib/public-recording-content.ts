import 'server-only';
import type { Recording } from './db/types';
import type { RecordingContentData } from './recording-content-types';

type RecordingSource = Pick<Recording,
    '_id' | 'mimeType' | 'transcriptionStatus' | 'transcriptionProvider' |
    'transcriptionModel' | 'fullTranscript' | 'summary'
>;

/** Full shares expose content, never storage, identity, ingestion, or billing metadata. */
export function toPublicRecordingContent(recording: RecordingSource): RecordingContentData {
    return {
        id: recording._id.toString(), mimeType: recording.mimeType,
        transcriptionStatus: recording.transcriptionStatus,
        transcriptionProvider: recording.transcriptionProvider, transcriptionModel: recording.transcriptionModel,
        summary: recording.summary,
        fullTranscript: recording.fullTranscript?.map(segment => ({
            speakerId: segment.speakerId, text: segment.text, start: segment.start, end: segment.end,
            transliteratedText: segment.transliteratedText,
        })),
    };
}
