"use client";

import { useEffect, useRef, useState } from 'react';
import type { Recording } from '@/lib/types';
import { Modal, Button, Card, Chip } from '@heroui/react';
import { X } from 'lucide-react';
import { ClientFormattedDate } from './client-formatted-date';
import { RecordingContent } from './recording-view/recording-content';
import { SharePopover } from './sharing/share-popover';
import { getPlaybackUrlAction, getRecordingDetailsAction } from '@/app/actions/recordings';
import { transcribeRecordingAction } from '@/app/actions/transcription';
import { useToast } from './toast-provider';
import { getAvailableProviders } from '@/app/actions/transcription-providers';
import type { TranscriptionProviderId } from '@/services/transcription/factory';
import { useUser } from '@/lib/firebase/provider';
import { useUserProfile } from '@/hooks/firebase/use-user-profile';

type RecordingDetailsDialogProps = {
  recording: Recording;
  onOpenChange: (open: boolean) => void;
  onRecordingUpdated?: (recording: Recording) => Promise<void> | void;
};

function sleep(ms: number) {
  return new Promise(resolve => setTimeout(resolve, ms));
}

export function RecordingDetailsDialog({ recording, onOpenChange, onRecordingUpdated }: RecordingDetailsDialogProps) {
  const { toast } = useToast();
  const { user } = useUser();
  const { userProfile } = useUserProfile(user);
  const [currentRecording, setCurrentRecording] = useState<Recording>(recording);
  const [isTranscribing, setIsTranscribing] = useState(false);
  const [activeTranscriptionProvider, setActiveTranscriptionProvider] = useState<TranscriptionProviderId | null>(null);
  const [playbackUrl, setPlaybackUrl] = useState<string | null>(recording.playbackUrl || null);
  const [isLoadingUrl, setIsLoadingUrl] = useState(!recording.playbackUrl);
  const [availableProviders, setAvailableProviders] = useState<TranscriptionProviderId[]>([]);
  const [isProviderPickerOpen, setIsProviderPickerOpen] = useState(false);
  const mountedRef = useRef(true);

  useEffect(() => {
    mountedRef.current = true;
    return () => {
      mountedRef.current = false;
    };
  }, []);

  useEffect(() => {
    setCurrentRecording(recording);
    setPlaybackUrl(recording.playbackUrl || null);
    setIsLoadingUrl(!recording.playbackUrl);
  }, [recording]);

  useEffect(() => {
    if (currentRecording.transcriptionStatus !== 'processing') {
      setActiveTranscriptionProvider(null);
    }
  }, [currentRecording.transcriptionStatus]);

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

  useEffect(() => {
    if (currentRecording.playbackUrl) {
      setPlaybackUrl(currentRecording.playbackUrl);
      setIsLoadingUrl(false);
      return;
    }

    setIsLoadingUrl(true);

    getPlaybackUrlAction(currentRecording.id)
      .then(result => {
        if (!mountedRef.current) return;
        if (result.playbackUrl) {
          setPlaybackUrl(result.playbackUrl);
        } else {
          console.error('Failed to get playback URL:', result.error);
        }
      })
      .catch(console.error)
      .finally(() => {
        if (mountedRef.current) setIsLoadingUrl(false);
      });
  }, [currentRecording.id, currentRecording.playbackUrl]);

  const pushRecordingUpdate = async (updatedRecording: Recording) => {
    if (!mountedRef.current) {
      return;
    }

    setCurrentRecording(updatedRecording);
    if (updatedRecording.playbackUrl) {
      setPlaybackUrl(updatedRecording.playbackUrl);
    }
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
    setIsTranscribing(true);
    setActiveTranscriptionProvider(provider);
    setIsProviderPickerOpen(false);
    const previousRecording = currentRecording;
    try {
      const optimisticRecording: Recording = {
        ...currentRecording,
        transcriptionStatus: 'processing',
        transcriptionProvider: provider,
      };
      await pushRecordingUpdate(optimisticRecording);

      const result = await transcribeRecordingAction(currentRecording.id, { provider });

      if ('error' in result) {
        throw new Error(result.error);
      }

      toast({
        title: 'Transcription Started',
        description: 'We are processing this recording. Results will appear automatically.',
        status: 'success',
      });

      let lastSeen: Recording | null = null;
      for (let attempt = 0; attempt < 30; attempt++) {
        await sleep(3000);
        const latest = await refreshRecording();
        if (!latest) {
          continue;
        }
        lastSeen = latest;

        if (latest.transcriptionStatus === 'completed' || latest.transcriptionStatus === 'failed') {
          break;
        }
      }

      // Polling loop exhausted — recording is still processing. Let the user know.
      if (lastSeen && lastSeen.transcriptionStatus === 'processing') {
        toast({
          title: 'Still Processing',
          description: 'Transcription is taking longer than expected. Results will appear automatically once complete.',
          status: 'warning',
        });
      }
    } catch (error) {
      console.error('Transcription error:', error);
      await pushRecordingUpdate(previousRecording);
      toast({
        title: 'Transcription Failed',
        description: error instanceof Error ? error.message : 'Failed to start transcription',
        status: 'danger',
      });
    } finally {
      if (mountedRef.current) {
        setIsTranscribing(false);
      }
    }
  };

  const isProcessing = currentRecording.transcriptionStatus === 'processing' || isTranscribing;
  const hasStandardProvider = availableProviders.includes('soniox');
  const hasPremiumProvider = availableProviders.includes('elevenlabs');
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

    setIsProviderPickerOpen(true);
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
        description: 'Fast manual transcription with the regular provider.',
        note: 'Uses the standard model and lower quota cost.',
      },
      {
        id: 'elevenlabs',
        title: 'Premium',
        description: 'Higher-accuracy transcription for tougher audio.',
        note: 'Uses the premium model and higher quota cost.',
      },
    ];
  const providerCards = providerCardDefinitions.filter((provider) => availableProviders.includes(provider.id));

  return (
    <Modal isOpen={true} onOpenChange={onOpenChange}>

      <Modal.Backdrop className="bg-black/40 backdrop-blur-sm z-[99]">
        <Modal.Container className="z-[100] flex items-end sm:items-center justify-center h-full p-0 sm:p-4">
          <Modal.Dialog className="relative w-full h-[95dvh] sm:h-auto sm:max-h-[85vh] max-w-none sm:max-w-4xl bg-background sm:bg-card backdrop-blur-xl border-t border-default-200/50 sm:border rounded-t-2xl sm:rounded-2xl shadow-2xl flex flex-col overflow-hidden">
            {/* Custom Close Button */}
            <button
              onClick={() => onOpenChange(false)}
              className="absolute top-3 right-3 z-50 p-2 rounded-full bg-default-100 hover:bg-default-200 transition-colors"
              aria-label="Close"
            >
              <X className="w-5 h-5 text-default-600" />
            </button>

            {/* Header */}
            <div className="flex flex-col gap-1 border-b border-default-100 px-4 py-3 sm:px-6 sm:py-4 flex-shrink-0 bg-background">
              <div className="flex items-center gap-4 pr-10">
                <h2 className="text-lg sm:text-xl font-bold truncate">
                  {currentRecording.contactName || currentRecording.phoneNumber}
                </h2>
                <SharePopover recordingId={currentRecording.id} />
              </div>
              <div className="flex flex-wrap gap-2 items-center text-xs sm:text-sm text-default-500">
                <ClientFormattedDate date={currentRecording.recordedAt} formatString="PPP p" />
                <span className="bg-default-100 px-2 py-0.5 rounded-full text-[10px] font-bold uppercase tracking-wide">
                  {formatDuration(currentRecording.duration)}
                </span>
              </div>
            </div>

            {/* Body */}
            <div className="flex-1 overflow-y-auto p-4 sm:p-6">
              <RecordingContent
                recording={currentRecording}
                playbackUrl={playbackUrl}
                isLoadingUrl={isLoadingUrl}
                onTranscribe={hasStandardProvider || hasPremiumProvider ? handleRequestTranscribe : undefined}
                isProcessing={isProcessing}
                activeTranscriptionProvider={activeTranscriptionProvider}
              />
            </div>
          </Modal.Dialog>
        </Modal.Container>
      </Modal.Backdrop>

      <Modal isOpen={isProviderPickerOpen} onOpenChange={setIsProviderPickerOpen}>
        <Modal.Backdrop className="bg-black/30 backdrop-blur-sm z-[109]" />
        <Modal.Container className="z-[110] flex items-center justify-center p-4">
          <Modal.Dialog className="w-full max-w-xl rounded-2xl border border-default-200 bg-background shadow-2xl">
            <Modal.Header>
              <div>
                <Modal.Heading>Choose transcription model</Modal.Heading>
                <p className="mt-1 text-sm text-default-500">
                  Pick the provider for this manual transcription run.
                </p>
              </div>
            </Modal.Header>
            <Modal.Body className="space-y-4">
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
            </Modal.Body>
            <Modal.Footer>
              <Button variant="ghost" className="rounded-full" onPress={() => setIsProviderPickerOpen(false)}>
                Cancel
              </Button>
            </Modal.Footer>
          </Modal.Dialog>
        </Modal.Container>
      </Modal>
    </Modal>
  );
}
