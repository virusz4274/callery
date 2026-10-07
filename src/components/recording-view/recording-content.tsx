"use client";

import { useEffect, useLayoutEffect, useMemo, useRef, useState, type ReactNode } from 'react';
import type { Recording } from '@/lib/types';
import { Button, Avatar, Accordion, Tabs } from '@heroui/react';
import { Loader2, Wand2 } from 'lucide-react';
import { RecordingProviderBadge } from './recording-provider-badge';
import { SummaryContent } from './summary-content';
import { useIsMobile } from '@/hooks/use-mobile';
import type { TranscriptionProviderId } from '@/services/transcription/factory';

type RecordingContentProps = {
  recording: Recording;
  playbackUrl: string | null;
  autoPlay?: boolean;
  isLoadingUrl?: boolean;
  onTranscribe?: () => void;
  isProcessing?: boolean;
  activeTranscriptionProvider?: TranscriptionProviderId | null;
  clipStartSeconds?: number;
  clipEndSeconds?: number;
  isClipAudioRestricted?: boolean;
  workspace?: boolean;
  mobilePanel?: ReactNode;
  mobilePanelActive?: boolean;
};

export function RecordingContent({
  recording,
  playbackUrl,
  autoPlay = false,
  isLoadingUrl = false,
  onTranscribe,
  isProcessing = false,
  activeTranscriptionProvider = null,
  clipStartSeconds,
  clipEndSeconds,
  isClipAudioRestricted = false,
  workspace = false,
  mobilePanel,
  mobilePanelActive = false,
}: RecordingContentProps) {
  const [showTransliteration, setShowTransliteration] = useState(false);
  const isMobile = useIsMobile();
  const [tab, setTab] = useState<'transcript' | 'summary'>('transcript');
  const contentRef = useRef<HTMLDivElement>(null);
  const scrollPositions = useRef({ transcript: 0, summary: 0 });
  useLayoutEffect(() => {
    const content = contentRef.current;
    if (content) content.scrollTop = scrollPositions.current[tab];
  }, [tab]);
  const audioRef = useRef<HTMLAudioElement | null>(null);
  const [playbackNeedsGesture, setPlaybackNeedsGesture] = useState(false);
  useEffect(() => {
    if (!autoPlay || !playbackUrl) return;
    let active = true;
    audioRef.current?.play().catch(() => { if (active) setPlaybackNeedsGesture(true); });
    return () => { active = false; };
  }, [autoPlay, playbackUrl]);

  const formatDuration = (seconds: number) => {
    const whole = Math.max(0, Math.floor(seconds));
    return `${Math.floor(whole / 60)}:${String(whole % 60).padStart(2, '0')}`;
  };

  const visibleTranscript = useMemo(() => {
    if (!recording.fullTranscript || recording.fullTranscript.length === 0) {
      return recording.fullTranscript;
    }

    if (typeof clipStartSeconds !== 'number' && typeof clipEndSeconds !== 'number') {
      return recording.fullTranscript;
    }

    const startBoundary = typeof clipStartSeconds === 'number' ? clipStartSeconds : 0;
    const endBoundary = typeof clipEndSeconds === 'number' ? clipEndSeconds : Number.POSITIVE_INFINITY;

    const filtered = recording.fullTranscript.filter((segment) => {
      const segmentStart = segment.start ?? 0;
      const segmentEnd = segment.end ?? segmentStart;
      return segmentEnd >= startBoundary && segmentStart <= endBoundary;
    });

    return filtered;
  }, [clipEndSeconds, clipStartSeconds, recording.fullTranscript]);
  const hasTranscript = Boolean(visibleTranscript && visibleTranscript.length > 0);
  const transcribeButtonLabel = hasTranscript ? 'Transcribe again' : 'Transcribe';

  useEffect(() => {
    const audio = audioRef.current;
    if (!audio) {
      return;
    }

    const handleLoadedMetadata = () => {
      if (typeof clipStartSeconds === 'number' && Number.isFinite(clipStartSeconds)) {
        audio.currentTime = Math.max(0, clipStartSeconds);
      }
    };

    const handleTimeUpdate = () => {
      if (typeof clipEndSeconds !== 'number' || !Number.isFinite(clipEndSeconds)) {
        return;
      }

      if (audio.currentTime >= clipEndSeconds) {
        audio.pause();
      }
    };

    audio.addEventListener('loadedmetadata', handleLoadedMetadata);
    audio.addEventListener('timeupdate', handleTimeUpdate);

    return () => {
      audio.pause();
      audio.removeEventListener('loadedmetadata', handleLoadedMetadata);
      audio.removeEventListener('timeupdate', handleTimeUpdate);
    };
  }, [clipEndSeconds, clipStartSeconds, playbackUrl]);

  const speakers = Array.from(new Set(recording.fullTranscript?.map(segment => segment.speakerId).filter(Boolean)));
  const speakerColors = ['bg-primary/20 text-primary', 'bg-secondary/20 text-secondary', 'bg-success/20 text-success', 'bg-warning/20 text-warning', 'bg-danger/20 text-danger'];
  const changeTab = (next: 'transcript' | 'summary') => {
    if (contentRef.current) scrollPositions.current[tab] = contentRef.current.scrollTop;
    setTab(next);
  };

  const transcriptContent = (
          <div>
            <div className="mb-4 flex flex-wrap items-center justify-between gap-2">
              <div className="flex flex-wrap items-center gap-2">
                <h3 className={`text-lg font-bold ${isMobile && recording.summary ? 'sr-only' : ''}`}>Transcript</h3>
                <RecordingProviderBadge recording={recording} />
              </div>
              {onTranscribe && <Button variant={hasTranscript ? 'ghost' : 'primary'} className="min-h-11 md:min-h-8" size="sm"
                isPending={isProcessing} isDisabled={isProcessing} onPress={onTranscribe}>
                {!isProcessing && <Wand2 className="size-4" />}
                {isProcessing ? (activeTranscriptionProvider === 'elevenlabs' ? 'Transcribing Premium…' : 'Transcribing…') : transcribeButtonLabel}
              </Button>}
            </div>
            {visibleTranscript?.some(segment => segment.transliteratedText) && (
              <div role="group" aria-label="Transcript script" className="mb-4 flex w-full gap-2 rounded-lg bg-surface-secondary p-1 md:ml-auto md:w-fit">
                <Button size="sm" className="min-h-11 flex-1 md:min-h-8" variant={!showTransliteration ? 'secondary' : 'ghost'} aria-pressed={!showTransliteration} onPress={() => setShowTransliteration(false)}>Original</Button>
                <Button size="sm" className="min-h-11 flex-1 md:min-h-8" variant={showTransliteration ? 'secondary' : 'ghost'} aria-pressed={showTransliteration} onPress={() => setShowTransliteration(true)}>Transliteration</Button>
              </div>
            )}
            <div className={`${workspace ? '' : 'md:max-h-[50vh] md:overflow-y-auto'} md:rounded-xl md:border md:border-border md:bg-surface-secondary md:p-4`} data-testid="transcript-content">
              {hasTranscript ? <div className="space-y-5 md:space-y-4">
                {visibleTranscript!.map((segment, index) => {
                  const speaker = segment.speakerId ? speakers.indexOf(segment.speakerId) + 1 : 0;
                  return <div key={index} className="flex gap-3">
                    <Avatar aria-hidden="true" className="mt-0.5 size-7 shrink-0 md:size-9"><Avatar.Fallback className={`text-[10px] font-bold md:text-xs ${speaker ? speakerColors[(speaker - 1) % speakerColors.length] : 'bg-surface-secondary text-muted'}`}>{speaker ? `S${speaker}` : '?'}</Avatar.Fallback></Avatar>
                    <div className="min-w-0 flex-1">
                      <div className="mb-1 flex items-center gap-2 text-xs text-muted">
                        <span className="font-semibold text-foreground">{speaker ? `Speaker ${speaker}` : 'Unknown speaker'}</span>
                        <span className="font-mono">{formatDuration(segment.start ?? 0)}</span>
                      </div>
                      <p className="break-words text-base leading-7 text-foreground md:text-sm md:leading-relaxed">{showTransliteration ? (segment.transliteratedText || segment.text) : segment.text}</p>
                    </div>
                  </div>;
                })}
              </div> : <div className="flex min-h-40 flex-col items-center justify-center gap-4 text-muted" role="status">
                {isProcessing && <Loader2 className="size-6 animate-spin motion-reduce:animate-none" />}
                <p>{isProcessing ? 'Generating transcript…' : recording.transcriptionStatus === 'failed' ? 'Transcription failed. You can try again.' : 'No transcript available'}</p>
              </div>}
            </div>
          </div>
  );
  const clipNotice = (typeof clipStartSeconds === 'number' || typeof clipEndSeconds === 'number') && (
    <p className="rounded-lg border border-accent/30 bg-accent/10 p-3 text-sm text-accent">
      Sharing clip{typeof clipStartSeconds === 'number' ? ` from ${formatDuration(clipStartSeconds)}` : ''}{typeof clipEndSeconds === 'number' ? ` to ${formatDuration(clipEndSeconds)}` : ''}.
    </p>
  );
  return (
    <div className={workspace ? 'flex h-full min-h-0 flex-col md:gap-4' : 'flex flex-col gap-4'}>
      <div data-testid="recording-audio" className={`order-last shrink-0 border-t border-border bg-background px-4 pt-2 pb-[max(0.75rem,env(safe-area-inset-bottom))] md:order-first md:rounded-xl md:border md:bg-default-50 md:p-2 ${workspace ? '' : 'sticky bottom-0 z-10'}`}>
        {isLoadingUrl ? (
          <div className="flex min-h-11 items-center justify-center gap-2 text-muted" role="status">
            <Loader2 className="size-4 animate-spin motion-reduce:animate-none" />Loading audio…
          </div>
        ) : playbackUrl ? (
          <audio controls aria-label="Recording audio" className="h-11 w-full" key={recording.id} ref={audioRef} onPlay={() => setPlaybackNeedsGesture(false)}>
            <source src={playbackUrl} type={recording.mimeType || 'audio/mpeg'} />Your browser does not support the audio element.
          </audio>
        ) : (
          <p className="py-3 text-sm text-danger">{isClipAudioRestricted ? 'Audio playback is disabled for clipped shares.' : 'Audio unavailable'}</p>
        )}
        {playbackNeedsGesture && <p className="px-2 text-xs text-muted" role="status">Press play in the audio controls to start playback.</p>}
      </div>

      {isMobile && mobilePanelActive && <div className="min-h-0 flex-1 overflow-y-auto overscroll-contain p-4" data-testid="recording-subview">{mobilePanel}</div>}
      <div hidden={isMobile && mobilePanelActive} className={`${workspace ? 'min-h-0 flex-1 flex flex-col' : ''} ${isMobile && mobilePanelActive ? '!hidden' : ''}`}>
        {isMobile && recording.summary ? (
          <Tabs selectedKey={tab} onSelectionChange={key => changeTab(key as 'transcript' | 'summary')} className="flex min-h-0 flex-1 flex-col">
            <Tabs.ListContainer className="shrink-0 px-4 py-2">
              <Tabs.List aria-label="Recording content" className="w-full">
                <Tabs.Tab id="transcript" className="min-h-11 flex-1">Transcript<Tabs.Indicator /></Tabs.Tab>
                <Tabs.Tab id="summary" className="min-h-11 flex-1">Summary<Tabs.Indicator /></Tabs.Tab>
              </Tabs.List>
            </Tabs.ListContainer>
            <div ref={contentRef} data-testid="recording-scroll" className={`${workspace ? 'min-h-0 flex-1 overflow-y-auto overscroll-contain' : ''} space-y-4 px-4 py-4`}>
              {clipNotice}
              <Tabs.Panel id="transcript">{transcriptContent}</Tabs.Panel>
              <Tabs.Panel id="summary"><SummaryContent text={recording.summary} /></Tabs.Panel>
            </div>
          </Tabs>
        ) : (
          <div ref={contentRef} data-testid="recording-scroll" className={`${workspace ? 'min-h-0 flex-1 overflow-y-auto overscroll-contain' : ''} space-y-4 px-4 py-4 md:p-0`}>
            {clipNotice}
            {recording.summary && <Accordion hideSeparator>
              <Accordion.Item id="summary">
                <Accordion.Heading><Accordion.Trigger>
                  <span className="flex items-center gap-2 text-sm font-semibold"><Wand2 className="size-4" />AI Summary</span><Accordion.Indicator />
                </Accordion.Trigger></Accordion.Heading>
                <Accordion.Panel><Accordion.Body className="text-sm"><SummaryContent text={recording.summary} /></Accordion.Body></Accordion.Panel>
              </Accordion.Item>
            </Accordion>}
            {transcriptContent}
          </div>
        )}
      </div>
    </div>
  );
}
