"use client";

import { useEffect, useLayoutEffect, useMemo, useRef, useState, type ReactNode } from 'react';
import type { RecordingContentData } from '@/lib/recording-content-types';
import { Button, Avatar, Accordion, Tabs } from '@heroui/react';
import { ChevronDown, ChevronUp, Loader2, Search, Wand2, X } from 'lucide-react';
import { RecordingProviderBadge } from './recording-provider-badge';
import { SummaryContent } from './summary-content';
import { useIsMobile } from '@/hooks/use-mobile';
import type { TranscriptionProviderId } from '@/services/transcription/factory';
import { enrichmentNeedsResume } from '@/lib/transcription/processing-errors';
import { useTranscriptPlayback } from '@/hooks/use-transcript-playback';
import { findTranscriptMatches, validPlaybackTime, type TranscriptMatch, type TranscriptTarget } from '@/lib/transcript-navigation';
import { TranscriptExportActions } from './transcript-export-actions';

type RecordingContentProps = {
  recording: RecordingContentData;
  playbackUrl: string | null;
  autoPlay?: boolean;
  isLoadingUrl?: boolean;
  onTranscribe?: () => void;
  isProcessing?: boolean;
  activeTranscriptionProvider?: TranscriptionProviderId | null;
  playbackOwnerId?: string;
  initialTarget?: TranscriptTarget;
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
  playbackOwnerId,
  initialTarget,
  workspace = false,
  mobilePanel,
  mobilePanelActive = false,
}: RecordingContentProps) {
  const [showTransliteration, setShowTransliteration] = useState(false);
  const [findQuery, setFindQuery] = useState('');
  const [selectedMatch, setSelectedMatch] = useState(0);
  const isMobile = useIsMobile();
  const [tab, setTab] = useState<'transcript' | 'summary'>('transcript');
  const contentRef = useRef<HTMLDivElement>(null);
  const scrollPositions = useRef({ transcript: 0, summary: 0 });
  useLayoutEffect(() => {
    const content = contentRef.current;
    if (content) content.scrollTop = scrollPositions.current[tab];
  }, [tab]);
  const segmentRefs = useRef(new Map<number, HTMLDivElement>());

  const formatDuration = (seconds: number) => {
    const whole = Math.max(0, Math.floor(seconds));
    return `${Math.floor(whole / 60)}:${String(whole % 60).padStart(2, '0')}`;
  };

  // Public shares arrive with their permitted transcript already projected on the server.
  const visibleTranscript = useMemo(() => recording.fullTranscript || [], [recording.fullTranscript]);
  const { audioRef, activeIndex, needsGesture, restore, updateTime, remember, seek, onPlay } = useTranscriptPlayback({ recordingId: recording.id, segments: visibleTranscript, playbackUrl,
    owner: playbackOwnerId, autoPlay, target: initialTarget });
  const matches = useMemo(() => findTranscriptMatches(visibleTranscript, findQuery, showTransliteration), [visibleTranscript, findQuery, showTransliteration]);
  const matchIndex = matches.length ? Math.min(selectedMatch, matches.length - 1) : -1;
  const matchesBySegment = useMemo(() => {
    const grouped = new Map<number, TranscriptMatch[]>();
    for (const match of matches) {
      const group = grouped.get(match.segmentIndex) || [];
      group.push(match);
      grouped.set(match.segmentIndex, group);
    }
    return grouped;
  }, [matches]);
  const hasTranscript = Boolean(visibleTranscript && visibleTranscript.length > 0);
  const needsEnrichment = recording.processingProgress?.transcriptAvailable && !['not_started', 'completed'].includes(recording.processingProgress.enrichmentState);
  const queued = ['queued', 'enrichment_queued'].includes(recording.processingStatus?.code || '');
  const transcribeButtonLabel = enrichmentNeedsResume(recording.processingStatus) ? 'Resume enrichment' : hasTranscript ? 'Transcribe again' : 'Transcribe';

  useEffect(() => {
    if (initialTarget?.segmentIndex === undefined) return;
    const index = initialTarget.segmentIndex;
    const frame = requestAnimationFrame(() => segmentRefs.current.get(index)?.scrollIntoView({ block: 'nearest' }));
    return () => cancelAnimationFrame(frame);
  }, [initialTarget?.segmentIndex, visibleTranscript.length]);

  const moveToMatch = (direction: number) => {
    if (!matches.length) return;
    const next = (Math.max(0, matchIndex) + direction + matches.length) % matches.length;
    setSelectedMatch(next);
    changeTab('transcript');
    requestAnimationFrame(() => {
      const segment = segmentRefs.current.get(matches[next].segmentIndex);
      (segment?.querySelector('[data-current-match="true"]') || segment)?.scrollIntoView({ block: 'nearest' });
    });
  };

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
                {isProcessing ? (queued ? 'Queued…' : needsEnrichment ? 'Enriching transcript…' : activeTranscriptionProvider === 'elevenlabs' ? 'Transcribing Premium…' : 'Transcribing…') : transcribeButtonLabel}
              </Button>}
            </div>
            {needsEnrichment && <p role="status" className="mb-4 text-sm text-muted">
              Transcript saved. {recording.processingProgress?.enrichmentState === 'running' ? 'AI enrichment is processing.' : recording.processingProgress?.enrichmentState === 'pending' ? 'AI enrichment is queued.' : 'AI enrichment needs attention; the saved transcript remains available.'}
            </p>}
            {hasTranscript && <div className="mb-4 flex flex-wrap items-center gap-2" role="search" aria-label="Find in transcript">
              <div className="flex min-h-11 min-w-40 flex-1 items-center gap-2 rounded-lg border border-border bg-field px-3">
                <Search className="size-4 shrink-0 text-muted" aria-hidden="true" />
                <input aria-label="Find in transcript" type="search" maxLength={160} value={findQuery}
                  onChange={event => { setFindQuery(event.target.value); setSelectedMatch(0); }}
                  onKeyDown={event => { if (event.key === 'Enter') { event.preventDefault(); moveToMatch(event.shiftKey ? -1 : 1); } }}
                  placeholder="Find in transcript" className="min-w-0 flex-1 bg-transparent py-2 text-base outline-none focus-visible:ring-2 focus-visible:ring-accent md:text-sm" />
                {findQuery && <Button isIconOnly size="sm" variant="ghost" aria-label="Clear transcript search" onPress={() => { setFindQuery(''); setSelectedMatch(0); }}><X className="size-4" /></Button>}
              </div>
              {findQuery.trim() && <>
                <span className="text-xs tabular-nums text-muted" role="status">{matches.length ? `${matchIndex + 1} of ${matches.length}` : 'No matches'}</span>
                <Button isIconOnly size="sm" variant="ghost" className="min-h-11 min-w-11" aria-label="Previous transcript match" isDisabled={!matches.length} onPress={() => moveToMatch(-1)}><ChevronUp className="size-4" /></Button>
                <Button isIconOnly size="sm" variant="ghost" className="min-h-11 min-w-11" aria-label="Next transcript match" isDisabled={!matches.length} onPress={() => moveToMatch(1)}><ChevronDown className="size-4" /></Button>
              </>}
            </div>}
            {visibleTranscript?.some(segment => segment.transliteratedText) && (
              <div role="group" aria-label="Transcript script" className="mb-4 flex w-full gap-2 rounded-lg bg-surface-secondary p-1 md:ml-auto md:w-fit">
                <Button size="sm" className="min-h-11 flex-1 md:min-h-8" variant={!showTransliteration ? 'secondary' : 'ghost'} aria-pressed={!showTransliteration} onPress={() => { setShowTransliteration(false); setSelectedMatch(0); }}>Original</Button>
                <Button size="sm" className="min-h-11 flex-1 md:min-h-8" variant={showTransliteration ? 'secondary' : 'ghost'} aria-pressed={showTransliteration} onPress={() => { setShowTransliteration(true); setSelectedMatch(0); }}>Transliteration</Button>
              </div>
            )}
            {hasTranscript && <TranscriptExportActions key={`${recording.id}:${showTransliteration}`} recordingId={recording.id} segments={visibleTranscript} transliterated={showTransliteration} />}
            <div className={`${workspace ? '' : 'md:max-h-[50vh] md:overflow-y-auto'} md:rounded-xl md:border md:border-border md:bg-surface-secondary md:p-4`} data-testid="transcript-content">
              {hasTranscript ? <div className="space-y-5 md:space-y-4">
                {visibleTranscript!.map((segment, index) => {
                  const speaker = segment.speakerId ? speakers.indexOf(segment.speakerId) + 1 : 0;
                  const start = validPlaybackTime(segment.start);
                  return <div key={index} ref={element => { if (element) segmentRefs.current.set(index, element); else segmentRefs.current.delete(index); }}
                    data-segment-index={index} data-active={activeIndex === index || undefined}
                    className={`flex scroll-mt-4 gap-3 rounded-lg border-l-2 py-1 pl-2 ${activeIndex === index ? 'border-accent bg-accent/10' : 'border-transparent'}`}>
                    <Avatar aria-hidden="true" className="mt-0.5 size-7 shrink-0 md:size-9"><Avatar.Fallback className={`text-[10px] font-bold md:text-xs ${speaker ? speakerColors[(speaker - 1) % speakerColors.length] : 'bg-surface-secondary text-muted'}`}>{speaker ? `S${speaker}` : '?'}</Avatar.Fallback></Avatar>
                    <div className="min-w-0 flex-1">
                      <div className="mb-1 flex items-center gap-2 text-xs text-muted">
                        <span className="font-semibold text-foreground">{speaker ? `Speaker ${speaker}` : 'Unknown speaker'}</span>
                        {start !== undefined ? <button type="button" aria-label={`Seek to ${formatDuration(start)}, ${speaker ? `Speaker ${speaker}` : 'Unknown speaker'}`}
                          disabled={!playbackUrl} onClick={() => seek(start)} className="min-h-11 rounded px-2 font-mono text-accent underline-offset-4 hover:underline focus-visible:outline-2 focus-visible:outline-accent disabled:text-muted md:min-h-8">{formatDuration(start)}</button>
                          : <span className="text-xs text-muted">Time unavailable</span>}
                      </div>
                      <p className="break-words text-base leading-7 text-foreground md:text-sm md:leading-relaxed"><HighlightedTranscriptText
                        text={showTransliteration ? (segment.transliteratedText || segment.text) : segment.text}
                        matches={matchesBySegment.get(index) || []} current={matches[matchIndex]} /></p>
                    </div>
                  </div>;
                })}
              </div> : <div className="flex min-h-40 flex-col items-center justify-center gap-4 text-muted" role="status">
                {isProcessing && <Loader2 className="size-6 animate-spin motion-reduce:animate-none" />}
                <p>{isProcessing ? queued ? 'Waiting in the processing queue…' : 'Generating transcript…' : recording.transcriptionStatus === 'failed' ? 'Transcription failed. You can try again.' : 'No transcript available'}</p>
              </div>}
            </div>
          </div>
  );
  return (
    <div className={workspace ? 'flex h-full min-h-0 flex-col md:gap-4' : 'flex flex-col gap-4'}>
      <div data-testid="recording-audio" className={`order-last shrink-0 border-t border-border bg-background px-4 pt-2 pb-[max(0.75rem,env(safe-area-inset-bottom))] md:order-first md:rounded-xl md:border md:bg-default-50 md:p-2 ${workspace ? '' : 'sticky bottom-0 z-10'}`}>
        {isLoadingUrl ? (
          <div className="flex min-h-11 items-center justify-center gap-2 text-muted" role="status">
            <Loader2 className="size-4 animate-spin motion-reduce:animate-none" />Loading audio…
          </div>
        ) : playbackUrl ? (
          <audio controls aria-label="Recording audio" className="h-11 w-full" key={recording.id} ref={audioRef}
            onLoadedMetadata={restore} onTimeUpdate={updateTime} onPause={remember} onEnded={remember} onPlay={onPlay}>
            <source src={playbackUrl} type={recording.mimeType || 'audio/mpeg'} />Your browser does not support the audio element.
          </audio>
        ) : (
          <p className="py-3 text-sm text-danger">Audio unavailable</p>
        )}
        {needsGesture && <p className="px-2 text-xs text-muted" role="status">Press play in the audio controls to start playback.</p>}
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
              <Tabs.Panel id="transcript">{transcriptContent}</Tabs.Panel>
              <Tabs.Panel id="summary"><SummaryContent text={recording.summary} /></Tabs.Panel>
            </div>
          </Tabs>
        ) : (
          <div ref={contentRef} data-testid="recording-scroll" className={`${workspace ? 'min-h-0 flex-1 overflow-y-auto overscroll-contain' : ''} space-y-4 px-4 py-4 md:p-0`}>
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

function HighlightedTranscriptText({ text, matches, current }: { text: string; matches: TranscriptMatch[]; current?: TranscriptMatch }) {
  if (!matches.length) return text;
  const parts: ReactNode[] = [];
  let position = 0;
  for (const match of matches) {
    parts.push(text.slice(position, match.start));
    const selected = current === match;
    parts.push(<mark key={match.start} data-current-match={selected || undefined} className={selected ? 'rounded bg-warning px-0.5 text-warning-foreground outline outline-1 outline-current' : 'rounded bg-warning/30 text-inherit'}>{text.slice(match.start, match.end)}</mark>);
    position = match.end;
  }
  parts.push(text.slice(position));
  return parts;
}
