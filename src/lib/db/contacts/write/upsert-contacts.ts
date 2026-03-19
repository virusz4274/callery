import { ObjectId } from 'mongodb';
import { Collections, getMongoDb } from '@/lib/mongodb';
import { incrementContactCount } from '../../users';
import type { Contact } from '../../types';
import type { UpsertContactInput } from '../types';
import { linkRecordingsToContact } from '../link';

/**
 * Upsert multiple contacts (create/update based on Google ID and phone numbers).
 */
export async function upsertContacts(
    firebaseUid: string,
    contacts: UpsertContactInput[]
): Promise<{ created: number; updated: number }> {
    const db = await getMongoDb();
    const collection = db.collection<Contact>(Collections.CONTACTS);
    const recordingsCollection = db.collection(Collections.RECORDINGS);
    const now = new Date();

    let created = 0;
    let updated = 0;

    const existingContacts = await collection.find({ firebaseUid }).toArray();
    const googleIdMap = new Map<string, Contact>();
    const phoneMap = new Map<string, Contact>();

    existingContacts.forEach((existingContact) => {
        if (existingContact.googleContactId) {
            googleIdMap.set(existingContact.googleContactId, existingContact);
        }

        if (existingContact.phoneNumbers && Array.isArray(existingContact.phoneNumbers)) {
            existingContact.phoneNumbers.forEach((phone) => {
                if (!phoneMap.has(phone)) {
                    phoneMap.set(phone, existingContact);
                }
            });
        }
    });

    const batchProcessedPhones = new Map<string, ObjectId>();
    const batchProcessedGoogleIds = new Map<string, ObjectId>();
    const mergePhoneNumbers = (...phoneGroups: Array<string[] | undefined>): string[] =>
        [...new Set(phoneGroups.flatMap((phoneGroup) => phoneGroup || []).filter(Boolean))];

    for (const contact of contacts) {
        const [firstName, ...lastNameParts] = contact.name.split(' ');
        const lastName = lastNameParts.join(' ');

        let googleMatchId: ObjectId | undefined;
        let googleMatchDoc: Contact | undefined;

        if (contact.googleContactId) {
            if (batchProcessedGoogleIds.has(contact.googleContactId)) {
                googleMatchId = batchProcessedGoogleIds.get(contact.googleContactId);
            } else if (googleIdMap.has(contact.googleContactId)) {
                googleMatchDoc = googleIdMap.get(contact.googleContactId);
                googleMatchId = googleMatchDoc?._id;
            }
        }

        let phoneMatchId: ObjectId | undefined;
        let phoneMatchDoc: Contact | undefined;

        if (contact.phoneNumbers && contact.phoneNumbers.length > 0) {
            for (const phone of contact.phoneNumbers) {
                if (batchProcessedPhones.has(phone)) {
                    phoneMatchId = batchProcessedPhones.get(phone);
                    break;
                }

                if (phoneMap.has(phone)) {
                    const found = phoneMap.get(phone);
                    if (found && (!googleMatchId || !found._id.equals(googleMatchId))) {
                        phoneMatchDoc = found;
                        phoneMatchId = found._id;
                        break;
                    }
                }
            }
        }

        const contactData = {
            name: contact.name,
            email: contact.email || '',
            googleContactId: contact.googleContactId,
            jobTitle: contact.jobTitle || undefined,
            company: contact.company || undefined,
            firstName: firstName || '',
            lastName: lastName || '',
            updatedAt: now,
        };

        let targetId: ObjectId | undefined;

        let finalPhoneNumbers = contact.phoneNumbers || [];

        if (googleMatchId && phoneMatchId && !googleMatchId.equals(phoneMatchId)) {
            if (phoneMatchDoc) {
                finalPhoneNumbers = mergePhoneNumbers(
                    finalPhoneNumbers,
                    googleMatchDoc?.phoneNumbers,
                    phoneMatchDoc.phoneNumbers
                );

                await recordingsCollection.updateMany(
                    { contactId: phoneMatchDoc._id },
                    {
                        $set: {
                            contactId: googleMatchId,
                            contactName: contact.name,
                        },
                    }
                );

                await collection.deleteOne({ _id: phoneMatchDoc._id });
                updated++;

                if (phoneMatchDoc.phoneNumbers) {
                    phoneMatchDoc.phoneNumbers.forEach((phone) => phoneMap.delete(phone));
                }

                await incrementContactCount(firebaseUid, -1);
            }

            targetId = googleMatchId;
        } else if (googleMatchId) {
            targetId = googleMatchId;
        } else if (phoneMatchId) {
            targetId = phoneMatchId;
        }

        if (targetId) {
            finalPhoneNumbers = mergePhoneNumbers(
                finalPhoneNumbers,
                googleMatchDoc?.phoneNumbers,
                phoneMatchDoc?.phoneNumbers
            );

            await collection.updateOne(
                { _id: targetId },
                {
                    $set: contactData,
                    $addToSet: { phoneNumbers: { $each: finalPhoneNumbers } },
                }
            );
            updated++;

            if (finalPhoneNumbers.length > 0) {
                await linkRecordingsToContact(targetId, finalPhoneNumbers, firebaseUid);
            }
        } else {
            const result = await collection.insertOne({
                ...contactData,
                firebaseUid,
                createdAt: now,
                phoneNumbers: finalPhoneNumbers,
                totalRecordings: 0,
                lastRecordingAt: null,
            } as Contact);

            targetId = result.insertedId;
            created++;

            if (finalPhoneNumbers.length > 0) {
                await linkRecordingsToContact(targetId, finalPhoneNumbers, firebaseUid);
            }
        }

        if (targetId) {
            if (contact.googleContactId) {
                batchProcessedGoogleIds.set(contact.googleContactId, targetId);
            }
            finalPhoneNumbers.forEach((phone) => batchProcessedPhones.set(phone, targetId));
        }
    }

    if (created > 0) {
        await incrementContactCount(firebaseUid, created);
    }

    return { created, updated };
}
