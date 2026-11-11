'use client';

import { createContext, useContext, useEffect, useState, useSyncExternalStore, type ReactNode } from 'react';
import { useUser } from '@/lib/auth/client';
import { BrowserUploadManager } from '@/lib/browser-upload-manager';

const Context = createContext<BrowserUploadManager | null>(null);

export function BrowserUploadProvider({ children }: { children: ReactNode }) {
    const { user } = useUser();
    const [manager] = useState(() => new BrowserUploadManager());
    const owner = user?.id ?? null;
    useEffect(() => {
        void manager.setOwner(owner);
        return () => { void manager.setOwner(null); };
    }, [manager, owner]);
    useEffect(() => {
        const online = () => manager.setOnline(navigator.onLine);
        online();
        window.addEventListener('online', online);
        window.addEventListener('offline', online);
        return () => { window.removeEventListener('online', online); window.removeEventListener('offline', online); };
    }, [manager]);
    return <Context.Provider value={manager}>{children}</Context.Provider>;
}

export function useBrowserUploads() {
    const manager = useContext(Context);
    const { user } = useUser();
    if (!manager) throw new Error('BrowserUploadProvider must wrap the authenticated application.');
    const snapshot = useSyncExternalStore(manager.subscribe, manager.getSnapshot, manager.getServerSnapshot);
    return { manager, ...snapshot, items: snapshot.owner === user?.id ? snapshot.items : [] };
}
