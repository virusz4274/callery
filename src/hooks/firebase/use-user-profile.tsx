'use client';

import { useState, useEffect, useRef } from 'react';
import type { AppUser } from '@/lib/auth/types';
import type { User } from '@/lib/types';
import { authFetch } from '@/lib/api-client';

const MAX_RETRIES = 3;

interface UseUserProfileResult {
    userProfile: User | null;
    isProfileLoading: boolean;
    profileError: Error | null;
    refetch: () => Promise<void>;
}

/**
 * Hook to fetch the user profile from MongoDB via API.
 * @param user The provider-agnostic auth user object.
 */
export function useUserProfile(user: AppUser | null): UseUserProfileResult {
    const [userProfile, setUserProfile] = useState<User | null>(null);
    const [isProfileLoading, setIsProfileLoading] = useState(true);
    const [profileError, setProfileError] = useState<Error | null>(null);
    const retryCount = useRef(0);

    const fetchProfile = async () => {
        if (!user) {
            setUserProfile(null);
            setIsProfileLoading(false);
            retryCount.current = 0;
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
                    retryCount.current = 0;
                    return;
                }
                throw new Error('Failed to fetch user profile');
            }

            const data = await response.json();
            setUserProfile(data.profile);
            retryCount.current = 0; // Reset on success
        } catch (err) {
            console.error('Error fetching user profile:', err);
            setProfileError(err instanceof Error ? err : new Error('Unknown error'));
            setUserProfile(null);
        } finally {
            setIsProfileLoading(false);
        }
    };

    useEffect(() => {
        retryCount.current = 0; // Reset retry count when user changes
        fetchProfile();
        // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [user?.id]);

    // Bounded retry logic - only retry if under max attempts
    useEffect(() => {
        if (profileError && retryCount.current < MAX_RETRIES) {
            const delay = 500 * Math.pow(2, retryCount.current); // Exponential backoff
            const timer = setTimeout(() => {
                retryCount.current += 1;
                console.log(`Retrying profile fetch (attempt ${retryCount.current}/${MAX_RETRIES})...`);
                fetchProfile();
            }, delay);
            return () => clearTimeout(timer);
        } else if (profileError && retryCount.current >= MAX_RETRIES) {
            console.error(`Max retries (${MAX_RETRIES}) reached for fetching user profile. Giving up.`);
        }
        // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [profileError]);

    return {
        userProfile,
        isProfileLoading,
        profileError,
        refetch: fetchProfile,
    };
}


/**
 * Ensure user profile exists in MongoDB.
 * Called after auth login (any provider).
 */
export async function ensureUserProfile(
    user: { id: string; email: string | null; name?: string | null },
    additionalData?: { firstName?: string; lastName?: string }
): Promise<boolean> {
    try {
        const response = await authFetch('/api/user/ensure-profile', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
                authSubject: user.id,
                email: user.email,
                displayName: user.name ?? null,
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
