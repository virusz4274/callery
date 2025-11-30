
"use client";

import type { CallRecording } from '@/lib/types';
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
} from '@/components/ui/dialog';
import { ScrollArea } from '@/components/ui/scroll-area';
import { Separator } from './ui/separator';
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
    <Dialog open={true} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-[425px] md:max-w-[600px] lg:max-w-[800px]">
        <DialogHeader>
          <DialogTitle>{recording.contactName || recording.phoneNumber}</DialogTitle>
          <DialogDescription>
            <ClientFormattedDate date={recording.date} formatString="PPPP p" /> &bull; Duration: {formatDuration(recording.duration)}
          </DialogDescription>
        </DialogHeader>
        <div className="grid gap-4 py-4">
          <div className="space-y-4">
            <audio controls className="w-full" key={recording.id}>
              <source src={`/${recording.filePath}`} type="audio/mpeg" />
              Your browser does not support the audio element.
            </audio>
            
            <Separator />

            <div className="space-y-2">
                <h3 className="font-semibold">Transcript</h3>
                <ScrollArea className="h-64 rounded-md border p-4">
                    <p className="text-sm text-muted-foreground whitespace-pre-wrap">
                        {recording.transcriptSnippet}
                    </p>
                </ScrollArea>
            </div>
          </div>
        </div>
      </DialogContent>
    </Dialog>
  );
}
