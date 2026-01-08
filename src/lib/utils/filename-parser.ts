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

    // Parse date
    let date: Date | null = null;
    try {
        const year = 2000 + parseInt(dateStr.substring(0, 2));
        const month = parseInt(dateStr.substring(2, 4)) - 1;
        const day = parseInt(dateStr.substring(4, 6));
        const hours = parseInt(timeStr.substring(0, 2));
        const minutes = parseInt(timeStr.substring(2, 4));
        const seconds = parseInt(timeStr.substring(4, 6));
        date = new Date(year, month, day, hours, minutes, seconds);
        if (isNaN(date.getTime())) {
            date = null;
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
