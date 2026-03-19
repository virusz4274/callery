'use client';

import { useEffect } from 'react';
import { ensurePushServiceWorkerRegistration } from '@/lib/push-client';

export function PushServiceWorkerRegister() {
    useEffect(() => {
        ensurePushServiceWorkerRegistration().catch((error) => {
            console.error('Failed to register push service worker:', error);
        });
    }, []);

    return null;
}
