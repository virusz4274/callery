"use client";

import { useEffect, useRef, useState } from 'react';
import type { Recording } from '@/lib/types';
import { Modal, Button } from '@heroui/react';
import { X } from 'lucide-react';
import { ClientFormattedDate } from './client-formatted-date';
import { RecordingContent } from './recording-view/recording-content';
import { SharePopover } from './sharing/share-popover';
import { getPlaybackUrlAction, getRecordingDetailsAction } from '@/app/actions/recordings';
import { transcribeRecordingAction } from '@/app/actions/transcription';
import { useToast } from './toast-provider';

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
  const [currentRecording, setCurrentRecording] = useState<Recording>(recording);
  const [isTranscribing, setIsTranscribing] = useState(false);
  const [playbackUrl, setPlaybackUrl] = useState<string | null>(recording.playbackUrl || null);
  const [isLoadingUrl, setIsLoadingUrl] = useState(!recording.playbackUrl);
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

  const handleTranscribe = async () => {
    setIsTranscribing(true);
    try {
      const optimisticRecording: Recording = {
        ...currentRecording,
        transcriptionStatus: 'processing',
      };
      await pushRecordingUpdate(optimisticRecording);

      const result = await transcribeRecordingAction(currentRecording.id);

      if ('error' in result) {
        throw new Error(result.error);
      }

      toast({
        title: 'Transcription Started',
        description: 'We are processing this recording. Results will appear automatically.',
        status: 'success',
      });

      for (let attempt = 0; attempt < 30; attempt++) {
        await sleep(3000);
        const latest = await refreshRecording();
        if (!latest) {
          continue;
        }

        if (latest.transcriptionStatus === 'completed' || latest.transcriptionStatus === 'failed') {
          break;
        }
      }
    } catch (error) {
      console.error('Transcription error:', error);
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
