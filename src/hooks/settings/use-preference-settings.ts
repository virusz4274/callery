import { useState } from 'react';
import type { AppUser } from '@/lib/auth/types';
import { useToast } from '@/components/toast-provider';
import type { User as UserProfile } from '@/lib/types';
import { useSettingsForm } from './use-settings-form';
import { useProfileSave } from './use-profile-save';

export function usePreferenceSettings(user: AppUser | null, userProfile: UserProfile | null) {
    const { toast } = useToast();

    const saveProfile = useProfileSave(user?.id);
    const { form: generalForm, state: generalState, setState: setGeneralState } = useSettingsForm(user?.id, { timezone: userProfile?.timezone || '' });
    const [isSavingGeneral, setSavingGeneral] = useState(false);

    const { form: retentionForm, state: retentionState, setState: setRetentionState } = useSettingsForm(user?.id,
        { deletionPolicy: userProfile?.storageSettings.deletionPolicy || 'never' });
    const { form: processingForm, state: processingState, setState: setProcessingState } = useSettingsForm<Pick<UserProfile['transcriptionSettings'], 'autoTranscribe' | 'defaultProvider'>>(user?.id,
        { autoTranscribe: userProfile?.transcriptionSettings.autoTranscribe ?? true,
            defaultProvider: userProfile?.transcriptionSettings.defaultProvider });
    const dataState = { deletionPolicy: retentionState.deletionPolicy, transcriptionSettings: processingState };
    const setDataState = (next: { deletionPolicy: string; transcriptionSettings: typeof processingState }) => {
        setRetentionState({ deletionPolicy: next.deletionPolicy as UserProfile['storageSettings']['deletionPolicy'] });
        setProcessingState(next.transcriptionSettings);
    };
    const [isSavingData, setSavingData] = useState(false);

    const handleSaveGeneral = async () => {
        if (!user || isSavingGeneral || !generalState.timezone) return;
        const submitted = generalForm.getValues();
        setSavingGeneral(true);
        try {
            if (!await saveProfile(submitted)) return;
            generalForm.reset(submitted, { keepDirtyValues: false });
            toast({ title: 'Preferences Saved', status: 'success' });
        } catch (error) {
            toast({
                title: 'Save Failed',
                description: error instanceof Error ? error.message : 'Failed to save preferences',
                status: 'danger',
            });
        } finally { setSavingGeneral(false); }
    };

    const handleSaveData = async (section: 'processing' | 'retention') => {
        if (!user || isSavingData) return;
        const retention = retentionForm.getValues(), processing = processingForm.getValues();
        setSavingData(true);
        try {
            if (!await saveProfile(section === 'retention' ? { storageSettings: retention } : { transcriptionSettings: processing })) return;
            if (section === 'retention') retentionForm.reset(retention, { keepDirtyValues: false });
            else processingForm.reset(processing, { keepDirtyValues: false });
            toast({ title: 'Policy Saved', status: 'success' });
        } catch (error) {
            toast({
                title: 'Save Failed',
                description: error instanceof Error ? error.message : 'Failed to save data policy',
                status: 'danger',
            });
        } finally { setSavingData(false); }
    };

    return {
        generalState,
        setGeneralState,
        isSavingGeneral,
        handleSaveGeneral,

        dataState,
        setDataState,
        isSavingData,
        handleSaveData,
    };
}
