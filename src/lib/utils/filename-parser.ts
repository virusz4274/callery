/**
 * Filename parsing utilities for extracting contact info from recording filenames.
 */

export interface ParsedContactInfo {
    name: string | null;
    phoneNumber: string | null;
    date: Date | null;
}

/**
 * Parse contact info and date from a recording filename.
 * 
 * Supports format: "Call recording ContactName_YYMMDD_HHMMSS.ext"
 * 
 * @example
 * parseContactFromFilename("Call recording John_Doe_231215_143022.mp3")
 * // { name: "John Doe", phoneNumber: null, date: Date(2023-12-15 14:30:22) }
 * 
 * @example
 * parseContactFromFilename("Call recording +14155551234_231215_143022.mp3")
 * // { name: null, phoneNumber: "+14155551234", date: Date(...) }
 */
export function parseContactFromFilename(filename: string): ParsedContactInfo {
    const prefix = 'Call recording ';

    if (!filename.startsWith(prefix)) {
        // Try to extract any useful info from the filename
        const nameWithoutExt = filename.replace(/\.[^.]+$/, '');
        return {
            name: nameWithoutExt || null,
            phoneNumber: null,
            date: null,
        };
    }

    const mainPart = filename.substring(prefix.length);
    const nameWithoutExt = mainPart.replace(/\.[^.]+$/, '');

    // Try to match: ContactName_YYMMDD_HHMMSS
    const match = nameWithoutExt.match(/(.+)_(\d{6})_(\d{6})$/);

    if (!match) {
        return {
            name: nameWithoutExt || null,
            phoneNumber: null,
            date: null,
        };
    }

    const contact = match[1];
    const dateStr = match[2];
    const timeStr = match[3];

    // Check if contact is a phone number
    const isPhoneNumber = /^[\d+\-\s()]+$/.test(contact.replace(/_/g, ' '));

    // Parse date. Range-check first: the Date constructor overflows
    // (month 13 -> next year) instead of returning Invalid Date.
    let date: Date | null = null;
    try {
        const year = 2000 + parseInt(dateStr.substring(0, 2), 10);
        const month = parseInt(dateStr.substring(2, 4), 10);
        const day = parseInt(dateStr.substring(4, 6), 10);
        const hours = parseInt(timeStr.substring(0, 2), 10);
        const minutes = parseInt(timeStr.substring(2, 4), 10);
        const seconds = parseInt(timeStr.substring(4, 6), 10);
        const inRange =
            month >= 1 && month <= 12 &&
            day >= 1 && day <= 31 &&
            hours <= 23 && minutes <= 59 && seconds <= 59;
        if (inRange) {
            const candidate = new Date(year, month - 1, day, hours, minutes, seconds);
            // Round-trip guard: rejects e.g. Feb 30 (which overflows to Mar).
            if (
                !isNaN(candidate.getTime()) &&
                candidate.getFullYear() === year &&
                candidate.getMonth() === month - 1 &&
                candidate.getDate() === day
            ) {
                date = candidate;
            }
        }
    } catch {
        date = null;
    }

    return {
        name: isPhoneNumber ? null : contact.replace(/_/g, ' '),
        phoneNumber: isPhoneNumber ? contact.replace(/_/g, '') : null,
        date,
    };
}
