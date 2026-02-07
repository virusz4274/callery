"use client";

import { useState, useEffect } from 'react';
import type { Recording } from '@/lib/types';
import { Modal, Button } from '@heroui/react';
import { X } from 'lucide-react';
import { ClientFormattedDate } from './client-formatted-date';
import { RecordingContent } from './recording-view/recording-content';
import { SharePopover } from './sharing/share-popover';
import { getPlaybackUrlAction } from '@/app/actions/recordings';
import { transcribeRecordingAction } from '@/app/actions/transcription';

type RecordingDetailsDialogProps = {
  recording: Recording;
  onOpenChange: (open: boolean) => void;
};

export function RecordingDetailsDialog({ recording, onOpenChange }: RecordingDetailsDialogProps) {
  const [isTranscribing, setIsTranscribing] = useState(false);
  const [playbackUrl, setPlaybackUrl] = useState<string | null>(recording.playbackUrl || null);
  const [isLoadingUrl, setIsLoadingUrl] = useState(!recording.playbackUrl);

  const formatDuration = (seconds: number) => {
    const mins = Math.floor(seconds / 60);
    const secs = seconds % 60;
    return `${mins}m ${secs}s`;
  };

  useEffect(() => {
    if (recording.playbackUrl) {
      setPlaybackUrl(recording.playbackUrl);
      setIsLoadingUrl(false);
      return;
    }

    let isMounted = true;
    setIsLoadingUrl(true);

    getPlaybackUrlAction(recording.id)
      .then(result => {
        if (!isMounted) return;
        if (result.playbackUrl) {
          setPlaybackUrl(result.playbackUrl);
        } else {
          console.error('Failed to get playback URL:', result.error);
        }
      })
      .catch(console.error)
      .finally(() => {
        if (isMounted) setIsLoadingUrl(false);
      });

    return () => { isMounted = false; };
  }, [recording.id, recording.playbackUrl]);

  const handleTranscribe = async () => {
    setIsTranscribing(true);
    try {
      const result = await transcribeRecordingAction(recording.id);

      if ('error' in result) {
        throw new Error(result.error);
      }

      window.location.reload();
    } catch (error) {
      console.error('Transcription error:', error);
      // Note: This component doesn't have access to toast context, 
      // but we'll handle this with a proper error state in the future
      console.warn('Transcription failed - would show toast here');
    } finally {
      setIsTranscribing(false);
    }
  };

  const isProcessing = recording.transcriptionStatus === 'processing' || isTranscribing;

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
                  {recording.contactName || recording.phoneNumber}
                </h2>
                <SharePopover recordingId={recording.id} />
              </div>
              <div className="flex flex-wrap gap-2 items-center text-xs sm:text-sm text-default-500">
                <ClientFormattedDate date={recording.recordedAt} formatString="PPP p" />
                <span className="bg-default-100 px-2 py-0.5 rounded-full text-[10px] font-bold uppercase tracking-wide">
                  {formatDuration(recording.duration)}
                </span>
              </div>
            </div>

            {/* Body */}
            <div className="flex-1 overflow-y-auto p-4 sm:p-6">
              <RecordingContent
                recording={recording}
                playbackUrl={playbackUrl}
                isLoadingUrl={isLoadingUrl}
                onTranscribe={handleTranscribe}
                isProcessing={isProcessing}
              />
            </div>
          </Modal.Dialog>
        </Modal.Container>
      </Modal.Backdrop>
    </Modal>
  );
}
