export type RecordingPanel = 'share' | 'providers';
import { validPlaybackTime, type TranscriptTarget } from './transcript-navigation';

const TARGET_PARAMS = ['segment', 't', 'revision'] as const;

export function readTranscriptTarget(params: Pick<URLSearchParams, 'get'>): TranscriptTarget | undefined {
  const segment = params.get('segment');
  const time = params.get('t');
  const segmentIndex = segment !== null && /^\d+$/.test(segment) && Number.isSafeInteger(Number(segment)) ? Number(segment) : undefined;
  const start = time !== null && time.trim() !== '' ? validPlaybackTime(Number(time)) : undefined;
  const transcriptRevision = params.get('revision')?.slice(0, 128) || undefined;
  return segmentIndex !== undefined || start !== undefined ? { segmentIndex, start, transcriptRevision } : undefined;
}

const HISTORY_KEY = 'vosiftRecordingWorkspace';

/** Give pasted links an in-app Back destination, including their initial subview. */
export function initializeRecordingWorkspaceNavigation(id: string) {
  if (window.history.state?.[HISTORY_KEY]?.id === id) return;
  const recordingUrl = new URL(window.location.href);
  if (recordingUrl.searchParams.get('id') !== id) return;
  const panel = recordingUrl.searchParams.get('recordingView');
  recordingUrl.searchParams.delete('recordingView');
  const listUrl = new URL(recordingUrl);
  listUrl.searchParams.delete('id');
  TARGET_PARAMS.forEach(key => listUrl.searchParams.delete(key));
  window.history.replaceState(null, '', listUrl);
  window.history.pushState({ [HISTORY_KEY]: { id, kind: 'recording' } }, '', recordingUrl);
  if (panel === 'share' || panel === 'providers') openRecordingPanel(id, panel);
}

/** Update only viewer state; Next's native history integration keeps the list mounted. */
export function openRecordingWorkspace(id: string, target?: TranscriptTarget) {
  const url = new URL(window.location.href);
  url.searchParams.set('id', id);
  url.searchParams.delete('recordingView');
  TARGET_PARAMS.forEach(key => url.searchParams.delete(key));
  if (target?.segmentIndex !== undefined) url.searchParams.set('segment', String(target.segmentIndex));
  if (validPlaybackTime(target?.start) !== undefined) url.searchParams.set('t', String(target!.start));
  if (target?.transcriptRevision) url.searchParams.set('revision', target.transcriptRevision);
  window.history.pushState({ [HISTORY_KEY]: { id, kind: 'recording' } }, '', url);
}

export function openRecordingPanel(id: string, panel: RecordingPanel) {
  const url = new URL(window.location.href);
  url.searchParams.set('recordingView', panel);
  window.history.pushState({ [HISTORY_KEY]: { id, kind: 'panel' } }, '', url);
}

export function closeRecordingWorkspace(id: string, panelOnly = false) {
  const entry = window.history.state?.[HISTORY_KEY];
  if (entry?.id === id && (entry.kind === 'panel' || (!panelOnly && entry.kind === 'recording'))) {
    window.history.back();
    return;
  }
  // A pasted/deep link must return to this screen, never an unrelated prior site.
  const url = new URL(window.location.href);
  url.searchParams.delete('recordingView');
  if (!panelOnly) {
    url.searchParams.delete('id');
    TARGET_PARAMS.forEach(key => url.searchParams.delete(key));
  }
  window.history.replaceState(null, '', url);
}
