import type { Contact, Recording } from '../types';
import { normalizeContactName, normalizeContactPhoneNumber } from './normalize';
import { buildRecordingDisplayName } from '@/lib/recording-label';

type Caller = Pick<Recording, 'contactId' | 'contactName' | 'phoneNumber' | 'contactMatchSource'>;

/** Index a complete account snapshot once; never select an arbitrary duplicate. */
export function createRecordingContactResolver(authSubject: string, contacts: Contact[]) {
    const owned = contacts.filter(contact => contact.authSubject === authSubject);
    const byId = new Map(owned.map(contact => [contact._id.toString(), contact]));
    const byName = new Map<string, Contact[]>();
    const byPhone = new Map<string, Contact[]>();
    for (const contact of owned) {
        const name = normalizeContactName(contact.name);
        byName.set(name, [...(byName.get(name) || []), contact]);
        for (const phone of new Set(contact.normalizedPhoneNumbers)) {
            byPhone.set(phone, [...(byPhone.get(phone) || []), contact]);
        }
    }
    const unique = (matches: Contact[] = []) => matches.length === 1 ? matches[0] : null;
    return (recording: Caller): Contact | null => {
        const existing = recording.contactId ? byId.get(recording.contactId.toString()) : undefined;
        const phone = normalizeContactPhoneNumber(recording.phoneNumber);
        // Name matches retain their identity through renames and phone edits.
        if (existing && (recording.contactMatchSource === 'name' || !phone)) return existing;
        if (recording.contactMatchSource !== 'name' && phone) return unique(byPhone.get(phone));
        return unique(byName.get(normalizeContactName(recording.contactName || '')));
    };
}

/** Only identity/display metadata can be changed by contact synchronization. */
export function buildRecordingContactUpdate(recording: Recording, contact: Contact | null, lastName = recording.contactName) {
    const contactName = contact?.name ?? lastName;
    const phoneNumber = contact && recording.contactMatchSource === 'name'
        ? contact.phoneNumbers[0] || 'Unknown' : recording.phoneNumber;
    return {
        contactId: contact?._id ?? null,
        contactName,
        phoneNumber,
        normalizedPhoneNumber: normalizeContactPhoneNumber(phoneNumber),
        standardizedDisplayName: buildRecordingDisplayName({ contactName, phoneNumber }, recording.recordedAt),
    };
}
