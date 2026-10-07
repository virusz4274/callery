import type { Recording } from '@/lib/types';
import { Chip } from '@heroui/react';

type RecordingProviderBadgeProps = {
    recording: Recording;
};

export function RecordingProviderBadge({ recording }: RecordingProviderBadgeProps) {
    // Older Gemini recordings can identify their provider through the saved model.
    // The user's current default cannot tell us which provider made this transcript.
    const model = recording.transcriptionModel?.replace(/^models\//, '');
    const provider = recording.transcriptionProvider || (model?.startsWith('gemini-') ? 'gemini' : undefined);
    const labels = { soniox: 'Soniox', elevenlabs: 'ElevenLabs', gemini: 'Gemini', openai_compat: 'Local or compatible server' };
    if (!provider || !labels[provider]) return null;
    return <Chip variant="soft" color="accent" size="sm" aria-label={`Transcription provider: ${labels[provider]}`}>{labels[provider]}</Chip>;
}
