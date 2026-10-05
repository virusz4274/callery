import { useState, useRef, useEffect } from 'react';
import type { AppUser as FirebaseUser } from '@/lib/auth/types';
import { authFetch } from '@/lib/api-client';
import { useToast } from '@/components/toast-provider';
import type { User as UserProfile } from '@/lib/types';

async function getErrorMessage(response: Response, fallback: string): Promise<string> {
    try {
        const data = (await response.json()) as { error?: string };
        return data.error || fallback;
    } catch {
        return fallback;
    }
}

export function usePreferenceSettings(user: FirebaseUser | null, userProfile: UserProfile | null) {
    const { toast } = useToast();

    // General State
    const [generalState, setGeneralState] = useState({ timezone: '' });
    const [isSavingGeneral, setSavingGeneral] = useState(false);
    const generalDirtyRef = useRef(false);

    // Data State
    const [dataState, setDataState] = useState<{
        deletionPolicy: string;
        transcriptionSettings: { autoTranscribe: boolean; defaultProvider?: UserProfile['transcriptionSettings']['defaultProvider'] };
    }>({
        deletionPolicy: 'never',
        transcriptionSettings: { autoTranscribe: true, defaultProvider: 'soniox' }
    });
    const [isSavingData, setSavingData] = useState(false);
    const dataDirtyRef = useRef(false);

    useEffect(() => {
        if (userProfile) {
            if (!generalDirtyRef.current) setGeneralState({ timezone: userProfile.timezone || '' });
            if (!dataDirtyRef.current) {
                setDataState({
                    deletionPolicy: userProfile.storageSettings?.deletionPolicy || 'never',
                    transcriptionSettings: {
                        autoTranscribe: userProfile.transcriptionSettings?.autoTranscribe ?? true,
                        defaultProvider:
                            userProfile.transcriptionSettings?.defaultProvider === 'elevenlabs'
                                ? 'elevenlabs'
                                : 'soniox',
                    },
                });
            }
        }
    }, [userProfile]);

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
                throw new Error(await getErrorMessage(response, 'Failed to save preferences'));
            }
            toast({ title: 'Preferences Saved', status: 'success' });
            generalDirtyRef.current = false;
        } catch (error) {
            toast({
                title: 'Save Failed',
                description: error instanceof Error ? error.message : 'Failed to save preferences',
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
                throw new Error(await getErrorMessage(response, 'Failed to save data policy'));
            }
            toast({ title: 'Policy Saved', status: 'success' });
            dataDirtyRef.current = false;
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
        generalDirtyRef,

        dataState,
        setDataState,
        isSavingData,
        handleSaveData,
        dataDirtyRef
    };
}
