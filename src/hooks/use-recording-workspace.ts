'use client';

import { useEffect, useRef, useState } from 'react';
import { useSearchParams } from 'next/navigation';
import useSWR from 'swr';
import type { Recording } from '@/lib/types';
import { getRecordingDetailsAction } from '@/app/actions/recordings';
import { useUser } from '@/lib/auth/client';
import { closeRecordingWorkspace, initializeRecordingWorkspaceNavigation, openRecordingWorkspace } from '@/lib/recording-workspace-navigation';

export function useRecordingWorkspace(recordings: Recording[] = [], enabled = true) {
  const params = useSearchParams();
  const { user } = useUser();
  const id = enabled ? params.get('id') : null;
  const [opened, setOpened] = useState<Record<string, Recording>>({});
  const [autoPlayId, setAutoPlayId] = useState<string | null>(null);
  const origin = useRef<{ top: number; left: number; element: HTMLElement | null } | null>(null);
  const scrollRestoration = useRef<ScrollRestoration | null>(null);
  const previousId = useRef<string | null>(null);

  const rememberOrigin = () => {
    origin.current = {
      top: window.scrollY,
      left: window.scrollX,
      element: document.activeElement instanceof HTMLElement ? document.activeElement : null,
    };
    scrollRestoration.current ??= window.history.scrollRestoration;
    window.history.scrollRestoration = 'manual';
  };

  useEffect(() => {
    if (!enabled) return;
    const wasOpen = previousId.current !== null;
    previousId.current = id;
    if (id) {
      scrollRestoration.current ??= window.history.scrollRestoration;
      window.history.scrollRestoration = 'manual';
      initializeRecordingWorkspaceNavigation(id);
      return;
    }
    if (!wasOpen) return;
    // Wait for the dialog's focus scope and body scroll lock to be removed.
    let nextFrame = 0;
    const frame = requestAnimationFrame(() => {
      nextFrame = requestAnimationFrame(() => {
        setAutoPlayId(null);
        const saved = origin.current;
        if (saved) {
          if (saved.element?.isConnected) saved.element.focus({ preventScroll: true });
          window.scrollTo({ top: saved.top, left: saved.left, behavior: 'instant' });
        }
        if (scrollRestoration.current) {
          window.history.scrollRestoration = scrollRestoration.current;
          scrollRestoration.current = null;
        }
      });
    });
    return () => { cancelAnimationFrame(frame); cancelAnimationFrame(nextFrame); };
  }, [id, enabled]);

  useEffect(() => () => {
    if (scrollRestoration.current) window.history.scrollRestoration = scrollRestoration.current;
  }, []);
  const listed = recordings.find(recording => recording.id === id);
  const cached = id ? opened[id] : undefined;
  const seed = cached && (!listed || cached.updatedAt > listed.updatedAt) ? cached : listed;
  const { data, error, isLoading, mutate } = useSWR(
    id && user ? ['recording-details', user.id, id] : null,
    async () => {
      const result = await getRecordingDetailsAction(id!);
      if ('error' in result) throw new Error(result.error);
      return result.recording as Recording;
    },
    { shouldRetryOnError: false, fallbackData: seed, revalidateOnMount: true },
  );

  return {
    id,
    autoPlay: Boolean(id && autoPlayId === id),
    recording: data && (!seed || data.updatedAt >= seed.updatedAt) ? data : seed,
    error,
    isLoading,
    retry: () => mutate(),
    open: (recording: Recording, play = false) => {
      rememberOrigin();
      setAutoPlayId(play ? recording.id : null);
      setOpened(current => ({ ...current, [recording.id]: recording }));
      openRecordingWorkspace(recording.id);
    },
    openId: (recordingId: string) => { rememberOrigin(); openRecordingWorkspace(recordingId); },
    close: () => { if (id) closeRecordingWorkspace(id); },
    update: async (recording: Recording) => {
      setOpened(current => ({ ...current, [recording.id]: recording }));
      await mutate(recording, false);
    },
  };
}
