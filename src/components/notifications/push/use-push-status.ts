'use client';

import { useCallback, useEffect, useState } from 'react';
import { getPushStatus } from './helpers';

export function usePushStatus() {
    const [isSupported, setIsSupported] = useState(false);
    const [isEnabled, setIsEnabled] = useState(false);
    const [isLoading, setIsLoading] = useState(true);
    const [error, setError] = useState(false);
    const [permission, setPermission] = useState<NotificationPermission | 'unsupported'>('default');

    const refresh = useCallback(async () => {
        setIsLoading(true);
        try {
            const status = await getPushStatus();
            setIsSupported(status.isSupported);
            setIsEnabled(status.isEnabled);
            setPermission(status.permission);
            setError(false);
        } catch (error) {
            console.error('Could not check browser notification status', error);
            setError(true);
        } finally {
            setIsLoading(false);
        }
    }, []);

    useEffect(() => {
        const timer = setTimeout(() => { void refresh(); }, 0);
        return () => clearTimeout(timer);
    }, [refresh]);

    return {
        isEnabled,
        isLoading,
        isSupported,
        permission,
        error,
        refresh,
        setIsEnabled,
        setIsLoading,
        setPermission,
    };
}
