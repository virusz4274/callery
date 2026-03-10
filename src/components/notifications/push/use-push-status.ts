'use client';

import { useEffect, useState } from 'react';
import { getPushStatus } from './helpers';

export function usePushStatus() {
    const [isSupported, setIsSupported] = useState(false);
    const [isEnabled, setIsEnabled] = useState(false);
    const [isLoading, setIsLoading] = useState(true);
    const [permission, setPermission] = useState<NotificationPermission | 'unsupported'>('default');

    useEffect(() => {
        const checkStatus = async () => {
            const status = await getPushStatus();
            setIsSupported(status.isSupported);
            setIsEnabled(status.isEnabled);
            setPermission(status.permission);
            setIsLoading(false);
        };

        void checkStatus();
    }, []);

    return {
        isEnabled,
        isLoading,
        isSupported,
        permission,
        setIsEnabled,
        setIsLoading,
        setPermission,
    };
}
