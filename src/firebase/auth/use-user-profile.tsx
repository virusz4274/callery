'use client';

import { useMemo } from 'react';
import { useFirestore, useDoc, useMemoFirebase } from '@/firebase';
import { doc } from 'firebase/firestore';
import type { User } from 'firebase/auth';
import type { Contact } from '@/lib/types';


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

    const { data: userProfile, isLoading: isProfileLoading, error: profileError } = useDoc<Contact>(userProfileRef);

    return { userProfile, isProfileLoading, profileError };
}
