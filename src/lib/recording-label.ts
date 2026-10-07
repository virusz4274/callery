type Caller = { contactName: string | null; phoneNumber: string };

export function getRecordingCallerLabel(recording: Caller): string {
    return recording.contactName?.trim() ||
        (recording.phoneNumber && recording.phoneNumber !== 'Unknown' ? recording.phoneNumber : '') ||
        'Unknown caller';
}

/** Canonical cached title; all components use the same local calendar as filename parsing. */
export function buildRecordingDisplayName(recording: Caller, recordedAt: Date): string {
    const pad = (value: number) => String(value).padStart(2, '0');
    const date = `${recordedAt.getFullYear()}-${pad(recordedAt.getMonth() + 1)}-${pad(recordedAt.getDate())}`;
    const time = `${pad(recordedAt.getHours())}-${pad(recordedAt.getMinutes())}-${pad(recordedAt.getSeconds())}`;
    return `${getRecordingCallerLabel(recording).replace(/\s+/g, '_')}_${date}_${time}`;
}
