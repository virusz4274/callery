import { useState, useRef, useEffect } from 'react';
import { useForm } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import { z } from 'zod';
import { authFetch } from '@/lib/api-client';
import { useToast } from '@/components/toast-provider';
import type { User as UserProfile } from '@/lib/types'; // Assuming User type is here or passed in

const profileFormSchema = z.object({
    firstName: z.string().min(1, 'First name is required'),
    lastName: z.string().min(1, 'Last name is required'),
});

export function useProfileSettings(user: any, userProfile: UserProfile | null) {
    const { toast } = useToast();
    const [isSavingProfile, setSavingProfile] = useState(false);

    const profileForm = useForm<z.infer<typeof profileFormSchema>>({
        resolver: zodResolver(profileFormSchema),
        defaultValues: { firstName: '', lastName: '' },
    });

    const lastProfileRef = useRef('');

    // Sync state with profile
    useEffect(() => {
        if (userProfile) {
            const profileHash = JSON.stringify({
                firstName: userProfile.firstName,
                lastName: userProfile.lastName,
            });

            if (profileHash === lastProfileRef.current) return;
            lastProfileRef.current = profileHash;

            if (!profileForm.formState.isDirty) {
                profileForm.reset({
                    firstName: userProfile.firstName || '',
                    lastName: userProfile.lastName || '',
                });
            }
        }
    }, [userProfile, profileForm]);

    const handleUpdateProfile = async (values: z.infer<typeof profileFormSchema>) => {
        if (!user) return;
        setSavingProfile(true);
        try {
            const response = await authFetch('/api/user/profile', {
                method: 'PATCH',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ firstName: values.firstName, lastName: values.lastName }),
            });
            if (!response.ok) {
                const data = await response.json().catch(() => null);
                throw new Error(data?.error || 'Failed to update profile');
            }
            toast({ title: 'Profile Updated', status: 'success' });
        } catch (error: unknown) {
            toast({ title: 'Update Failed', description: error instanceof Error ? error.message : 'Unknown error', status: 'danger' });
        } finally {
            setSavingProfile(false);
        }
    };

    return {
        profileForm,
        isSavingProfile,
        handleUpdateProfile
    };
}
