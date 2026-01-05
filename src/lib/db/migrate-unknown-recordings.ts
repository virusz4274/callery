import { ObjectId } from 'mongodb';
import { getMongoDb, Collections } from '@/lib/mongodb';
import type { Recording } from '@/lib/db/types';
import { copyR2Object, deleteFromR2, generateRecordingKey, sanitizePhoneNumber } from '@/lib/r2';

/**
 * Migrate recordings from unknown_{phoneNumber} folder to proper {contactId} folder
 * when a contact is saved.
 * 
 * @param firebaseUid - User's Firebase UID
 * @param contactId - The newly created/saved contact ID
 * @param phoneNumbers - Array of phone numbers for the contact
 */
export async function migrateUnknownRecordingsToContact(
    firebaseUid: string,
    contactId: string,
    phoneNumbers: string[]
): Promise<number> {
    if (!phoneNumbers || phoneNumbers.length === 0) {
        return 0;
    }

    const db = await getMongoDb();
    const recordingsCollection = db.collection<Recording>(Collections.RECORDINGS);

    let migratedCount = 0;

    for (const phoneNumber of phoneNumbers) {
        const sanitizedPhone = sanitizePhoneNumber(phoneNumber);
        const unknownFolderPrefix = `${firebaseUid}/unknown_${sanitizedPhone}/`;

        // Find all recordings in the unknown_{phoneNumber} folder
        const unknownRecordings = await recordingsCollection.find({
            firebaseUid,
            r2Key: { $regex: `^${unknownFolderPrefix.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}` },
        }).toArray();

        console.log(`Found ${unknownRecordings.length} recordings for unknown phone ${phoneNumber}`);

        for (const recording of unknownRecordings) {
            try {
                // Extract the file path after the unknown folder
                // Old key: {firebaseUid}/unknown_{phoneNumber}/{year}/{month}/{filename}
                // New key: {firebaseUid}/{contactId}/{year}/{month}/{filename}
                const pathAfterUnknown = recording.r2Key.substring(unknownFolderPrefix.length);
                const newR2Key = `${firebaseUid}/${contactId}/${pathAfterUnknown}`;

                // Copy R2 object to new location (preserving metadata)
                await copyR2Object(recording.r2Key, newR2Key);

                // Update MongoDB record
                await recordingsCollection.updateOne(
                    { _id: recording._id },
                    {
                        $set: {
                            r2Key: newR2Key,
                            contactId: new ObjectId(contactId),
                            updatedAt: new Date(),
                        },
                    }
                );

                // Delete old R2 object
                await deleteFromR2(recording.r2Key);

                migratedCount++;
                console.log(`Migrated recording ${recording._id} from ${recording.r2Key} to ${newR2Key}`);
            } catch (error) {
                console.error(`Failed to migrate recording ${recording._id}:`, error);
            }
        }
    }

    return migratedCount;
}
