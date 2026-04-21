import type { UpsertContactInput } from './types';

function dedupePreservingOrder(values: string[]): string[] {
    const seen = new Set<string>();
    const result: string[] = [];

    for (const value of values) {
        if (!value || seen.has(value)) {
            continue;
        }

        seen.add(value);
        result.push(value);
    }

    return result;
}

export function normalizeContactName(name: string): string {
    return name
        .normalize('NFKC')
        .trim()
        .replace(/\s+/g, ' ')
        .toLocaleLowerCase('en');
}

export function sanitizeContactName(name: string): string {
    return name
        .normalize('NFKC')
        .trim()
        .replace(/\s+/g, ' ');
}

export function normalizeContactPhoneNumber(phoneNumber: string): string {
    const normalized = phoneNumber.normalize('NFKC').trim();
    const hasLeadingPlus = normalized.startsWith('+');
    const digitsOnly = normalized.replace(/\D/g, '');

    if (!digitsOnly) {
        return '';
    }

    return hasLeadingPlus ? `+${digitsOnly}` : digitsOnly;
}

export function sanitizeContactPhoneNumbers(phoneNumbers: string[]): string[] {
    return dedupePreservingOrder(
        phoneNumbers
            .map((phoneNumber) => phoneNumber.normalize('NFKC').trim().replace(/\s+/g, ' '))
            .filter(Boolean)
    );
}

export function normalizeContactPhoneNumbers(phoneNumbers: string[]): string[] {
    return dedupePreservingOrder(
        phoneNumbers
            .map((phoneNumber) => normalizeContactPhoneNumber(phoneNumber))
            .filter(Boolean)
    );
}

export function splitContactName(name: string): { firstName: string; lastName: string } {
    const sanitizedName = sanitizeContactName(name);
    const [firstName, ...lastNameParts] = sanitizedName.split(' ');

    return {
        firstName: firstName || '',
        lastName: lastNameParts.join(' '),
    };
}

export function buildNormalizedContactFields(name: string, phoneNumbers: string[]) {
    const sanitizedName = sanitizeContactName(name);
    const sanitizedPhoneNumbers = sanitizeContactPhoneNumbers(phoneNumbers);

    return {
        name: sanitizedName,
        normalizedName: normalizeContactName(sanitizedName),
        phoneNumbers: sanitizedPhoneNumbers,
        normalizedPhoneNumbers: normalizeContactPhoneNumbers(sanitizedPhoneNumbers),
        ...splitContactName(sanitizedName),
    };
}

export function normalizeGoogleContactInput(contact: UpsertContactInput) {
    const normalizedFields = buildNormalizedContactFields(contact.name, contact.phoneNumbers);

    return {
        googleContactId: contact.googleContactId,
        email: contact.email || '',
        jobTitle: contact.jobTitle || undefined,
        company: contact.company || undefined,
        ...normalizedFields,
    };
}
