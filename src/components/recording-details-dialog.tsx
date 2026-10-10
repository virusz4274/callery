"use client";

import useSWR from 'swr';
import { getRecordingCallerLabel } from '@/lib/recording-label';
import { useSearchParams } from 'next/navigation';
import { useIsMobile } from '@/hooks/use-mobile';
import { openRecordingPanel, closeRecordingWorkspace } from '@/lib/recording-workspace-navigation';

import { useEffect, useRef, useState } from 'react';
import type { Recording } from '@/lib/types';
import { Accordion, Modal, Button, Card, Chip } from '@heroui/react';
import { ArrowLeft, Share2, X } from 'lucide-react';
import { ClientFormattedDate } from './client-formatted-date';
import { RecordingContent } from './recording-view/recording-content';
import { SharePopover, ShareRecordingForm } from './sharing/share-popover';
import { getPlaybackUrlAction, getRecordingDetailsAction } from '@/app/actions/recordings';
import { transcribeRecordingAction } from '@/app/actions/transcription';
import { useToast } from './toast-provider';
import { getAvailableProviders } from '@/app/actions/transcription-providers';
import type { TranscriptionProviderId } from '@/services/transcription/factory';
import { useUser } from '@/lib/auth/client';
import { useUserProfile } from '@/hooks/use-user-profile';
import { useTeamPolicy } from '@/hooks/use-team-policy';

type RecordingDetailsDialogProps = {
  recording: Recording;
  autoPlay?: boolean;
  onOpenChange: (open: boolean) => void;
  onRecordingUpdated?: (recording: Recording) => Promise<void> | void;
};

function sleep(ms: number, signal?: AbortSignal): Promise<void> {
  return new Promise((resolve, reject) => {
    if (signal?.aborted) {
      reject(new DOMException('Aborted', 'AbortError'));
      return;
    }
    const timeout = setTimeout(() => {
      signal?.removeEventListener('abort', onAbort);
      resolve();
    }, ms);
    const onAbort = () => {
      clearTimeout(timeout);
      reject(new DOMException('Aborted', 'AbortError'));
    };
    signal?.addEventListener('abort', onAbort, { once: true });
  });
}

export function RecordingDetailsDialog({ recording, autoPlay = false, onOpenChange, onRecordingUpdated }: RecordingDetailsDialogProps) {
  const team = useTeamPolicy();
  const { toast } = useToast();
  const isMobile = useIsMobile();
  const searchParams = useSearchParams();
  const panel = isMobile ? searchParams.get('recordingView') : null;
  const hasPanel = panel === 'share' || panel === 'providers';
  const back = () => hasPanel ? closeRecordingWorkspace(recording.id, true) : onOpenChange(false);
  const dialogRef = useRef<HTMLDivElement>(null);
  const subviewReturnFocus = useRef<HTMLElement | null>(null);
  const requestPanel = (view: 'share' | 'providers') => {
    subviewReturnFocus.current = document.activeElement as HTMLElement;
    openRecordingPanel(recording.id, view);
  };
  useEffect(() => {
    if (!isMobile) return;
    if (hasPanel) dialogRef.current?.querySelector<HTMLElement>('h2')?.focus();
    else if (subviewReturnFocus.current?.isConnected) subviewReturnFocus.current.focus();
  }, [hasPanel, isMobile]);
  useEffect(() => {
    if (!isMobile || !window.visualViewport) return;
    const viewport = window.visualViewport;
    const shell = dialogRef.current?.closest<HTMLElement>('[role="dialog"]');
    let frame = 0;
    const revealFocusedField = () => {
      cancelAnimationFrame(frame);
      frame = requestAnimationFrame(() => {
        const active = document.activeElement;
        if (active instanceof HTMLElement && shell?.contains(active) && active.matches('input, textarea, select')) {
          active.scrollIntoView({ block: 'nearest', inline: 'nearest', behavior: 'instant' });
        }
      });
    };
    const resize = () => {
      shell?.style.setProperty('--workspace-height', `${viewport.height}px`);
      revealFocusedField();
    };
    resize();
    viewport.addEventListener('resize', resize);
    shell?.addEventListener('focusin', revealFocusedField);
    return () => {
      cancelAnimationFrame(frame);
      viewport.removeEventListener('resize', resize);
      shell?.removeEventListener('focusin', revealFocusedField);
    };
  }, [isMobile]);
  const { user } = useUser();
  const { userProfile } = useUserProfile(user);
  const [updatedRecording, setCurrentRecording] = useState<Recording | null>(null);
  const currentRecording = updatedRecording?.id === recording.id && updatedRecording.updatedAt > recording.updatedAt
    ? updatedRecording : recording;
  const [isTranscribing, setIsTranscribing] = useState(false);
  const [pendingProvider, setActiveTranscriptionProvider] = useState<TranscriptionProviderId | null>(null);
  const activeTranscriptionProvider = currentRecording.transcriptionStatus === 'processing' ? pendingProvider : null;
  const { data: fetchedPlaybackUrl, isLoading: isFetchingUrl } = useSWR(
    currentRecording.playbackUrl ? null : ['playback', user?.id, currentRecording.id],
    async () => {
      const result = await getPlaybackUrlAction(currentRecording.id);
      if (!result.playbackUrl) throw new Error(result.error || 'Playback unavailable');
      return result.playbackUrl;
    },
  );
  const playbackUrl = currentRecording.playbackUrl || fetchedPlaybackUrl || null;
  const isLoadingUrl = !currentRecording.playbackUrl && isFetchingUrl;
  const [availableProviders, setAvailableProviders] = useState<TranscriptionProviderId[]>([]);
  const [isProviderPickerOpen, setIsProviderPickerOpen] = useState(false);
  const mountedRef = useRef(true);
  const transcribePollAbortRef = useRef<AbortController | null>(null);

  useEffect(() => {
    mountedRef.current = true;
    return () => {
      mountedRef.current = false;
      transcribePollAbortRef.current?.abort();
      transcribePollAbortRef.current = null;
    };
  }, []);

  useEffect(() => {
    let isMounted = true;

    getAvailableProviders()
      .then((providers) => {
        if (!isMounted) {
          return;
        }

        setAvailableProviders(providers.map((provider) => provider.id));
      })
      .catch((error) => {
        console.error('Failed to load transcription providers:', error);
      });

    return () => {
      isMounted = false;
    };
  }, []);

  const formatDuration = (seconds: number) => {
    const mins = Math.floor(seconds / 60);
    const secs = seconds % 60;
    return `${mins}m ${secs}s`;
  };

  const pushRecordingUpdate = async (updatedRecording: Recording) => {
    if (!mountedRef.current) {
      return;
    }

    setCurrentRecording(updatedRecording);
    await onRecordingUpdated?.(updatedRecording);
  };

  const refreshRecording = async (): Promise<Recording | null> => {
    const details = await getRecordingDetailsAction(currentRecording.id);
    if ('error' in details) {
      return null;
    }

    const updatedRecording = details.recording as Recording;
    await pushRecordingUpdate(updatedRecording);
    return updatedRecording;
  };

  const handleTranscribe = async (provider: TranscriptionProviderId) => {
    if (isTranscribing) {
      return;
    }
    transcribePollAbortRef.current?.abort();
    const controller = new AbortController();
    transcribePollAbortRef.current = controller;
    const { signal } = controller;

    setIsTranscribing(true);
    setActiveTranscriptionProvider(provider);
    if (isMobile && hasPanel) closeRecordingWorkspace(recording.id, true);
    else if (!isMobile) setIsProviderPickerOpen(false);
    const previousRecording = currentRecording;
    try {
      const optimisticRecording: Recording = {
        ...currentRecording,
        transcriptionStatus: 'processing',
        transcriptionProvider: provider,
      };
      await pushRecordingUpdate(optimisticRecording);

      const result = await transcribeRecordingAction(currentRecording.id, { provider });
      if (signal.aborted) {
        return;
      }

      if ('error' in result) {
        throw new Error(result.error);
      }

      toast({
        title: 'Transcription Started',
        description: 'Results will appear here when ready.',
        status: 'success',
      });

      let lastSeen: Recording | null = null;
      for (let attempt = 0; attempt < 30; attempt++) {
        await sleep(3000, signal);
        if (signal.aborted) {
          return;
        }
        const latest = await refreshRecording();
        if (signal.aborted) {
          return;
        }
        if (!latest) {
          continue;
        }
        lastSeen = latest;

        if (latest.transcriptionStatus === 'completed' || latest.transcriptionStatus === 'failed') {
          break;
        }
      }

      if (lastSeen && lastSeen.transcriptionStatus === 'processing') {
        toast({
          title: 'Still Processing',
          description: 'Transcription is taking longer than expected. Results will appear automatically once complete.',
          status: 'warning',
        });
      }
    } catch (error) {
      if (signal.aborted || (error instanceof DOMException && error.name === 'AbortError')) {
        return;
      }
      console.error('Transcription error:', error);
      await pushRecordingUpdate(previousRecording);
      toast({
        title: 'Transcription Failed',
        description: error instanceof Error ? error.message : 'Failed to start transcription',
        status: 'danger',
      });
    } finally {
      if (transcribePollAbortRef.current === controller) {
        transcribePollAbortRef.current = null;
      }
      if (mountedRef.current && !signal.aborted) {
        setIsTranscribing(false);
      }
    }
  };

  const isProcessing = currentRecording.transcriptionStatus === 'processing' || isTranscribing;
  const defaultProvider = userProfile?.transcriptionSettings?.defaultProvider || 'soniox';
  const preferredProvider = availableProviders.includes(defaultProvider)
    ? defaultProvider
    : (availableProviders[0] || 'soniox');

  const handleRequestTranscribe = () => {
    if (isProcessing) {
      return;
    }

    if (availableProviders.length <= 1) {
      handleTranscribe(preferredProvider);
      return;
    }

    if (isMobile) requestPanel('providers');
    else setIsProviderPickerOpen(true);
  };

  const providerCardDefinitions: Array<{
    id: TranscriptionProviderId;
    title: string;
    description: string;
    note: string;
  }> = [
      {
        id: 'soniox',
        title: 'Standard',
        description: 'Fast transcription.',
        note: 'Uses less of your transcription allowance.',
      },
      {
        id: 'elevenlabs',
        title: 'Premium',
        description: 'Higher-accuracy transcription for tougher audio.',
        note: 'Uses more of your transcription allowance.',
      },
      { id: 'gemini', title: 'Gemini', description: 'Transcribe with the configured Gemini model.', note: 'Uses your transcription allowance.' },
      { id: 'openai_compat', title: 'Local or compatible server', description: 'Transcribe with the configured Whisper-compatible server.', note: 'Uses your transcription allowance.' },
    ];
  const providerCards = providerCardDefinitions.filter((provider) => availableProviders.includes(provider.id));

  const providerChoices = (<>
                  {providerCards.map((provider) => {
                    const isDefault = provider.id === preferredProvider;

                    return (
                      <Card key={provider.id} className="rounded-2xl border border-default-200/80 bg-background/95">
                        <Card.Content className="space-y-4 p-4">
                          <div className="flex items-start justify-between gap-3">
                            <div className="space-y-1">
                              <div className="flex items-center gap-2">
                                <h4 className="text-base font-semibold text-foreground">{provider.title}</h4>
                                {isDefault && <Chip size="sm" variant="soft" color="accent">Default</Chip>}
                              </div>
                              <p className="text-sm text-default-600">{provider.description}</p>
                            </div>
                          </div>
                          <p className="text-xs leading-5 text-default-500">{provider.note}</p>
                          <Button
                            className="w-full rounded-full"
                            variant={provider.id === 'elevenlabs' ? 'primary' : 'secondary'}
                            onPress={() => handleTranscribe(provider.id)}
                            isDisabled={isProcessing}
                          >
                            Use {provider.title}
                          </Button>
                        </Card.Content>
                      </Card>
                    );
                  })}
  </>);

  // Control the overlays directly because their opening buttons live outside the dialogs.
  return (
    <Modal.Backdrop isOpen={true} onOpenChange={(open) => { if (!open) back(); }} className="bg-black/40 backdrop-blur-sm z-[99]">
      <Modal.Container className="z-[100] flex h-full items-stretch justify-center p-0 md:items-center md:p-4">
        <Modal.Dialog className="relative flex h-[var(--workspace-height,100dvh)] max-h-[var(--workspace-height,100dvh)] w-full max-w-none flex-col overflow-hidden rounded-none bg-background p-0 shadow-2xl md:h-[85vh] md:max-h-[85vh] md:max-w-4xl md:rounded-2xl md:border md:border-border">
          <div ref={dialogRef} className="shrink-0 border-b border-border bg-background px-4 pt-[max(0.5rem,env(safe-area-inset-top))] pb-3 md:px-6 md:py-4">
            <div className="flex items-center gap-2">
              <Button variant="ghost" onPress={back} className="min-h-11 shrink-0 px-2 md:hidden" aria-label={hasPanel ? 'Back to recording' : 'Back to list'}><ArrowLeft className="size-5" />Back</Button>
              <div className="min-w-0 flex-1">
                <Modal.Heading tabIndex={-1} className="line-clamp-2 break-words text-base font-semibold md:truncate md:text-xl">
                  {panel === 'share' ? 'Share recording' : panel === 'providers' ? 'Choose transcription model' : getRecordingCallerLabel(currentRecording)}
                </Modal.Heading>
              </div>
              {!team && <Button isIconOnly variant="ghost" className={`size-11 shrink-0 md:hidden ${hasPanel ? 'hidden' : ''}`} aria-label="Share recording" onPress={() => requestPanel('share')}><Share2 className="size-5" /></Button>}
              <div className="hidden md:block"><SharePopover recordingId={currentRecording.id} /></div>
              <Button isIconOnly variant="ghost" onPress={() => onOpenChange(false)} className="hidden size-11 shrink-0 md:flex" aria-label="Close"><X className="size-5" /></Button>
            </div>
            <div className="mt-1 flex flex-wrap items-center gap-x-2 text-xs leading-5 text-muted md:text-sm">
              <ClientFormattedDate date={currentRecording.recordedAt} formatString="MMM d, yyyy · p" />
              <span aria-hidden="true">·</span><span>{formatDuration(currentRecording.duration)}</span>
            </div>
            <Accordion className="mt-1" hideSeparator><Accordion.Item id="filename"><Accordion.Heading><Accordion.Trigger className="min-h-11 text-xs text-muted">Original filename<Accordion.Indicator /></Accordion.Trigger></Accordion.Heading><Accordion.Panel><Accordion.Body className="break-all text-xs text-muted">{currentRecording.fileName}</Accordion.Body></Accordion.Panel></Accordion.Item></Accordion>
          </div>
          <div className="min-h-0 flex-1 md:p-6">
            <RecordingContent
              recording={currentRecording} playbackUrl={playbackUrl} isLoadingUrl={isLoadingUrl} autoPlay={autoPlay}
              onTranscribe={availableProviders.length && (!team || (team.transcriptionMode !== 'off' && recording.authSubject === user?.id)) ? handleRequestTranscribe : undefined}
              isProcessing={isProcessing} activeTranscriptionProvider={activeTranscriptionProvider}
              workspace mobilePanelActive={hasPanel}
              mobilePanel={panel === 'share' ? <ShareRecordingForm recordingId={recording.id} /> : <div className="space-y-4">
                {providerChoices}
                <Button variant="ghost" className="min-h-11 w-full" onPress={back}>Cancel</Button>
              </div>}
            />
          </div>
          <Modal.Backdrop isOpen={isProviderPickerOpen} onOpenChange={setIsProviderPickerOpen} className="bg-black/30 backdrop-blur-sm z-[109]">
            <Modal.Container placement="center" scroll="inside" className="z-[110] flex items-center justify-center p-4 sm:p-4">
              <Modal.Dialog className="w-full max-w-xl rounded-2xl border border-default-200 bg-background shadow-2xl">
                <Modal.Header>
                  <div>
                    <Modal.Heading>Choose transcription model</Modal.Heading>
                  </div>
                </Modal.Header>
                <Modal.Body className="space-y-4">
                  {providerChoices}
                </Modal.Body>
                <Modal.Footer>
                  <Button variant="ghost" className="rounded-full" onPress={() => setIsProviderPickerOpen(false)}>
                    Cancel
                  </Button>
                </Modal.Footer>
              </Modal.Dialog>
            </Modal.Container>
          </Modal.Backdrop>
        </Modal.Dialog>
      </Modal.Container>
    </Modal.Backdrop>
  );
}
