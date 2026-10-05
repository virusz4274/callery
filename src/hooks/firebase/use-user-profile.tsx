'use client';
import useSWR from 'swr';
import type { AppUser as FirebaseUser } from '@/lib/auth/types';
import type { User } from '@/lib/types';
import { authFetch } from '@/lib/api-client';

export interface EnsureUserProfileResult {
    success: boolean;
    wasCreated: boolean;
    status?: number;
    error?: string;
}

export function useUserProfile(user: FirebaseUser | null) {
    const { data, error, isLoading, mutate } = useSWR<User>(
        user ? ['user-profile', user.id] : null,
        async () => {
            let response = await authFetch('/api/user/profile');
            if (response.status === 404 && user) {
                const result = await ensureUserProfile(user);
                if (!result.success) throw new Error(result.error || 'Account setup failed');
                response = await authFetch('/api/user/profile');
            }
            if (!response.ok) throw new Error('Failed to fetch user profile');
            return (await response.json()).profile as User;
        },
        { errorRetryCount: 3, errorRetryInterval: 1000, revalidateOnFocus: true },
    );
    return {
        userProfile: user ? data ?? null : null,
        isProfileLoading: !!user && isLoading,
        profileError: error instanceof Error ? error : null,
        refetch: async () => { await mutate(); },
    };
}

export async function ensureUserProfile(
    user: FirebaseUser,
    additionalData?: { firstName?: string; lastName?: string }
): Promise<EnsureUserProfileResult> {
    try {
        const response = await authFetch('/api/user/ensure-profile', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
                authSubject: user.id,
                email: user.email,
                displayName: user.name,
                firstName: additionalData?.firstName,
                lastName: additionalData?.lastName,
            }),
        });

        if (!response.ok) {
            const errorData = await response.json().catch(() => ({}));
            console.error('Failed to ensure user profile:', errorData.details || errorData.error || response.statusText);
            return {
                success: false,
                wasCreated: false,
                status: response.status,
                error: errorData.details || errorData.error || response.statusText,
            };
        }

        const data = await response.json();
        return {
            success: true,
            wasCreated: Boolean(data.wasCreated),
        };
    } catch (error) {
        console.error('Error ensuring user profile:', error);
        return {
            success: false,
            wasCreated: false,
            error: error instanceof Error ? error.message : 'Unknown error',
        };
    }
}
