"use client";

import { useState } from 'react';
import type { Recording } from '@/lib/types';
import { Button, ScrollShadow, Avatar, Accordion } from '@heroui/react';
import { Loader2, Wand2, ChevronDown } from 'lucide-react';
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
    <div className="flex flex-col gap-4 h-full">
      {/* Audio Player */}
      <div className="flex-shrink-0 w-full bg-default-50 rounded-xl p-2 border border-default-100 min-h-[54px] flex items-center justify-center">
        {isLoadingUrl ? (
          <div className="flex items-center gap-2 text-default-500">
            <Loader2 className="w-4 h-4 animate-spin" />
            <span className="text-sm">Loading audio...</span>
          </div>
        ) : playbackUrl ? (
          <audio controls className="w-full h-10" key={recording.id}>
            <source src={playbackUrl} type="audio/mpeg" />
            Your browser does not support the audio element.
          </audio>
        ) : (
          <div className="text-sm text-danger">Audio unavailable</div>
        )}
      </div>

      {/* Summary Section - Expandable Accordion */}
      {recording.summary && (
        <Accordion
          className="flex-shrink-0 bg-primary/5 rounded-xl border border-primary/10"
          hideSeparator
        >
          <Accordion.Item id="summary">
            <Accordion.Heading>
              <Accordion.Trigger className="px-3 py-2 sm:px-4 sm:py-3 hover:bg-primary/10 rounded-xl transition-colors">
                <div className="flex items-center gap-2">
                  <div className="p-1 sm:p-1.5 bg-primary/20 rounded-lg">
                    <Wand2 className="w-3.5 h-3.5 sm:w-4 sm:h-4 text-primary" />
                  </div>
                  <span className="text-xs sm:text-sm font-bold text-primary">AI Summary</span>
                </div>
                <Accordion.Indicator className="text-primary/60">
                  <ChevronDown className="w-4 h-4" />
                </Accordion.Indicator>
              </Accordion.Trigger>
            </Accordion.Heading>
            <Accordion.Panel>
              <Accordion.Body className="px-3 pb-3 sm:px-4 sm:pb-4 pt-0">
                <p className="text-xs sm:text-sm text-foreground/90 leading-relaxed">
                  {recording.summary}
                </p>
              </Accordion.Body>
            </Accordion.Panel>
          </Accordion.Item>
        </Accordion>
      )}

      {/* Transcript Section */}
      <div className="flex flex-col flex-1 min-h-0">
        <div className="flex items-center justify-between mb-2 sm:mb-3 py-2">
          <div className="flex items-center gap-2">
            <h3 className="font-bold text-base sm:text-lg">Transcript</h3>
            {recording.fullTranscript && recording.fullTranscript.length > 0 && (
              <span className="text-[10px] font-mono text-default-400 bg-default-100 px-2 py-0.5 rounded-full border border-default-200">
                DIARIZED
              </span>
            )}
          </div>
          <div className="flex items-center gap-2">
            {/* Transliteration Toggle */}
            {recording.fullTranscript?.some(s => s.transliteratedText) && (
              <div className="flex items-center bg-default-100/50 rounded-lg p-1 gap-1 h-8 sm:h-9 border border-default-200/50">
                <button
                  onClick={() => setShowTransliteration(false)}
                  className={`relative px-2 sm:px-3 h-full rounded-md text-[10px] sm:text-xs font-medium transition-colors z-10 ${!showTransliteration ? "text-white" : "text-default-500 hover:text-default-700"}`}
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
                  className={`relative px-2 sm:px-3 h-full rounded-md text-[10px] sm:text-xs font-medium transition-colors z-10 ${showTransliteration ? "text-white" : "text-default-500 hover:text-default-700"}`}
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
                className="h-7 sm:h-8"
              >
                {!isProcessing && <Wand2 className="w-3.5 h-3.5 sm:w-4 sm:h-4 mr-1" />}
                {isProcessing ? 'Transcribing...' : 'Transcribe'}
              </Button>
            )}
          </div>
        </div>

        <ScrollShadow className="flex-1 w-full rounded-xl border border-default-200/60 bg-default-50/50 p-3 sm:p-4 overflow-y-auto">
          {recording.fullTranscript && recording.fullTranscript.length > 0 ? (
            <div className="space-y-3 sm:space-y-4">
              {recording.fullTranscript.map((segment, index) => (
                <div key={index} className="flex gap-2 sm:gap-3 group">
                  <Avatar className="flex-shrink-0 w-7 h-7 sm:w-9 sm:h-9 mt-0.5 ring-2 ring-transparent group-hover:ring-primary/20 transition-all">
                    <Avatar.Fallback className={`text-[9px] sm:text-xs font-bold ${segment.speakerId === 'Speaker 0' ? 'bg-primary/20 text-primary' :
                      segment.speakerId === 'Speaker 1' ? 'bg-secondary/20 text-secondary' :
                        'bg-default-100 text-default-600'
                      }`}>
                      {segment.speakerId ? segment.speakerId.replace('Speaker ', 'S') : '??'}
                    </Avatar.Fallback>
                  </Avatar>
                  <div className="flex flex-col gap-0.5 flex-1 min-w-0">
                    <div className="flex items-center gap-1 sm:gap-2">
                      <span className="text-xs sm:text-sm font-semibold text-foreground">
                        {segment.speakerId || 'Unknown Speaker'}
                      </span>
                      <span className="text-[9px] sm:text-[10px] text-default-400 font-mono bg-default-100 px-1 sm:px-1.5 rounded">
                        {formatDuration(segment.start ?? 0)}
                      </span>
                    </div>
                    <p className="text-sm text-default-700 leading-relaxed">
                      {showTransliteration ? (segment.transliteratedText || segment.text) : segment.text}
                    </p>
                  </div>
                </div>
              ))}
            </div>
          ) : (
            <div className="flex flex-col items-center justify-center h-full min-h-[150px] text-muted-foreground/50 gap-4">
              {isProcessing ? (
                <>
                  <Loader2 className="w-6 h-6 sm:w-8 sm:h-8 animate-spin text-primary/50" />
                  <p className="text-xs sm:text-sm font-medium">Generating transcript...</p>
                </>
              ) : (
                <p className="text-xs sm:text-sm italic">No transcript available</p>
              )}
            </div>
          )}
        </ScrollShadow>
      </div>
    </div>
  );
}
