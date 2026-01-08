'use client';

import { useState, useEffect } from 'react';
import type { User as FirebaseUser } from 'firebase/auth';
import type { User } from '@/lib/types';
import { authFetch } from '@/lib/api-client';

interface UseUserProfileResult {
    userProfile: User | null;
    isProfileLoading: boolean;
    profileError: Error | null;
    refetch: () => Promise<void>;
}

/**
 * Hook to fetch the user profile from MongoDB via API.
 * @param user The Firebase Auth user object.
 */
export function useUserProfile(user: FirebaseUser | null): UseUserProfileResult {
    const [userProfile, setUserProfile] = useState<User | null>(null);
    const [isProfileLoading, setIsProfileLoading] = useState(true);
    const [profileError, setProfileError] = useState<Error | null>(null);

    const fetchProfile = async () => {
        if (!user) {
            setUserProfile(null);
            setIsProfileLoading(false);
            return;
        }

        setIsProfileLoading(true);
        setProfileError(null);

        try {
            let response = await authFetch('/api/user/profile');

            // Handle 404 (User not found in MongoDB) by attempting to create it
            if (response.status === 404) {
                console.log('User profile not found in MongoDB. Attempting to ensure profile...');
                const created = await ensureUserProfile(user);

                if (created) {
                    // Small delay to ensure DB write propagation
                    await new Promise(resolve => setTimeout(resolve, 500));
                    // Retry fetching the profile
                    response = await authFetch('/api/user/profile');
                } else {
                    throw new Error('Failed to create user profile');
                }
            }

            if (!response.ok) {
                if (response.status === 401) {
                    setUserProfile(null);
                    return;
                }
                throw new Error('Failed to fetch user profile');
            }

            const data = await response.json();
            setUserProfile(data.profile);
        } catch (err) {
            console.error('Error fetching user profile:', err);
            setProfileError(err instanceof Error ? err : new Error('Unknown error'));
            setUserProfile(null);
        } finally {
            setIsProfileLoading(false);
        }
    };

    useEffect(() => {
        fetchProfile();
        // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [user?.uid]);

    return {
        userProfile,
        isProfileLoading,
        profileError,
        refetch: fetchProfile,
    };
}

/**
 * Ensure user profile exists in MongoDB.
 * Called after Firebase Auth login.
 */
export async function ensureUserProfile(
    user: { uid: string; email: string | null; displayName: string | null },
    additionalData?: { firstName?: string; lastName?: string }
): Promise<boolean> {
    try {
        const response = await authFetch('/api/user/ensure-profile', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
                firebaseUid: user.uid,
                email: user.email,
                displayName: user.displayName,
                firstName: additionalData?.firstName,
                lastName: additionalData?.lastName,
            }),
        });

        if (!response.ok) {
            const errorData = await response.json().catch(() => ({}));
            console.error('Failed to ensure user profile:', errorData.details || errorData.error || response.statusText);
            return false;
        }

        const data = await response.json();
        return data.wasCreated;
    } catch (error) {
        console.error('Error ensuring user profile:', error);
        return false;
    }
}
