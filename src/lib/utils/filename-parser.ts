/** Metadata parsing is independent of audio/codec support. Keep patterns anchored. */
export interface ParsedContactInfo {
    name: string | null;
    phoneNumber: string | null;
    date: Date | null;
}

export type RecordingFilenameFormat = 'samsung' | 'miui' | 'coloros' | 'huawei' |
    'grapheneos' | 'lineageos' | 'bcr' | 'asus-sequence' | 'oppo-recorder';
export type RecordingFilenameIssue = 'invalid-filename' | 'invalid-date' | 'invalid-caller' |
    'missing-caller' | 'missing-date' | 'unrecognized-pattern';

export interface ParsedRecordingFilename extends ParsedContactInfo {
    format: RecordingFilenameFormat | null;
    status: 'recognized' | 'unrecognized' | 'invalid';
    issues: RecordingFilenameIssue[];
    direction: 'in' | 'out' | 'conference' | null;
    simSlot: number | null;
    /** null means no explicit offset; preserve existing local-time semantics. */
    timezoneOffsetMinutes: number | null;
    timestampMeaning: 'call' | 'recording-end' | null;
}

type Candidate = {
    format: RecordingFilenameFormat;
    caller?: string;
    phone?: string;
    date?: string;
    time?: string;
    milliseconds?: string;
    offset?: string;
    direction?: ParsedRecordingFilename['direction'];
    simSlot?: number;
    timestampMeaning?: ParsedRecordingFilename['timestampMeaning'];
};

const UNKNOWN_CALLER = /^(?:unknown(?:[ _-](?:caller|contact|number))?|private(?:[ _-]number)?|withheld|anonymous|restricted|unavailable|no[ _-]caller[ _-]id|<unknown>)$/i;
// MIUI's label is localized. Other text before @ is treated as a Huawei caller name.
const MIUI_LABEL = /^(?:call(?:[ _]recording)?|recording|通话录音|通話錄音|Εγγραφή κλήσης|Запись (?:вызова|звонка)|Grabación de llamada)$/i;

function findCandidate(stem: string): Candidate | null {
    let match: RegExpMatchArray | null;
    // BCR's optional fields depend on permissions; the offset is part of its default date.
    match = stem.match(/^(\d{8})_(\d{6})\.(\d{3})([+-]\d{4})(?:_(in|out|conference))?(?:_sim([1-9]\d?))?(?:_(.+))?$/i);
    if (match) {
        const tail = match[7];
        const split = tail?.indexOf('_') ?? -1;
        const first = tail ? (split < 0 ? tail : tail.slice(0, split)) : undefined;
        const unknownTail = tail !== undefined && UNKNOWN_CALLER.test(tail.trim());
        const hasPhone = first !== undefined && looksLikePhone(first);
        return {
            format: 'bcr', date: match[1], time: match[2], milliseconds: match[3], offset: match[4],
            direction: match[5]?.toLowerCase() as Candidate['direction'],
            simSlot: match[6] ? Number(match[6]) : undefined,
            phone: unknownTail ? tail : hasPhone ? first : undefined,
            caller: unknownTail ? undefined : hasPhone ? (split < 0 ? undefined : tail?.slice(split + 1)) : tail,
        };
    }
    match = stem.match(/^CallRecord_(\d{8})-(\d{6})_(.+)$/i);
    if (match) return { format: 'grapheneos', date: match[1], time: match[2], phone: match[3] };

    match = stem.match(/^(.+)@(.+)_(\d{8})(\d{6})$/);
    if (match) {
        const miui = MIUI_LABEL.test(match[1].trim());
        return { format: miui ? 'miui' : 'huawei', caller: miui ? undefined : match[1], phone: match[2], date: match[3], time: match[4] };
    }
    match = stem.match(/^Call\s+(?:recording\s+)?(.+)_(\d{6})_(\d{6})$/i);
    if (match) return { format: 'samsung', caller: match[1], date: match[2], time: match[3] };

    match = stem.match(/^(.+)_(\d{6})_(\d{6})(\d{3})?$/);
    if (match && looksLikePhone(match[1])) {
        return { format: 'lineageos', phone: match[1], date: match[2], time: match[3], milliseconds: match[4] };
    }
    match = stem.match(/^(.+)-(\d{6})(\d{4})$/);
    if (match) return { format: 'coloros', caller: match[1], date: match[2], time: `${match[3]}00` };

    // This voice-recorder timestamp denotes the END of recording.
    match = stem.match(/^REC(\d{8})(\d{6})$/i);
    if (match) return { format: 'oppo-recorder', date: match[1], time: match[2], timestampMeaning: 'recording-end' };
    if (/^Call recording \d+$/i.test(stem)) return { format: 'asus-sequence' };
    return null;
}

function looksLikePhone(value: string): boolean {
    return /^[+\d\s_()\-]+$/.test(value) || UNKNOWN_CALLER.test(value.trim());
}

function parsePhone(value: string): string | null {
    const phone = value.trim().replace(/_/g, '');
    if (!/^\+?[\d\s()\-]+$/.test(phone)) return null;
    const digits = phone.replace(/\D/g, '');
    if (digits.length < 3 || digits.length > 15) return null;
    let depth = 0;
    for (const char of phone) {
        if (char === '(' && ++depth > 1) return null;
        if (char === ')' && --depth < 0) return null;
    }
    return depth === 0 ? phone : null;
}

function parseDate(candidate: Candidate): { date: Date | null; offset: number | null } {
    if (!candidate.date || !candidate.time) return { date: null, offset: null };
    const raw = candidate.date.length === 6 ? `20${candidate.date}` : candidate.date;
    const year = Number(raw.slice(0, 4));
    const month = Number(raw.slice(4, 6));
    const day = Number(raw.slice(6, 8));
    const hours = Number(candidate.time.slice(0, 2));
    const minutes = Number(candidate.time.slice(2, 4));
    const seconds = Number(candidate.time.slice(4, 6));
    const ms = Number(candidate.milliseconds || '0');
    let offset: number | null = null;
    if (candidate.offset) {
        const offsetHours = Number(candidate.offset.slice(1, 3));
        const offsetMinutes = Number(candidate.offset.slice(3, 5));
        if (offsetHours > 14 || offsetMinutes > 59 || (offsetHours === 14 && offsetMinutes !== 0)) {
            return { date: null, offset: null };
        }
        offset = (candidate.offset[0] === '-' ? -1 : 1) * (offsetHours * 60 + offsetMinutes);
    }
    if (year < 2000 || year > 2099 || month < 1 || month > 12 || day < 1 || day > 31 ||
        hours > 23 || minutes > 59 || seconds > 59) return { date: null, offset };
    // Validate the calendar independently of the server timezone/DST.
    const calendar = new Date(Date.UTC(year, month - 1, day, hours, minutes, seconds, ms));
    if (calendar.getUTCFullYear() !== year || calendar.getUTCMonth() !== month - 1 || calendar.getUTCDate() !== day) {
        return { date: null, offset };
    }
    const date = offset === null ? new Date(year, month - 1, day, hours, minutes, seconds, ms)
        : new Date(calendar.getTime() - offset * 60_000);
    // Reject local DST gaps instead of silently moving the time forward.
    if (offset === null && (date.getHours() !== hours || date.getMinutes() !== minutes)) return { date: null, offset };
    return { date, offset };
}

/** Validate metadata only. Unrecognized names remain valid uploads, without guessed callers. */
export function parseRecordingFilename(filename: string): ParsedRecordingFilename {
    const result: ParsedRecordingFilename = {
        name: null, phoneNumber: null, date: null, format: null, status: 'unrecognized',
        issues: [], direction: null, simSlot: null, timezoneOffsetMinutes: null, timestampMeaning: null,
    };
    // A filename must be one basename; never extract metadata from a supplied path.
    if (!filename.trim() || filename.length > 1024 || /[/\\\p{Cc}\u061c\u200e\u200f\u202a-\u202e\u2066-\u2069\ufeff]/u.test(filename)) {
        return { ...result, status: 'invalid', issues: ['invalid-filename'] };
    }
    const stem = filename.trim().replace(/\.[a-z0-9]{1,10}$/i, '').trim();
    if (!stem) return { ...result, status: 'invalid', issues: ['invalid-filename'] };
    const candidate = findCandidate(stem);
    if (!candidate) return { ...result, issues: ['unrecognized-pattern'] };
    result.format = candidate.format;
    result.status = 'recognized';
    result.direction = candidate.direction ?? null;
    result.simSlot = candidate.simSlot ?? null;
    result.timestampMeaning = candidate.date ? candidate.timestampMeaning ?? 'call' : null;

    const caller = candidate.caller?.trim();
    if (caller && !UNKNOWN_CALLER.test(caller)) {
        if (looksLikePhone(caller)) {
            result.phoneNumber = parsePhone(caller);
            if (!result.phoneNumber) result.issues.push('invalid-caller');
        } else {
            result.name = caller.replace(/_/g, ' ').replace(/\s+/g, ' ').trim() || null;
        }
    }
    if (candidate.phone && !UNKNOWN_CALLER.test(candidate.phone.trim())) {
        result.phoneNumber = parsePhone(candidate.phone);
        if (!result.phoneNumber) result.issues.push('invalid-caller');
    }
    if (!result.name && !result.phoneNumber) result.issues.push('missing-caller');
    const timestamp = parseDate(candidate);
    result.date = timestamp.date;
    result.timezoneOffsetMinutes = timestamp.offset;
    if (!candidate.date) result.issues.push('missing-date');
    else if (!result.date) result.issues.push('invalid-date');
    if (result.issues.includes('invalid-date') || result.issues.includes('invalid-caller')) result.status = 'invalid';
    return result;
}

/** Uploads use validated call metadata. Voice-recorder end times aren't call start times. */
export function parseUploadContactFromFilename(filename: string): ParsedContactInfo {
    const parsed = parseRecordingFilename(filename);
    if (parsed.status !== 'recognized') return { name: null, phoneNumber: null, date: null };
    return { name: parsed.name, phoneNumber: parsed.phoneNumber, date: parsed.timestampMeaning === 'call' ? parsed.date : null };
}

/** Compatibility adapter for callers that historically used arbitrary filenames as labels. */
export function parseContactFromFilename(filename: string): ParsedContactInfo {
    const parsed = parseRecordingFilename(filename);
    if (parsed.format) return { name: parsed.name, phoneNumber: parsed.phoneNumber, date: parsed.date };
    if (parsed.status === 'invalid') return { name: null, phoneNumber: null, date: null };
    const stem = filename.trim().replace(/\.[a-z0-9]{1,10}$/i, '');
    const name = stem.replace(/^Call recording\s+/i, '');
    return { name: name || null, phoneNumber: null, date: null };
}
