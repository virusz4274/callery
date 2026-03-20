import { useCallback, useEffect, useRef, useState } from 'react';
import type { AppRouterInstance } from 'next/dist/shared/lib/app-router-context.shared-runtime';
import type { ReadonlyURLSearchParams } from 'next/navigation';
import { getGoogleAuthUrl } from '@/app/actions/google-auth';
import { useLocalStorage } from '@/hooks/use-local-storage';
import type { User } from '@/lib/types';

type ToastFn = (params: {
    title: string;
    description?: string;
    status: 'success' | 'danger';
}) => void;

function buildSettingsPath(params: URLSearchParams): string {
    const query = params.toString();
    return query ? `/settings?${query}` : '/settings';
}

type UseGoogleSyncParams = {
    googleSync?: User['googleSync'];
    refetchProfile: () => Promise<void>;
    searchParams: ReadonlyURLSearchParams;
    router: AppRouterInstance;
    toast: ToastFn;
};

export function useGoogleSync({ googleSync, refetchProfile, searchParams, router, toast }: UseGoogleSyncParams) {
    const [isSyncing, setIsSyncing] = useState(false);
    const [isDisconnecting, setIsDisconnecting] = useState(false);
    const [showConnectDialog, setShowConnectDialog] = useState(false);
    const [hasConsented, setHasConsented] = useLocalStorage('google-contact-consent', false);
    const handledStatusRef = useRef<string | null>(null);

    const replaceSettingsUrl = useCallback(
        (params: URLSearchParams, scroll: boolean = false) => {
            router.replace(buildSettingsPath(params), { scroll });
        },
        [router]
    );

    const redirectToGoogleAuth = async (): Promise<boolean> => {
        setIsSyncing(true);

        try {
            const { url } = await getGoogleAuthUrl();
            window.location.href = url;
            return true;
        } catch (error) {
            toast({
                title: 'Google Sync Failed',
                description: error instanceof Error ? error.message : 'Could not start Google authentication.',
                status: 'danger',
            });
            setIsSyncing(false);
            return false;
        }
    };

    const startStoredSync = async () => {
        setIsSyncing(true);

        try {
            const response = await fetch('/api/contacts/sync', {
                method: 'POST',
            });
            const result = await response.json() as {
                success: boolean;
                error?: string;
                message?: string;
            };

            if (response.status === 409) {
                toast({
                    title: 'Sync already running',
                    description: result.error || 'Google Contacts sync is already in progress.',
                    status: 'danger',
                });
                await refetchProfile();
                return;
            }

            if (!result.success) {
                toast({
                    title: 'Google Sync Failed',
                    description: result.error || 'Could not refresh Google Contacts.',
                    status: 'danger',
                });
            } else {
                toast({
                    title: 'Sync Complete',
                    description: result.message || 'Google Contacts were refreshed.',
                    status: 'success',
                });
                await refetchProfile();
            }
        } catch (error) {
            toast({
                title: 'Google Sync Failed',
                description: error instanceof Error ? error.message : 'Could not refresh Google Contacts.',
                status: 'danger',
            });
        } finally {
            setIsSyncing(false);
        }
    };

    const handleConnectGoogle = () => {
        if (googleSync?.hasRefreshToken) {
            void startStoredSync();
            return;
        }

        if (hasConsented) {
            void redirectToGoogleAuth();
            return;
        }

        setShowConnectDialog(true);
    };

    const handleDisconnectGoogle = async () => {
        setIsDisconnecting(true);

        try {
            const response = await fetch('/api/contacts/disconnect', {
                method: 'POST',
            });
            const result = await response.json() as {
                success: boolean;
                error?: string;
            };

            if (!response.ok || !result.success) {
                throw new Error(result.error || 'Could not disconnect Google Contacts.');
            }

            toast({
                title: 'Google Contacts disconnected',
                description: 'You can now connect a different Google account. Existing contacts stay in your workspace.',
                status: 'success',
            });
            await refetchProfile();
        } catch (error) {
            toast({
                title: 'Disconnect failed',
                description: error instanceof Error ? error.message : 'Could not disconnect Google Contacts.',
                status: 'danger',
            });
        } finally {
            setIsDisconnecting(false);
        }
    };

    const onDialogConfirm = () => {
        setShowConnectDialog(false);
        void (async () => {
            const started = await redirectToGoogleAuth();
            if (started) {
                setHasConsented(true);
            }
        })();
    };

    useEffect(() => {
        const syncStatus = searchParams.get('google_sync');
        const error = searchParams.get('error');
        const statusKey = `${syncStatus || ''}|${error || ''}`;

        if (!syncStatus && !error) {
            handledStatusRef.current = null;
            setIsSyncing(false);
            return;
        }

        if (handledStatusRef.current === statusKey) {
            return;
        }

        handledStatusRef.current = statusKey;

        if (syncStatus === 'started') {
            toast({
                title: 'Sync Started',
                description: 'Contacts are syncing in the background.',
                status: 'success',
            });

            const newParams = new URLSearchParams(searchParams.toString());
            newParams.delete('google_sync');
            replaceSettingsUrl(newParams);
            setIsSyncing(false);
            void refetchProfile();
            return;
        }

        if (error) {
            toast({
                title: 'Google Sync Failed',
                description: error.replace(/\+/g, ' ') || 'Could not sync with your Google account.',
                status: 'danger',
            });

            const newParams = new URLSearchParams(searchParams.toString());
            newParams.delete('error');
            replaceSettingsUrl(newParams);
            setIsSyncing(false);
            void refetchProfile();
            return;
        }
    }, [refetchProfile, replaceSettingsUrl, searchParams, toast]);

    return {
        isSyncing,
        isDisconnecting,
        showConnectDialog,
        setShowConnectDialog,
        handleConnectGoogle,
        handleDisconnectGoogle,
        onDialogConfirm,
    };
}
