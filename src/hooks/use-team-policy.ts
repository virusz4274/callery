'use client';
import useSWR from 'swr';
import type { TeamSettings } from '@/lib/team-config';
import { useUser } from '@/lib/auth/client';
import { useUserProfile } from './use-user-profile';

export function useTeamPolicy() {
    const { data } = useSWR<{ team?: TeamSettings }>('/api/system-settings/public', async url => {
        const response = await fetch(url);
        if (!response.ok) throw new Error('Company settings unavailable');
        return response.json();
    }, { revalidateOnFocus: true });
    return data?.team ?? null;
}

export function useCanDeleteRecording() {
    const team = useTeamPolicy();
    const { user } = useUser();
    const { userProfile } = useUserProfile(user);
    return !team || userProfile?.role === 'admin';
}
