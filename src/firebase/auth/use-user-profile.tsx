'use client';

import { useMemo } from 'react';
import { useFirestore, useDoc, useMemoFirebase } from '@/firebase';
import { doc } from 'firebase/firestore';
import type { User } from 'firebase/auth';

// Assuming a UserProfile type is defined somewhere, e.g., in src/lib/types.ts
// If not, you can define it here.
interface UserProfile {
    id: string;
    email: string;
    firstName: string;
    lastName: string;
    createdAt: any; // Firestore Timestamp
    role: 'user' | 'admin';
}

/**
 * A hook to fetch the Firestore profile data for a given Firebase Auth user.
 * @param user The user object from Firebase Auth (e.g., from `useUser()`).
 * @returns An object containing the user's profile data and loading state.
 */
export function useUserProfile(user: User | null) {
    const firestore = useFirestore();

    const userProfileRef = useMemoFirebase(() => {
        // Only create a reference if we have a user and a firestore instance.
        if (user && firestore) {
            return doc(firestore, 'users', user.uid);
        }
        return null; // Return null if user or firestore is not available
    }, [user, firestore]);

    const { data: userProfile, isLoading: isProfileLoading, error: profileError } = useDoc<UserProfile>(userProfileRef);

    return { userProfile, isProfileLoading, profileError };
}
