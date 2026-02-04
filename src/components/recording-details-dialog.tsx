
"use client";

import { useState, useEffect } from 'react';
import { authFetch } from '@/lib/api-client';
import type { Recording } from '@/lib/types';
import {
  Modal,
  Button
} from '@heroui/react';
import { ClientFormattedDate } from './client-formatted-date';
import { RecordingContent } from './recording-view/recording-content';
import { SharePopover } from './sharing/share-popover';

type RecordingDetailsDialogProps = {
  recording: Recording;
  onOpenChange: (open: boolean) => void;
};

export function RecordingDetailsDialog({ recording, onOpenChange }: RecordingDetailsDialogProps) {
  const [isTranscribing, setIsTranscribing] = useState(false);

  const formatDuration = (seconds: number) => {
    const mins = Math.floor(seconds / 60);
    const secs = seconds % 60;
    return `${mins}m ${secs}s`;
  };

  const [playbackUrl, setPlaybackUrl] = useState<string | null>(recording.playbackUrl || null);
  const [isLoadingUrl, setIsLoadingUrl] = useState(!recording.playbackUrl);

  // Fetch playback URL on mount if not provided
  useEffect(() => {
    if (recording.playbackUrl) {
      setPlaybackUrl(recording.playbackUrl);
      setIsLoadingUrl(false);
      return;
    }

    setIsLoadingUrl(true);
    authFetch(`/api/recordings/${recording.id}/play`)
      .then(res => res.json())
      .then(data => {
        if (data.playbackUrl) setPlaybackUrl(data.playbackUrl);
      })
      .catch(console.error)
      .finally(() => setIsLoadingUrl(false));
  }, [recording.id, recording.playbackUrl]);

  const handleTranscribe = async () => {
    setIsTranscribing(true);
    try {
      const response = await authFetch('/api/transcribe', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({ recordingId: recording.id }),
      });

      if (!response.ok) {
        throw new Error('Transcription failed');
      }

      window.location.reload();

    } catch (error) {
      console.error('Transcription error:', error);
      alert('Failed to start transcription');
    } finally {
      setIsTranscribing(false);
    }
  };

  const isProcessing = recording.transcriptionStatus === 'processing' || isTranscribing;

  return (
    <Modal isOpen={true} onOpenChange={onOpenChange}>
      <Button className="hidden" aria-hidden="true" />
      <Modal.Backdrop className="bg-background/20 backdrop-blur-xl z-[99]">
        <Modal.Container className="z-[100]">
          <Modal.Dialog className="h-[100dvh] sm:h-auto sm:max-h-[85vh] w-full max-w-5xl m-0 sm:m-4 bg-background sm:bg-card/70 backdrop-blur-xl sm:border border-default-200/50 shadow-none sm:shadow-2xl flex flex-col">
            <Modal.CloseTrigger />
            <Modal.Header className="flex flex-col gap-1 border-b border-default-100/50 p-4 sm:p-6 flex-shrink-0">
              <div className="flex items-center justify-between gap-4">
                <Modal.Heading className="text-lg sm:text-xl font-bold truncate pr-8">
                    {recording.contactName || recording.phoneNumber}
                </Modal.Heading>
                <div className="mr-8">
                    <SharePopover recordingId={recording.id} />
                </div>
              </div>
              <p className="text-xs sm:text-sm text-default-500 font-normal flex flex-wrap gap-2 items-center">
                <ClientFormattedDate date={recording.recordedAt} formatString="PPPP p" />
                <span className="hidden sm:inline">&bull;</span>
                <span className="bg-default-100 px-2 py-0.5 rounded-full text-[10px] font-bold uppercase tracking-wide">
                  Duration: {formatDuration(recording.duration)}
                </span>
              </p>
            </Modal.Header>
            <Modal.Body className="p-4 sm:p-6 gap-6 overflow-y-auto flex-1">
              <RecordingContent 
                recording={recording}
                playbackUrl={playbackUrl}
                isLoadingUrl={isLoadingUrl}
                onTranscribe={handleTranscribe}
                isProcessing={isProcessing}
              />
            </Modal.Body>
          </Modal.Dialog>
        </Modal.Container>
      </Modal.Backdrop >
    </Modal >
  );
}

