import { useState, useRef, useEffect } from 'react';
import { authFetch } from '@/lib/api-client';
import { useToast } from '@/components/toast-provider';
import type { User as UserProfile } from '@/lib/types';
import type { TranscriptionProvider } from '@/lib/config';

export function usePreferenceSettings(user: any, userProfile: UserProfile | null) {
    const { toast } = useToast();

    // General State
    const [generalState, setGeneralState] = useState({ timezone: '' });
    const [isSavingGeneral, setSavingGeneral] = useState(false);
    const generalDirtyRef = useRef(false);

    // Data State
    const [dataState, setDataState] = useState<{
        deletionPolicy: string;
        transcriptionSettings: { autoTranscribe: boolean; provider?: TranscriptionProvider };
    }>({
        deletionPolicy: 'never',
        transcriptionSettings: { autoTranscribe: true }
    });
    const [isSavingData, setSavingData] = useState(false);
    const dataDirtyRef = useRef(false);

    useEffect(() => {
        if (userProfile) {
            if (!generalDirtyRef.current) setGeneralState({ timezone: userProfile.timezone || '' });
            if (!dataDirtyRef.current) {
                setDataState({
                    deletionPolicy: userProfile.storageSettings?.deletionPolicy || 'never',
                    transcriptionSettings: userProfile.transcriptionSettings || { autoTranscribe: true }
                });
            }
        }
    }, [userProfile]);

    const handleSaveGeneral = async () => {
        if (!user || !generalState.timezone) return;
        setSavingGeneral(true);
        try {
            await authFetch('/api/user/profile', {
                method: 'PATCH',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ timezone: generalState.timezone }),
            });
            toast({ title: 'Preferences Saved', status: 'success' });
            generalDirtyRef.current = false;
        } catch { toast({ title: 'Save Failed', status: 'danger' }); } finally { setSavingGeneral(false); }
    };

    const handleSaveData = async () => {
        setSavingData(true);
        try {
            await authFetch('/api/user/profile', {
                method: 'PATCH',
                body: JSON.stringify({
                    storageSettings: { deletionPolicy: dataState.deletionPolicy },
                    transcriptionSettings: dataState.transcriptionSettings
                })
            });
            toast({ title: 'Policy Saved', status: 'success' });
            dataDirtyRef.current = false;
        } catch { toast({ title: 'Save Failed', status: 'danger' }); } finally { setSavingData(false); }
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
