const LOCAL_NOTIFICATION_ORIGIN = 'http://localhost';

export function buildRecordingNotificationLink(recordingId: string): string {
  const params = new URLSearchParams({ id: recordingId });
  return `/recordings?${params.toString()}`;
}

export function normalizeNotificationLink(link?: string | null): string | undefined {
  if (typeof link !== 'string') {
    return undefined;
  }

  const trimmed = link.trim();
  if (!trimmed) {
    return undefined;
  }

  try {
    const parsed = new URL(trimmed, LOCAL_NOTIFICATION_ORIGIN);

    if (parsed.origin !== LOCAL_NOTIFICATION_ORIGIN) {
      return undefined;
    }

    if (!parsed.pathname.startsWith('/')) {
      return undefined;
    }

    return `${parsed.pathname}${parsed.search}${parsed.hash}`;
  } catch {
    return undefined;
  }
}
