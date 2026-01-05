
"use client";

import type { CallRecording } from '@/lib/types';
import {
  Modal,
  Separator,
  ScrollShadow
} from '@heroui/react';
import { ClientFormattedDate } from './client-formatted-date';

type RecordingDetailsDialogProps = {
  recording: CallRecording;
  onOpenChange: (open: boolean) => void;
};

export function RecordingDetailsDialog({ recording, onOpenChange }: RecordingDetailsDialogProps) {

  const formatDuration = (seconds: number) => {
    const mins = Math.floor(seconds / 60);
    const secs = seconds % 60;
    return `${mins}m ${secs}s`;
  };

  return (
    <Modal isOpen={true} onOpenChange={onOpenChange}>
      <Modal.Backdrop className="bg-background/20 backdrop-blur-xl">
        <Modal.Container>
          <Modal.Dialog className="bg-card/70 backdrop-blur-xl border border-default-200/50 shadow-2xl">
            <Modal.CloseTrigger />
            <Modal.Header className="flex flex-col gap-1">
              <Modal.Heading>{recording.contactName || recording.phoneNumber}</Modal.Heading>
              <p className="text-sm text-muted-foreground font-normal">
                <ClientFormattedDate date={recording.date} formatString="PPPP p" /> &bull; Duration: {formatDuration(recording.duration)}
              </p>
            </Modal.Header>
            <Modal.Body className="pb-6">
              <div className="grid gap-4">
                <div className="space-y-4">
                  <audio controls className="w-full" key={recording.id}>
                    <source src={`/${recording.filePath}`} type="audio/mpeg" />
                    Your browser does not support the audio element.
                  </audio>

                  <Separator />

                  <div className="space-y-2">
                    <h3 className="font-semibold">Transcript</h3>
                    <ScrollShadow className="h-64 rounded-md border p-4">
                      <p className="text-sm text-muted-foreground whitespace-pre-wrap">
                        {recording.transcriptSnippet}
                      </p>
                    </ScrollShadow>
                  </div>
                </div>
              </div>
            </Modal.Body>
          </Modal.Dialog>
        </Modal.Container>
      </Modal.Backdrop>
    </Modal>
  );
}
