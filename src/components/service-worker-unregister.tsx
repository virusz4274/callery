'use client';

import { useEffect } from 'react';

export function ServiceWorkerUnregister() {
    useEffect(() => {
        if (typeof window !== 'undefined' && 'serviceWorker' in navigator) {
            navigator.serviceWorker.getRegistrations().then((registrations) => {
                for (const registration of registrations) {
                    console.log('Unregistering service worker in dev mode:', registration);
                    registration.unregister();
                }
            });
        }
    }, []);

    return null;
}
