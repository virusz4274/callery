export type RecordingPanel = 'share' | 'providers';

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
  window.history.replaceState(null, '', listUrl);
  window.history.pushState({ [HISTORY_KEY]: { id, kind: 'recording' } }, '', recordingUrl);
  if (panel === 'share' || panel === 'providers') openRecordingPanel(id, panel);
}

/** Update only viewer state; Next's native history integration keeps the list mounted. */
export function openRecordingWorkspace(id: string) {
  const url = new URL(window.location.href);
  url.searchParams.set('id', id);
  url.searchParams.delete('recordingView');
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
  if (!panelOnly) url.searchParams.delete('id');
  window.history.replaceState(null, '', url);
}
