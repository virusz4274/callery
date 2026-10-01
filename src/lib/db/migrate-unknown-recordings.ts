import { ObjectId } from 'mongodb';
import { getMongoDb, Collections } from '@/lib/mongodb';
import { Recording } from '@/lib/db/types';
import { copyR2Object, deleteFromR2, sanitizePhoneNumber } from '@/lib/r2';

/**
 * Migrate recordings from unknown_{phoneNumber} folder to proper {contactId} folder
 * when a contact is saved.
 * 
 * @param authSubject - User's Firebase UID
 * @param contactId - The newly created/saved contact ID
 * @param phoneNumbers - Array of phone numbers for the contact
 * @param contactName - Optional contact name for name-based matching
 */
export async function migrateUnknownRecordingsToContact(
    authSubject: string,
    contactId: string,
    phoneNumbers: string[],
    contactName?: string
): Promise<number> {
    if ((!phoneNumbers || phoneNumbers.length === 0) && !contactName) {
        return 0;
    }

    const db = await getMongoDb();
    const recordingsCollection = db.collection<Recording>(Collections.RECORDINGS);

    let migratedCount = 0;

    // 1. Migrate by Phone Number
    if (phoneNumbers && phoneNumbers.length > 0) {
        for (const phoneNumber of phoneNumbers) {
            const sanitizedPhone = sanitizePhoneNumber(phoneNumber);
            const unknownFolderPrefix = `${authSubject}/unknown_${sanitizedPhone}/`;

            // Find all recordings in the unknown_{phoneNumber} folder
            const unknownRecordings = await recordingsCollection.find({
                authSubject,
                r2Key: { $regex: `^${unknownFolderPrefix.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}` },
            }).toArray();

            console.log(`Found ${unknownRecordings.length} recordings for unknown phone ${phoneNumber}`);

            for (const recording of unknownRecordings) {
                try {
                    // Extract the file path after the unknown folder
                    // Old key: {authSubject}/unknown_{phoneNumber}/{year}/{month}/{filename}
                    // New key: {authSubject}/{contactId}/{year}/{month}/{filename}
                    const pathAfterUnknown = recording.r2Key.substring(unknownFolderPrefix.length);
                    const newR2Key = `${authSubject}/${contactId}/${pathAfterUnknown}`;

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
    }

    // 2. Migrate by Contact Name (Case-Insensitive)
    if (contactName) {
        // Find recordings where contactId is null AND contactName matches
        // We use a case-insensitive regex for the name
        const nameRegex = new RegExp(`^${contactName.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}$`, 'i');

        try {
            const unknownNameRecordings = await recordingsCollection.find({
                authSubject,
                contactId: null,
                contactName: { $regex: nameRegex }
            }).toArray();

            console.log(`Found ${unknownNameRecordings.length} recordings for contact name match "${contactName}"`);

            for (const recording of unknownNameRecordings) {
                try {
                    // Start new key path
                    const parts = recording.r2Key.split('/');
                    if (parts.length < 4) {
                        console.warn(`Skipping malformed R2 key: ${recording.r2Key}`);
                        continue;
                    }

                    // expected: [uid, folder, year, month, filename]
                    // we want to replace 'folder' with 'contactId'
                    const filename = parts.pop();
                    const month = parts.pop();
                    const year = parts.pop();
                    // what remains is the prefix path, likely just uid and folder

                    const newR2Key = `${authSubject}/${contactId}/${year}/${month}/${filename}`;

                    // Copy R2 object to new location (preserving metadata)
                    await copyR2Object(recording.r2Key, newR2Key);

                    // Update MongoDB record
                    await recordingsCollection.updateOne(
                        { _id: recording._id },
                        {
                            $set: {
                                r2Key: newR2Key,
                                contactId: new ObjectId(contactId),
                                // Standardize name if it was just a partial match/different case
                                contactName: contactName,
                                updatedAt: new Date(),
                            },
                        }
                    );

                    // Delete old R2 object
                    await deleteFromR2(recording.r2Key);

                    migratedCount++;
                    console.log(`Migrated recording ${recording._id} (name match) from ${recording.r2Key} to ${newR2Key}`);
                } catch (error) {
                    console.error(`Failed to migrate recording ${recording._id} (name match):`, error);
                }
            }
        } catch (err) {
            console.error(`Error migrating by name for ${contactName}:`, err);
        }
    }

    // Name-matched recordings were linked AFTER the contact's stats were last
    // computed, so recompute them (phone-matched rows are unaffected — the
    // aggregate is idempotent).
    if (migratedCount > 0) {
        try {
            const cId = new ObjectId(contactId);
            const stats = await recordingsCollection.aggregate([
                { $match: { authSubject, contactId: cId } },
                {
                    $group: {
                        _id: null,
                        count: { $sum: 1 },
                        lastRecording: { $max: '$recordedAt' },
                    },
                },
            ]).toArray();
            await db.collection(Collections.CONTACTS).updateOne(
                { _id: cId },
                {
                    $set: {
                        totalRecordings: stats[0]?.count || 0,
                        lastRecordingAt: stats[0]?.lastRecording || null,
                        updatedAt: new Date(),
                    },
                }
            );
        } catch (err) {
            console.error(`Failed to recompute contact stats after migration for ${contactId}:`, err);
        }
    }

    return migratedCount;
}
