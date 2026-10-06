'use client';

import { useEffect } from 'react';

export function ServiceWorkerUnregister() {
    useEffect(() => {
        if (!('serviceWorker' in navigator)) return;

        let cancelled = false;

        async function unregisterWorkers() {
            const registrations = await navigator.serviceWorker.getRegistrations();
            await Promise.all(registrations.map(registration => registration.unregister()));

            // Unregistering leaves the current page controlled until it navigates.
            // Reload once so development bundles come directly from the server.
            if (!cancelled && registrations.length > 0 && navigator.serviceWorker.controller) {
                window.location.reload();
            }
        }

        void unregisterWorkers().catch(error => {
            console.error('Failed to unregister development service workers:', error);
        });

        return () => { cancelled = true; };
    }, []);

    return null;
}
