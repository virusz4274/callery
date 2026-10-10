export const INTEGRATION_SCOPES = ['recordings:upload', 'recordings:read', 'recordings:download', 'recordings:transcribe', 'company:recordings:read', 'company:recordings:download'] as const;
export const SCOPE_LABELS: Record<typeof INTEGRATION_SCOPES[number], string> = {
    'recordings:upload': 'Upload recordings', 'recordings:read': 'Read recordings and transcripts', 'recordings:download': 'Play and download audio', 'recordings:transcribe': 'Request transcription', 'company:recordings:read': 'Read the company archive', 'company:recordings:download': 'Play and download company audio',
};
