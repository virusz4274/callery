'use client';

import { useState, useEffect } from 'react';
import type { User } from 'firebase/auth';
import { authFetch } from '@/lib/api-client';

interface UserProfile {
    id: string;
    firebaseUid: string;
    email: string;
    firstName: string;
    lastName: string;
    name: string;
    phoneNumber: string;
    createdAt: string;
    role: 'user' | 'admin';
    plan: 'Free' | 'Pro';
    timezone: string;
    notificationSettings: {
        activityDigest: 'off' | 'weekly' | 'monthly';
        ingestSuccess: boolean;
        ingestFail: boolean;
    };
    storageSettings: {
        deletionPolicy: 'never' | '3m' | '6m' | '1y';
    };
    storageUsed: number;
    storageAllocation: number;
    transcriptionUsed: number;
    transcriptionAllocation: number;
}

interface UseUserProfileResult {
    userProfile: UserProfile | null;
    isProfileLoading: boolean;
    profileError: Error | null;
    refetch: () => Promise<void>;
}

/**
 * Hook to fetch the user profile from MongoDB via API.
 * @param user The Firebase Auth user object.
 */
export function useUserProfile(user: User | null): UseUserProfileResult {
    const [userProfile, setUserProfile] = useState<UserProfile | null>(null);
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
            const response = await authFetch('/api/user/profile');

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
