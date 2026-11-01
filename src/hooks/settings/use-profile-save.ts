import { useCallback, useEffect, useRef } from 'react';
import { useSWRConfig } from 'swr';
import { saveUserProfile } from '@/lib/profile-client';
import type { UpdateProfileBody } from '@/lib/schemas';

export function useProfileSave(subject: string | undefined) {
    const { mutate } = useSWRConfig();
    const currentSubject = useRef(subject);
    useEffect(() => { currentSubject.current = subject; }, [subject]);
    return useCallback(async (patch: UpdateProfileBody) => {
        if (!subject || currentSubject.current !== subject) throw new Error('Sign in before saving settings.');
        await saveUserProfile(subject, patch, key => currentSubject.current === subject ? mutate(key) : Promise.resolve());
        return currentSubject.current === subject;
    }, [mutate, subject]);
}
