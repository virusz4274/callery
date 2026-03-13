'use client';

import { useEffect, useState } from 'react';

export function useIsCapacitor() {
    const [isCapacitor, setIsCapacitor] = useState(false);

    useEffect(() => {
        let isMounted = true;

        async function checkCapacitor() {
            try {
                const { isCapacitorApp } = await import('@/lib/capacitor');
                if (isMounted) {
                    setIsCapacitor(isCapacitorApp());
                }
            } catch {
                if (isMounted) {
                    setIsCapacitor(false);
                }
            }
        }

        void checkCapacitor();

        return () => {
            isMounted = false;
        };
    }, []);

    return isCapacitor;
}
