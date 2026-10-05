import type { ObjectId } from 'mongodb';
import { Collections, getMongoDb } from '@/lib/mongodb';
import { setContactCount } from '../users';

export async function clearContactsForUser(authSubject: string): Promise<void> {
    const db = await getMongoDb();
    const existingContacts = await db
        .collection(Collections.CONTACTS)
        .find({ authSubject })
        .project<{ _id: ObjectId }>({ _id: 1 })
        .toArray();

    const contactIds = existingContacts.map((contact) => contact._id);

    if (contactIds.length > 0) {
        await db.collection(Collections.RECORDINGS).updateMany(
            {
                authSubject,
                contactId: { $in: contactIds },
            },
            {
                $set: {
                    contactId: null,
                    contactName: null,
                },
            }
        );
    }

    await db.collection(Collections.CONTACTS).deleteMany({ authSubject });
    await setContactCount(authSubject, 0);
}
