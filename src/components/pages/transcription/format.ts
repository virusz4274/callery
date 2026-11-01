export function formatAudioDuration(duration: number) {
    const seconds = Math.max(0, Math.round(duration || 0));
    const hours = Math.floor(seconds / 3600);
    const minutes = Math.floor((seconds % 3600) / 60);
    if (hours) return `${hours}h ${minutes}m`;
    if (minutes) return `${minutes}m ${seconds % 60}s`;
    return `${seconds}s`;
}

export function formatRecordingDate(dateKey: string | null) {
    if (!dateKey) return 'Recording date unavailable';
    const date = new Date(`${dateKey}T00:00:00Z`);
    if (Number.isNaN(date.getTime())) return 'Recording date unavailable';
    return new Intl.DateTimeFormat('en', { dateStyle: 'long', timeZone: 'UTC' }).format(date);
}
