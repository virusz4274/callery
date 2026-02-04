import { getMongoDb, Collections } from '@/lib/mongodb';
import { ObjectId } from 'mongodb';
import { Recording } from '@/lib/db/types';

/**
 * Migrates recordings that match a contact's phone number but are not linked to any contact.
 * This is typically run after a new contact is created.
 */
export async function migrateUnknownRecordingsToContact(
    firebaseUid: string,
    contactId: string,
    phoneNumbers: string[],
    contactName: string
): Promise<number> {
    const db = await getMongoDb();
    
    // Clean phone numbers for matching (strip non-digits, etc if needed, 
    // but typically we match exact string as stored)
    // Assuming phoneNumbers are already standardized or we match loosely.
    // For now, exact match on the 'phoneNumber' field.

    const result = await db.collection<Recording>(Collections.RECORDINGS).updateMany(
        {
            firebaseUid,
            phoneNumber: { $in: phoneNumbers },
            contactId: null // Only migrate if not already linked
        },
        {
            $set: {
                contactId: new ObjectId(contactId),
                contactName: contactName,
                updatedAt: new Date()
            }
        }
    );

    if (result.modifiedCount > 0) {
        // We should also update the contact's stats (recording count)
        // circular dependency risk if we import from contacts.ts directly?
        // Let's rely on manual update or a separate helper.
        
        // Dynamic import to break potential cycles if this function is called from contacts.ts
        const { incrementContactRecordings } = await import('@/lib/db/contacts');
        
        // We don't know the exact date distribution of the migrated recordings easily 
        // without another query. For simplicity, we just increment the count 
        // and set the lastRecordingAt to now (or we could find the latest).
        
        // Let's find the latest recording date among the migrated ones
        const latestRecording = await db.collection<Recording>(Collections.RECORDINGS)
            .find({ 
                firebaseUid, 
                contactId: new ObjectId(contactId) 
            })
            .sort({ recordedAt: -1 })
            .limit(1)
            .next();

        await incrementContactRecordings(
            contactId, 
            firebaseUid, 
            latestRecording?.recordedAt || new Date(), 
            result.modifiedCount
        );
    }

    return result.modifiedCount;
}
