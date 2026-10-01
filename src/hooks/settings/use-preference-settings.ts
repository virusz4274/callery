import { useState, useCallback } from 'react';
import { authFetch } from '@/lib/api-client';
import { useToast } from '@/components/toast-provider';
import type { User as UserProfile } from '@/lib/types';
import type { TranscriptionProvider } from '@/lib/config';

export type GeneralState = { timezone: string };
export type DataState = {
    deletionPolicy: string;
    transcriptionSettings: { autoTranscribe: boolean; provider?: TranscriptionProvider };
};

export function usePreferenceSettings(user: any, userProfile: UserProfile | null) {
    const { toast } = useToast();

    // General State
    const [generalState, setGeneralState] = useState<GeneralState>({ timezone: '' });
    const [isSavingGeneral, setSavingGeneral] = useState(false);
    const [generalDirty, setGeneralDirty] = useState(false);

    // Data State
    const [dataState, setDataState] = useState<DataState>({
        deletionPolicy: 'never',
        transcriptionSettings: { autoTranscribe: true }
    });
    const [isSavingData, setSavingData] = useState(false);
    const [dataDirty, setDataDirty] = useState(false);

    // Any caller edit marks the form dirty so later profile loads can't
    // clobber it.
    const updateGeneralState = useCallback((value: React.SetStateAction<GeneralState>) => {
        setGeneralDirty(true);
        setGeneralState(value);
    }, []);
    const updateDataState = useCallback((value: React.SetStateAction<DataState>) => {
        setDataDirty(true);
        setDataState(value);
    }, []);

    // Render-time adjustment: seed from the loaded profile until the user edits.
    const profileKey = JSON.stringify({
        timezone: userProfile?.timezone ?? null,
        deletionPolicy: userProfile?.storageSettings?.deletionPolicy ?? null,
        transcriptionSettings: userProfile?.transcriptionSettings ?? null,
    });
    const [prevProfileKey, setPrevProfileKey] = useState(profileKey);
    if (prevProfileKey !== profileKey) {
        setPrevProfileKey(profileKey);
        if (userProfile) {
            if (!generalDirty) setGeneralState({ timezone: userProfile.timezone || '' });
            if (!dataDirty) {
                setDataState({
                    deletionPolicy: userProfile.storageSettings?.deletionPolicy || 'never',
                    transcriptionSettings: userProfile.transcriptionSettings || { autoTranscribe: true }
                });
            }
        }
    }

    const handleSaveGeneral = async () => {
        if (!user || !generalState.timezone) return;
        setSavingGeneral(true);
        try {
            const response = await authFetch('/api/user/profile', {
                method: 'PATCH',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ timezone: generalState.timezone }),
            });
            if (!response.ok) {
                const data = await response.json().catch(() => null);
                throw new Error(data?.error || 'Failed to save preferences');
            }
            toast({ title: 'Preferences Saved', status: 'success' });
            setGeneralDirty(false);
        } catch (error) {
            toast({
                title: 'Save Failed',
                description: error instanceof Error ? error.message : 'Please try again.',
                status: 'danger',
            });
        } finally { setSavingGeneral(false); }
    };

    const handleSaveData = async () => {
        setSavingData(true);
        try {
            const response = await authFetch('/api/user/profile', {
                method: 'PATCH',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({
                    storageSettings: { deletionPolicy: dataState.deletionPolicy },
                    transcriptionSettings: dataState.transcriptionSettings
                })
            });
            if (!response.ok) {
                const data = await response.json().catch(() => null);
                throw new Error(data?.error || 'Failed to save policy');
            }
            toast({ title: 'Policy Saved', status: 'success' });
            setDataDirty(false);
        } catch (error) {
            toast({
                title: 'Save Failed',
                description: error instanceof Error ? error.message : 'Please try again.',
                status: 'danger',
            });
        } finally { setSavingData(false); }
    };

    return {
        generalState,
        setGeneralState: updateGeneralState,
        isSavingGeneral,
        handleSaveGeneral,
        generalDirty,

        dataState,
        setDataState: updateDataState,
        isSavingData,
        handleSaveData,
        dataDirty
    };
}
