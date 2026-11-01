import { useState } from 'react';
import type { AppUser } from '@/lib/auth/types';
import { zodResolver } from '@hookform/resolvers/zod';
import { z } from 'zod';
import { useToast } from '@/components/toast-provider';
import type { User as UserProfile } from '@/lib/types';
import { useSettingsForm } from './use-settings-form';
import { useProfileSave } from './use-profile-save';

const profileFormSchema = z.object({
    firstName: z.string().min(1, 'First name is required'),
    lastName: z.string().min(1, 'Last name is required'),
});

export function useProfileSettings(user: AppUser | null, userProfile: UserProfile | null) {
    const { toast } = useToast();
    const [isSavingProfile, setSavingProfile] = useState(false);

    const saveProfile = useProfileSave(user?.id);
    const { form: profileForm } = useSettingsForm(user?.id, {
        firstName: userProfile?.firstName || '', lastName: userProfile?.lastName || '',
    }, {
        resolver: zodResolver(profileFormSchema),
    });

    const handleUpdateProfile = async (values: z.infer<typeof profileFormSchema>) => {
        if (!user || isSavingProfile) return;
        setSavingProfile(true);
        try {
            if (!await saveProfile(values)) return;
            profileForm.reset(values, { keepDirtyValues: false });
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
