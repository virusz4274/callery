import { Collections, getMongoDb } from '@/lib/mongodb';
import type { Contact, Recording } from '../types';
import { buildRecordingDisplayName } from '@/lib/recording-label';

export function applyCurrentContactNames<T extends Recording>(recordings: T[], contacts: Contact[], authSubject: string): T[] {
    const byId = new Map(contacts.filter(contact => contact.authSubject === authSubject)
        .map(contact => [contact._id.toString(), contact]));
    return recordings.map(recording => {
        const contact = recording.authSubject === authSubject && recording.contactId
            ? byId.get(recording.contactId.toString()) : undefined;
        if (!contact) return recording;
        const current = { ...recording, contactName: contact.name };
        return { ...current, standardizedDisplayName: buildRecordingDisplayName(current, recording.recordedAt) };
    });
}

/** One account-scoped lookup per batch; never reparses or writes historical recordings. */
export async function hydrateRecordingContacts<T extends Recording>(authSubject: string, recordings: T[]): Promise<T[]> {
    const ids = recordings.filter(recording => recording.authSubject === authSubject && recording.contactId)
        .map(recording => recording.contactId!);
    if (!ids.length) return recordings;
    const db = await getMongoDb();
    const contacts = await db.collection<Contact>(Collections.CONTACTS)
        .find({ authSubject, _id: { $in: ids } }).toArray();
    return applyCurrentContactNames(recordings, contacts, authSubject);
}
