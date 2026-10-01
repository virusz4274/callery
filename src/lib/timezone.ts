import { format } from 'date-fns';

/**
 * Display timezone support. The user picks a zone in Settings → General;
 * app-layout publishes it here once the profile loads, and every
 * ClientFormattedDate renders in that zone. Falls back to the browser's
 * local zone when unset or invalid.
 */
let displayTimeZone: string | null = null;

export function setDisplayTimeZone(timeZone: string | null | undefined): void {
    displayTimeZone = timeZone || null;
}

export function getDisplayTimeZone(): string | null {
    return displayTimeZone;
}

/** True when `value` is a usable IANA timezone name. */
export function isValidTimeZone(value: unknown): value is string {
    if (typeof value !== 'string' || !value) return false;
    try {
        new Intl.DateTimeFormat('en-US', { timeZone: value });
        return true;
    } catch {
        return false;
    }
}

/**
 * Shift `date` so its UTC wall-clock reading matches the wall clock in
 * `timeZone` (standard Intl-based conversion, DST-correct). The result is
 * only meaningful for formatting — never persist it.
 */
export function shiftToTimeZone(date: Date, timeZone: string): Date {
    const parts = new Intl.DateTimeFormat('en-US', {
        timeZone,
        year: 'numeric',
        month: '2-digit',
        day: '2-digit',
        hour: '2-digit',
        minute: '2-digit',
        second: '2-digit',
        hour12: false,
    }).formatToParts(date);

    const get = (type: string): string => parts.find((part) => part.type === type)?.value ?? '0';
    const asUTC = Date.UTC(
        Number(get('year')),
        Number(get('month')) - 1,
        Number(get('day')),
        Number(get('hour')) % 24,
        Number(get('minute')),
        Number(get('second'))
    );
    return new Date(asUTC);
}

/**
 * Format `date` with a date-fns pattern in the display timezone (or the
 * browser zone when none is set). Accepts Date instances and ISO strings.
 */
export function formatInDisplayTimeZone(date: Date | string, formatString: string): string {
    const parsed = typeof date === 'string' ? new Date(date) : date;
    const zone = getDisplayTimeZone();
    if (zone && isValidTimeZone(zone)) {
        // Format the shifted instant in UTC so date-fns tokens render the
        // target zone's wall clock regardless of the browser's zone.
        const shifted = shiftToTimeZone(parsed, zone);
        const utc = new Date(shifted.getTime() + shifted.getTimezoneOffset() * 60 * 1000);
        return format(utc, formatString);
    }
    return format(parsed, formatString);
}
