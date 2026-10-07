import type { Db, AnyBulkWriteOperation } from 'mongodb';
import { Collections, getMongoDb } from '@/lib/mongodb';
import type { Contact, Recording } from '../types';
import { buildRecordingContactUpdate, createRecordingContactResolver } from './resolve-recording-contact';

/** Reconcile stored caller metadata only. No filename reparsing or object-storage operations. */
export async function reconcileRecordingContacts(
    authSubject: string,
    contacts: Contact[],
    previousContacts: Contact[] = [],
    db: Db | undefined = undefined,
): Promise<void> {
    const database = db ?? await getMongoDb();
    const collection = database.collection<Recording>(Collections.RECORDINGS);
    const resolve = createRecordingContactResolver(authSubject, contacts);
    const previous = new Map(previousContacts.filter(contact => contact.authSubject === authSubject)
        .map(contact => [contact._id.toString(), contact]));
    let writes: AnyBulkWriteOperation<Recording>[] = [];
    const flush = async () => {
        if (writes.length) await collection.bulkWrite(writes, { ordered: false });
        writes = [];
    };
    for await (const recording of collection.find({ authSubject })) {
        const contact = resolve(recording);
        // Leave unlinked historical metadata alone when it still has no match.
        if (!contact && !recording.contactId) continue;
        const lastName = recording.contactId
            ? previous.get(recording.contactId.toString())?.name ?? recording.contactName : recording.contactName;
        const update = buildRecordingContactUpdate(recording, contact, lastName);
        const changed = recording.contactId?.toString() !== update.contactId?.toString() ||
            recording.contactName !== update.contactName || recording.phoneNumber !== update.phoneNumber ||
            recording.standardizedDisplayName !== update.standardizedDisplayName;
        if (!changed) continue;
        writes.push({ updateOne: {
            filter: { _id: recording._id, authSubject, updatedAt: recording.updatedAt },
            update: { $set: { ...update, updatedAt: new Date() } },
        } });
        if (writes.length >= 500) await flush();
    }
    await flush();

    // Include archived calls and reset zero counts, using one aggregation for the account.
    const stats = await collection.aggregate<{ _id: Contact['_id']; count: number; last: Date }>([
        { $match: { authSubject, contactId: { $ne: null } } },
        { $group: { _id: '$contactId', count: { $sum: 1 }, last: { $max: '$recordedAt' } } },
    ]).toArray();
    const statsById = new Map(stats.map(stat => [stat._id.toString(), stat]));
    const owned = contacts.filter(contact => contact.authSubject === authSubject);
    if (owned.length) await database.collection<Contact>(Collections.CONTACTS).bulkWrite(owned.map(contact => {
        const stat = statsById.get(contact._id.toString());
        return { updateOne: {
            filter: { _id: contact._id, authSubject },
            update: { $set: { totalRecordings: stat?.count ?? 0, lastRecordingAt: stat?.last ?? null } },
        } };
    }));
}
