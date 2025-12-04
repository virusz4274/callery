'use server';

import { getFirebaseAdminApp } from '@/firebase/admin';
import { getFirestore, FieldValue } from 'firebase-admin/firestore';

type ContactData = {
    name: string;
    phoneNumber: string;
    email: string | null;
};

/**
 * Saves or updates contacts in a user's subcollection in Firestore.
 * @param userId The ID of the user.
 * @param contacts An array of contact data to be saved.
 */
export async function saveContactsToFirestore(userId: string, contacts: ContactData[]): Promise<void> {
    if (!userId) {
        throw new Error("User ID is required to save contacts.");
    }
    if (!contacts || contacts.length === 0) {
        return; // Nothing to save
    }

    const adminApp = getFirebaseAdminApp();
    const firestore = getFirestore(adminApp);
    const batch = firestore.batch();

    const contactsCollectionRef = firestore.collection('users').doc(userId).collection('contacts');

    // We'll use phone number as a pseudo-unique ID for this batch operation.
    // In a real-world scenario, you might want a more robust way to handle updates vs. creates.
    const existingContactsSnapshot = await contactsCollectionRef.get();
    const existingContactsMap = new Map(existingContactsSnapshot.docs.map(doc => [doc.data().phoneNumber, doc.id]));

    for (const contact of contacts) {
        const existingDocId = existingContactsMap.get(contact.phoneNumber);
        const [firstName, ...lastNameParts] = contact.name.split(' ');
        const lastName = lastNameParts.join(' ');

        const contactDocData = {
            userId: userId,
            name: contact.name,
            phoneNumber: contact.phoneNumber,
            email: contact.email || '',
            // Set default values for fields that might not be present in Google Contact
            firstName: firstName || '',
            lastName: lastName || '',
            createdAt: FieldValue.serverTimestamp(),
            role: 'user', // Default role
            plan: 'Free', // Default plan
            storageUsed: 0,
            storageAllocation: 0,
            transcriptionUsed: 0,
            transcriptionAllocation: 0,
            timezone: '',
            notificationSettings: {
                activityDigest: 'weekly',
                ingestSuccess: true,
                ingestFail: true,
            },
            storageSettings: {
                deletionPolicy: 'never',
            }
        };

        if (existingDocId) {
            // Update existing contact
            const docRef = contactsCollectionRef.doc(existingDocId);
            batch.update(docRef, {
                name: contact.name,
                email: contact.email,
                firstName: firstName,
                lastName: lastName
            });
        } else {
            // Create new contact
            const newDocRef = contactsCollectionRef.doc(); // Firestore generates a new ID
            batch.set(newDocRef, { ...contactDocData, id: newDocRef.id });
        }
    }

    await batch.commit();
}
