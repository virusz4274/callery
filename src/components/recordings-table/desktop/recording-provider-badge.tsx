import React from 'react';
import type { Recording } from '@/lib/types';

type RecordingProviderBadgeProps = {
    recording: Recording;
};

export function RecordingProviderBadge({ recording }: RecordingProviderBadgeProps) {
    if (!recording.transcriptionProvider && !recording.transcriptionModel) {
        return null;
    }

    if (recording.transcriptionProvider === 'elevenlabs') {
        return (
            <div className="flex items-center gap-1">
                <div className="px-1.5 py-0.5 rounded-full bg-purple-500/10 text-purple-600 text-[9px] font-bold border border-purple-200 uppercase tracking-wider">
                    ElevenLabs
                </div>
                {recording.transcriptionCostMultiplier && recording.transcriptionCostMultiplier > 1 && (
                    <div className="px-1 py-0.5 rounded bg-amber-500/10 text-amber-600 text-[9px] font-bold border border-amber-200">
                        {recording.transcriptionCostMultiplier}x
                    </div>
                )}
            </div>
        );
    }

    if (recording.transcriptionProvider === 'soniox') {
        return (
            <div className="px-1.5 py-0.5 rounded-full bg-blue-500/10 text-blue-600 text-[9px] font-bold border border-blue-200 uppercase tracking-wider">
                Soniox
            </div>
        );
    }

    return null;
}
