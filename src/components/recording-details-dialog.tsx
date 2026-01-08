
"use client";

import { useState, useEffect } from 'react';
import { authFetch } from '@/lib/api-client';
import type { Recording } from '@/lib/types';
import {
  Modal,
  ScrollShadow,
  Button,
  Avatar
} from '@heroui/react';
import { ClientFormattedDate } from './client-formatted-date';
import { Loader2, Wand2 } from 'lucide-react';

type RecordingDetailsDialogProps = {
  recording: Recording;
  onOpenChange: (open: boolean) => void;
};

export function RecordingDetailsDialog({ recording, onOpenChange }: RecordingDetailsDialogProps) {
  const [isTranscribing, setIsTranscribing] = useState(false);
  const [showTransliteration, setShowTransliteration] = useState(false);

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


      // ... (in handleTranscribe)
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

      // In a real app, we'd invalidate queries or rely on realtime updates.
      // For now, we just reload the page or let the user close/reopen.
      // But refreshing the page is a bit heavy.
      // Ideally we should call an onUpdate prop or similar.
      // Since we don't have that plumbed, a simple alert or toast would be better, but user UI libraries vary.
      // For now, let's just finish the loading state.
      // A reload would ensure data consistency.
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
      <Modal.Backdrop className="bg-background/20 backdrop-blur-xl z-[99]">
        <Modal.Container className="z-[100]">
          <Modal.Dialog className="h-[100dvh] sm:h-auto sm:max-h-[85vh] w-full max-w-5xl m-0 sm:m-4 bg-background sm:bg-card/70 backdrop-blur-xl sm:border border-default-200/50 shadow-none sm:shadow-2xl flex flex-col">
            <Modal.CloseTrigger />
            <Modal.Header className="flex flex-col gap-1 border-b border-default-100/50 p-4 sm:p-6 flex-shrink-0">
              <Modal.Heading className="text-lg sm:text-xl font-bold truncate pr-8">
                {recording.contactName || recording.phoneNumber}
              </Modal.Heading>
              <p className="text-xs sm:text-sm text-default-500 font-normal flex flex-wrap gap-2 items-center">
                <ClientFormattedDate date={recording.recordedAt} formatString="PPPP p" />
                <span className="hidden sm:inline">&bull;</span>
                <span className="bg-default-100 px-2 py-0.5 rounded-full text-[10px] font-bold uppercase tracking-wide">
                  Duration: {formatDuration(recording.duration)}
                </span>
              </p>
            </Modal.Header>
            <Modal.Body className="p-4 sm:p-6 gap-6 overflow-y-auto flex-1">
              <div className="flex flex-col gap-6 h-full">
                <div className="flex-shrink-0 w-full bg-default-50 rounded-xl p-2 border border-default-100 min-h-[54px] flex items-center justify-center">
                  {isLoadingUrl ? (
                    <div className="flex items-center gap-2 text-default-500">
                      <Loader2 className="w-4 h-4 animate-spin" />
                      <span className="text-sm">Loading audio...</span>
                    </div>
                  ) : playbackUrl ? (
                    <audio controls className="w-full" key={recording.id}>
                      <source
                        src={playbackUrl}
                        type="audio/mpeg"
                      />
                      Your browser does not support the audio element.
                    </audio>
                  ) : (
                    <div className="text-sm text-danger">Audio unavailable</div>
                  )}
                </div>

                {/* Summary Section */}
                {recording.summary && (
                  <div className="flex-shrink-0 bg-primary/5 p-4 sm:p-6 rounded-xl border border-primary/10 shadow-sm">
                    <div className="flex items-center gap-2 mb-3">
                      <div className="p-1.5 bg-primary/20 rounded-lg">
                        <Wand2 className="w-4 h-4 text-primary" />
                      </div>
                      <h4 className="text-sm font-bold text-primary">AI Summary</h4>
                    </div>
                    <p className="text-sm sm:text-base text-foreground/90 leading-relaxed font-normal">
                      {recording.summary}
                    </p>
                  </div>
                )}

                <div className="flex flex-col flex-1 min-h-[300px]">
                  <div className="flex items-center justify-between mb-3 sticky top-0 bg-background/95 backdrop-blur z-10 py-2">
                    <div className="flex items-center gap-2">
                      <h3 className="font-bold text-lg">Transcript</h3>
                      <span className="text-[10px] font-mono text-default-400 bg-default-100 px-2 py-0.5 rounded-full border border-default-200">
                        DIARIZED
                      </span>
                    </div>
                    <div className="flex items-center gap-2">
                      {/* Transliteration Toggle */}
                      {recording.fullTranscript?.some(s => s.transliteratedText) && (
                        <Button
                          size="sm"
                          variant={showTransliteration ? "primary" : "secondary"}
                          onPress={() => setShowTransliteration(!showTransliteration)}
                          className="text-xs h-8 px-3"
                        >
                          {showTransliteration ? "Original" : "Transliteration"}
                        </Button>
                      )}

                      {recording.transcriptionStatus !== 'completed' && (
                        <Button
                          size="sm"
                          variant="ghost"
                          isPending={isProcessing}
                          onPress={handleTranscribe}
                          className="h-8"
                        >
                          {!isProcessing && <Wand2 className="w-4 h-4 mr-1" />}
                          {isProcessing ? 'Transcribing...' : 'Transcribe'}
                        </Button>
                      )}
                    </div>
                  </div>

                  <ScrollShadow className="flex-1 w-full rounded-2xl border border-default-200/60 bg-background/40 p-4 sm:p-6 h-full min-h-[400px]">
                    {recording.fullTranscript && recording.fullTranscript.length > 0 ? (
                      <div className="space-y-6">
                        {recording.fullTranscript.map((segment, index) => (
                          <div key={index} className="flex gap-3 sm:gap-4 group">
                            <Avatar className="flex-shrink-0 w-8 h-8 sm:w-10 sm:h-10 mt-1 ring-2 ring-transparent group-hover:ring-primary/20 transition-all">
                              <Avatar.Fallback className={`text-[10px] sm:text-xs font-bold ${segment.speakerId === 'Speaker 0' ? 'bg-primary/20 text-primary' :
                                segment.speakerId === 'Speaker 1' ? 'bg-secondary/20 text-secondary' :
                                  'bg-default-100 text-default-600'
                                }`}>
                                {segment.speakerId ? segment.speakerId.replace('Speaker ', 'S') : '??'}
                              </Avatar.Fallback>
                            </Avatar>
                            <div className="flex flex-col gap-1 flex-1 min-w-0">
                              <div className="flex items-center gap-2">
                                <span className="text-xs sm:text-sm font-bold text-foreground">
                                  {segment.speakerId || 'Unknown Speaker'}
                                </span>
                                <span className="text-[10px] text-default-400 font-mono bg-default-50 px-1.5 rounded">
                                  {formatDuration(segment.start)}
                                </span>
                              </div>
                              <p className="text-sm sm:text-base text-default-700 leading-relaxed">
                                {showTransliteration ? (segment.transliteratedText || segment.text) : segment.text}
                              </p>
                            </div>
                          </div>
                        ))}
                      </div>
                    ) : (
                      <div className="flex flex-col items-center justify-center h-full min-h-[200px] text-muted-foreground/50 gap-4">
                        {isProcessing ? (
                          <>
                            <Loader2 className="w-8 h-8 animate-spin text-primary/50" />
                            <p className="text-sm font-medium">Generating transcript...</p>
                          </>
                        ) : (
                          <p className="text-sm italic">No transcript available</p>
                        )}
                      </div>
                    )}
                  </ScrollShadow>
                </div>
              </div>
            </Modal.Body>
          </Modal.Dialog>
        </Modal.Container>
      </Modal.Backdrop >
    </Modal >
  );
}
