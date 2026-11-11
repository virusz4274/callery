'use client';

import { useCallback, useEffect, useRef, useState } from 'react';
import { activeTranscriptSegment, readPlaybackPosition, savePlaybackPosition, validPlaybackTime, type TimedTranscriptSegment, type TranscriptTarget } from '@/lib/transcript-navigation';

export function useTranscriptPlayback({ recordingId, segments, playbackUrl, owner, autoPlay, target }: {
    recordingId: string; segments: TimedTranscriptSegment[]; playbackUrl: string | null;
    owner?: string; autoPlay: boolean; target?: TranscriptTarget;
}) {
    const audioRef = useRef<HTMLAudioElement>(null);
    const [activeIndex, setActiveIndex] = useState(-1);
    const [needsGesture, setNeedsGesture] = useState(false);
    const restored = useRef<{ audio: HTMLAudioElement; mediaKey: string; targetKey: string } | null>(null);
    const lastSaved = useRef(0);
    const targetStart = target?.segmentIndex !== undefined ? validPlaybackTime(segments[target.segmentIndex]?.start) ?? validPlaybackTime(target.start) : validPlaybackTime(target?.start);
    const mediaKey = JSON.stringify([owner ?? null, recordingId]);
    const targetKey = JSON.stringify([target?.segmentIndex ?? null, targetStart ?? null, target?.transcriptRevision ?? null]);
    const hasPlaybackUrl = Boolean(playbackUrl);

    const updateTime = useCallback(() => {
        const audio = audioRef.current;
        if (!audio) return;
        setActiveIndex(activeTranscriptSegment(segments, audio.currentTime, audio.duration));
        if (Math.abs(audio.currentTime - lastSaved.current) >= 5) {
            savePlaybackPosition(owner, recordingId, audio.currentTime);
            lastSaved.current = audio.currentTime;
        }
    }, [owner, recordingId, segments]);
    const restore = useCallback(() => {
        const audio = audioRef.current;
        if (!audio) return;
        const previous = restored.current;
        const newMedia = previous?.audio !== audio || previous.mediaKey !== mediaKey;
        if (!newMedia && previous.targetKey === targetKey) return;
        restored.current = { audio, mediaKey, targetKey };
        // A signed URL is a transport detail. Polling must not reapply history or
        // the initial passage target, or interrupt a user who is already listening.
        if (newMedia || targetStart !== undefined) {
            const position = targetStart ?? readPlaybackPosition(owner, recordingId);
            audio.currentTime = Number.isFinite(audio.duration) ? Math.min(position, Math.max(0, audio.duration - 0.1)) : position;
            lastSaved.current = audio.currentTime;
        }
        updateTime();
        if (newMedia && autoPlay) void audio.play().catch(() => setNeedsGesture(true));
    }, [autoPlay, mediaKey, owner, recordingId, targetKey, targetStart, updateTime]);
    useEffect(() => {
        const audio = audioRef.current;
        if (!audio) return;
        const remember = () => savePlaybackPosition(owner, recordingId, audio.ended ? 0 : audio.currentTime);
        window.addEventListener('pagehide', remember);
        return () => {
            remember();
            audio.pause();
            window.removeEventListener('pagehide', remember);
        };
    }, [owner, recordingId, hasPlaybackUrl]);
    useEffect(() => {
        if (audioRef.current && audioRef.current.readyState >= 1) restore();
    }, [hasPlaybackUrl, restore]);

    return {
        audioRef, activeIndex, needsGesture, restore, updateTime,
        onPlay: () => setNeedsGesture(false),
        remember: () => { const audio = audioRef.current; if (audio) savePlaybackPosition(owner, recordingId, audio.ended ? 0 : audio.currentTime); },
        seek: (time: number) => {
            const audio = audioRef.current;
            if (!audio || validPlaybackTime(time) === undefined) return;
            audio.currentTime = Number.isFinite(audio.duration) ? Math.min(time, audio.duration) : time;
            updateTime();
        },
    };
}
