
import { doc, getDoc, setDoc, serverTimestamp, Firestore } from 'firebase/firestore';
import type { User } from 'firebase/auth';

/**
 * Ensures a user profile document exists in Firestore.
 * If it doesn't, it creates one with default values.
 * 
 * @param firestore - The Firestore instance.
 * @param user - The Firebase Auth user object.
 * @param name - Optional first and last name for new profiles.
 * @returns {Promise<boolean>} - A promise that resolves to `true` if a new profile was created, and `false` otherwise.
 */
export async function ensureUserProfile(firestore: Firestore, user: User, name?: {firstName: string, lastName: string}): Promise<boolean> {
    const userRef = doc(firestore, 'users', user.uid);
    const userDocSnap = await getDoc(userRef);

    if (!userDocSnap.exists()) {
        const [displayNameFirst, ...displayNameLast] = user.displayName?.split(' ') || [];
        const userProfile = {
            id: user.uid,
            email: user.email,
            firstName: name?.firstName || displayNameFirst || '',
            lastName: name?.lastName || displayNameLast.join(' ') || '',
            createdAt: serverTimestamp(),
            role: 'user',
            plan: 'Free',
            storageUsed: 0,
            storageAllocation: 0.1, // Free tier
            transcriptionUsed: 0,
            transcriptionAllocation: 15, // Free tier
            timezone: Intl.DateTimeFormat().resolvedOptions().timeZone,
            notificationSettings: {
                activityDigest: 'weekly',
                ingestSuccess: true,
                ingestFail: true,
            },
            storageSettings: {
                deletionPolicy: 'never',
            }
        };
        await setDoc(userRef, userProfile);
        return true; // Profile was created
    }
    return false; // Profile already existed
}
