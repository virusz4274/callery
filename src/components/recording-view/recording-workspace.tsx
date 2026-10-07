'use client';

import type { useRecordingWorkspace } from '@/hooks/use-recording-workspace';
import type { Recording } from '@/lib/types';
import { RecordingDetailsDialog } from '@/components/recording-details-dialog';
import { WorkspaceFeedback } from './workspace-feedback';

export function RecordingWorkspace({ workspace, onUpdated }: {
  workspace: ReturnType<typeof useRecordingWorkspace>;
  onUpdated?: (recording: Recording) => Promise<void> | void;
}) {
  if (!workspace.id) return null;
  if (!workspace.recording) return <WorkspaceFeedback error={workspace.error} onClose={workspace.close} onRetry={() => void workspace.retry()} />;
  return <RecordingDetailsDialog key={workspace.id} recording={workspace.recording}
    autoPlay={workspace.autoPlay}
    onOpenChange={open => { if (!open) workspace.close(); }}
    onRecordingUpdated={async recording => { await workspace.update(recording); await onUpdated?.(recording); }} />;
}
