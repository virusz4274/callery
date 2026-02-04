"use client";

import { useState } from 'react';
import type { Recording } from '@/lib/types';
import { Button, ScrollShadow, Avatar } from '@heroui/react';
import { Loader2, Wand2 } from 'lucide-react';
import { motion } from 'framer-motion';

type RecordingContentProps = {
  recording: Recording;
  playbackUrl: string | null;
  isLoadingUrl?: boolean;
  onTranscribe?: () => void;
  isProcessing?: boolean;
};

export function RecordingContent({ 
  recording, 
  playbackUrl, 
  isLoadingUrl = false, 
  onTranscribe,
  isProcessing = false
}: RecordingContentProps) {
  const [showTransliteration, setShowTransliteration] = useState(false);

  const formatDuration = (seconds: number) => {
    const mins = Math.floor(seconds / 60);
    const secs = seconds % 60;
    return `${mins}m ${secs}s`;
  };

  return (
    <div className="flex flex-col gap-6 h-full">
      {/* Audio Player */}
      <div className="flex-shrink-0 w-full bg-default-50 rounded-xl p-2 border border-default-100 min-h-[54px] flex items-center justify-center">
        {isLoadingUrl ? (
          <div className="flex items-center gap-2 text-default-500">
            <Loader2 className="w-4 h-4 animate-spin" />
            <span className="text-sm">Loading audio...</span>
          </div>
        ) : playbackUrl ? (
          <audio controls className="w-full" key={recording.id}>
            <source src={playbackUrl} type="audio/mpeg" />
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

      {/* Transcript Section */}
      <div className="flex flex-col flex-1 min-h-[300px]">
        <div className="flex items-center justify-between mb-3 sticky top-0 bg-background/95 backdrop-blur z-10 py-2">
          <div className="flex items-center gap-2">
            <h3 className="font-bold text-lg">Transcript</h3>
            {recording.fullTranscript && recording.fullTranscript.length > 0 && (
              <span className="text-[10px] font-mono text-default-400 bg-default-100 px-2 py-0.5 rounded-full border border-default-200">
                DIARIZED
              </span>
            )}
          </div>
          <div className="flex items-center gap-2">
            {/* Transliteration Toggle */}
            {recording.fullTranscript?.some(s => s.transliteratedText) && (
              <div className="flex items-center bg-default-100/50 rounded-lg p-1 gap-1 h-9 border border-default-200/50">
                <button
                  onClick={() => setShowTransliteration(false)}
                  className={`relative px-3 h-full rounded-md text-xs font-medium transition-colors z-10 ${!showTransliteration ? "text-white" : "text-default-500 hover:text-default-700"}`}
                >
                  {!showTransliteration && (
                    <motion.div
                      layoutId="active-pill"
                      className="absolute inset-0 bg-[#006FEE] rounded-md shadow-sm z-[-1]"
                      transition={{ type: "spring", stiffness: 300, damping: 30 }}
                    />
                  )}
                  Original
                </button>
                <button
                  onClick={() => setShowTransliteration(true)}
                  className={`relative px-3 h-full rounded-md text-xs font-medium transition-colors z-10 ${showTransliteration ? "text-white" : "text-default-500 hover:text-default-700"}`}
                >
                  {showTransliteration && (
                    <motion.div
                      layoutId="active-pill"
                      className="absolute inset-0 bg-[#006FEE] rounded-md shadow-sm z-[-1]"
                      transition={{ type: "spring", stiffness: 300, damping: 30 }}
                    />
                  )}
                  Transliteration
                </button>
              </div>
            )}

            {onTranscribe && recording.transcriptionStatus !== 'completed' && (
              <Button
                size="sm"
                variant="ghost"
                isPending={isProcessing}
                onPress={onTranscribe}
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
                        {formatDuration(segment.start ?? 0)}
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
  );
}
