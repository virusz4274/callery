import { useCallback, useEffect, useRef, useState, useTransition } from 'react';
import type { AppRouterInstance } from 'next/dist/shared/lib/app-router-context.shared-runtime';
import type { ReadonlyURLSearchParams } from 'next/navigation';
import { syncGoogleContacts } from '@/app/actions/contacts';
import { getGoogleAuthUrl } from '@/app/actions/google-auth';
import { useLocalStorage } from '@/hooks/use-local-storage';

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
    searchParams: ReadonlyURLSearchParams;
    router: AppRouterInstance;
    toast: ToastFn;
};

export function useGoogleSync({ searchParams, router, toast }: UseGoogleSyncParams) {
    const [isSyncing, startSyncTransition] = useTransition();
    const [showConnectDialog, setShowConnectDialog] = useState(false);
    const [hasConsented, setHasConsented] = useLocalStorage('google-contact-consent', false);
    const processedCodeRef = useRef<string | null>(null);

    const replaceSettingsUrl = useCallback(
        (params: URLSearchParams, scroll: boolean = false) => {
            router.replace(buildSettingsPath(params), { scroll });
        },
        [router]
    );

    const redirectToGoogleAuth = async () => {
        const { url } = await getGoogleAuthUrl();
        window.location.href = url;
    };

    const handleConnectGoogle = () => {
        if (hasConsented) {
            void redirectToGoogleAuth();
            return;
        }

        setShowConnectDialog(true);
    };

    const onDialogConfirm = () => {
        setHasConsented(true);
        setShowConnectDialog(false);
        void redirectToGoogleAuth();
    };

    useEffect(() => {
        const code = searchParams.get('g_code');
        const error = searchParams.get('error');

        if (error) {
            toast({
                title: 'Google Sync Failed',
                description: error.replace(/\+/g, ' ') || 'Could not sync with your Google account.',
                status: 'danger',
            });

            const newParams = new URLSearchParams(searchParams.toString());
            newParams.delete('error');
            replaceSettingsUrl(newParams);
            return;
        }

        if (code && !isSyncing) {
            if (typeof window !== 'undefined') {
                const storageKey = `google_sync_${code}`;
                if (sessionStorage.getItem(storageKey)) {
                    const newParams = new URLSearchParams(searchParams.toString());
                    newParams.delete('g_code');
                    if (searchParams.has('g_code')) {
                        replaceSettingsUrl(newParams);
                    }
                    return;
                }
                sessionStorage.setItem(storageKey, 'processing');
            }

            if (processedCodeRef.current === code) {
                return;
            }
            processedCodeRef.current = code;

            startSyncTransition(async () => {
                try {
                    const timeoutPromise = new Promise((_, reject) =>
                        setTimeout(() => reject(new Error('Request timed out after 30s')), 30000)
                    );

                    const result = (await Promise.race([
                        syncGoogleContacts(code),
                        timeoutPromise,
                    ])) as Awaited<ReturnType<typeof syncGoogleContacts>>;

                    if (result.success) {
                        toast({
                            title: 'Sync Started',
                            description: result.message || 'Contacts are syncing in the background.',
                            status: 'success',
                        });
                    } else {
                        toast({ title: 'Sync Failed', description: result.error, status: 'danger' });
                    }
                } catch (err) {
                    console.error('Google sync error:', err);
                    toast({
                        title: 'Sync Error',
                        description: err instanceof Error ? err.message : 'Unexpected error',
                        status: 'danger',
                    });
                } finally {
                    const newParams = new URLSearchParams(searchParams.toString());
                    newParams.delete('g_code');
                    replaceSettingsUrl(newParams);
                }
            });
        }
    }, [isSyncing, replaceSettingsUrl, searchParams, toast]);

    return {
        isSyncing,
        showConnectDialog,
        setShowConnectDialog,
        handleConnectGoogle,
        onDialogConfirm,
    };
}
