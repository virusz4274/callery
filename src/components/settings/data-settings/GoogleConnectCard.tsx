import { Button, Card, Chip, Spinner } from '@heroui/react';
import { CloudDownload, ContactRound } from 'lucide-react';
import { GoogleIcon } from '@/components/icons/google-icon';
import type { User } from '@/lib/types';

interface GoogleConnectProps {
    googleSync?: User['googleSync'];
    isSyncing: boolean;
    isDisconnecting: boolean;
    onConnect: () => void;
    onDisconnect: () => void;
}

function getStatusLabel(googleSync?: User['googleSync']) {
    switch (googleSync?.status) {
        case 'syncing':
            return { text: 'Syncing now', color: 'accent' as const };
        case 'completed':
            return { text: 'Connected', color: 'success' as const };
        case 'failed':
            return { text: 'Needs attention', color: 'warning' as const };
        default:
            return { text: 'Not connected', color: 'default' as const };
    }
}

export function GoogleConnectCard({ googleSync, isSyncing, isDisconnecting, onConnect, onDisconnect }: GoogleConnectProps) {
    const status = getStatusLabel(googleSync);
    const buttonLabel = googleSync?.hasRefreshToken ? 'Sync now' : 'Connect Google';

    return (
        <Card className="rounded-[1.6rem] border border-default-200/80 bg-background/95 shadow-[0_20px_56px_-44px_rgba(15,23,42,0.45)]">
            <Card.Content className="space-y-5 p-5 sm:p-6">
                <div className="flex flex-wrap items-center gap-2">
                    <Chip size="sm" variant="soft" color="accent">Directory sync</Chip>
                    <Chip size="sm" variant="soft" color="default">Google Contacts</Chip>
                    <Chip size="sm" variant="soft" color={status.color}>{status.text}</Chip>
                </div>

                <div className="flex flex-col gap-5 lg:flex-row lg:items-center lg:justify-between">
                    <div className="flex items-start gap-4">
                        <div className="flex h-12 w-12 shrink-0 items-center justify-center rounded-2xl bg-primary/10 text-primary">
                            <ContactRound className="h-5 w-5" />
                        </div>
                        <div className="space-y-2">
                            <h4 className="text-lg font-semibold tracking-[-0.03em] text-foreground">Match contacts automatically</h4>
                            <p className="max-w-2xl text-sm leading-6 text-default-500">
                                Sync Google Contacts so uploaded calls resolve to real people faster and your recordings workspace stays easier to scan.
                            </p>
                            {googleSync?.lastSyncedAt ? (
                                <p className="text-xs text-default-400">
                                    Last synced: {new Date(googleSync.lastSyncedAt).toLocaleString()}
                                </p>
                            ) : null}
                            {googleSync?.lastError ? (
                                <p className="text-xs text-warning">
                                    Last sync error: {googleSync.lastError}
                                </p>
                            ) : null}
                        </div>
                    </div>

                    <div className="flex w-full flex-col gap-3 sm:w-auto sm:flex-row">
                        <Button
                            variant="primary"
                            onPress={onConnect}
                            isDisabled={isSyncing || isDisconnecting}
                            className="w-full gap-2 rounded-full sm:w-auto"
                        >
                            {isSyncing ? <Spinner size="sm" color="current" /> : <GoogleIcon className="h-4 w-4" />}
                            {isSyncing ? 'Syncing...' : buttonLabel}
                        </Button>
                        {googleSync?.hasRefreshToken ? (
                            <Button
                                variant="secondary"
                                onPress={onDisconnect}
                                isDisabled={isSyncing || isDisconnecting}
                                className="w-full rounded-full sm:w-auto"
                            >
                                {isDisconnecting ? <Spinner size="sm" color="current" /> : null}
                                {isDisconnecting ? 'Disconnecting...' : 'Disconnect'}
                            </Button>
                        ) : null}
                    </div>
                </div>

                <div className="grid gap-3 sm:grid-cols-2">
                    <div className="rounded-[1.2rem] border border-default-200/80 bg-default-50/70 p-4">
                        <div className="flex items-center gap-2 text-sm font-medium text-foreground">
                            <CloudDownload className="h-4 w-4 text-primary" />
                            Import matching data
                        </div>
                        <p className="mt-2 text-sm leading-6 text-default-500">
                            Pull names and numbers into your workspace so uploads and call history attach to the right contact records.
                        </p>
                    </div>
                    <div className="rounded-[1.2rem] border border-default-200/80 bg-default-50/70 p-4">
                        <p className="text-sm font-medium text-foreground">What changes after sync</p>
                        <p className="mt-2 text-sm leading-6 text-default-500">
                            Contacts become easier to search, filter, and review across recordings, uploads, and follow-up workflows.
                        </p>
                    </div>
                </div>
                {googleSync?.hasRefreshToken ? (
                    <p className="text-xs leading-5 text-default-400">
                        Disconnecting stops future syncs and lets you connect a different Google account. Existing contacts stay in your workspace.
                    </p>
                ) : null}
            </Card.Content>
        </Card>
    );
}
