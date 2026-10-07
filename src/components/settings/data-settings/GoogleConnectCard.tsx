import { ActionLink } from '@/components/action-link';
import { Button, Card, Chip, Spinner } from '@heroui/react';
import { AlertTriangle, ContactRound, ExternalLink } from 'lucide-react';
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
    const duplicatePhoneIssues = googleSync?.duplicatePhoneIssues || [];
    const duplicatePhoneIssueCount = googleSync?.duplicatePhoneIssueCount || 0;

    return (
        <Card className="rounded-2xl border border-border bg-surface shadow-none">
            <Card.Content className="space-y-5 p-5 sm:p-6">
                <div className="flex flex-wrap items-center gap-2">
                    <Chip size="sm" variant="soft" color={status.color}>{status.text}</Chip>
                </div>

                <div className="flex flex-col gap-5 lg:flex-row lg:items-center lg:justify-between">
                    <div className="flex items-start gap-4">
                        <div className="flex h-12 w-12 shrink-0 items-center justify-center rounded-2xl bg-primary/10 text-primary">
                            <ContactRound className="h-5 w-5" />
                        </div>
                        <div className="space-y-2">
                            <h4 className="text-lg font-semibold tracking-[-0.03em] text-foreground">Google Contacts</h4>
                            <p className="max-w-2xl text-sm leading-6 text-default-500">
                                Match recordings to your Google contacts.
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
                            {duplicatePhoneIssueCount > 0 ? (
                                <p className="text-xs text-warning">
                                    Review needed: {duplicatePhoneIssueCount} phone number{duplicatePhoneIssueCount === 1 ? '' : 's'} appear on multiple Google contacts.
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

                {duplicatePhoneIssueCount > 0 ? (
                    <div className="rounded-xl border border-warning/30 bg-warning/8 p-4">
                        <div className="flex flex-wrap items-start justify-between gap-3">
                            <div className="space-y-1">
                                <div className="flex items-center gap-2 text-sm font-semibold text-foreground">
                                    <AlertTriangle className="h-4 w-4 text-warning" />
                                    Review duplicate Google numbers
                                </div>
                                <p className="text-sm leading-6 text-default-600">
                                    Merge or edit these contacts in Google Contacts. They stay separate here until synced.
                                </p>
                                {googleSync?.duplicatePhoneIssueDetectedAt ? (
                                    <p className="text-xs text-default-400">
                                        Detected on {new Date(googleSync.duplicatePhoneIssueDetectedAt).toLocaleString()}
                                    </p>
                                ) : null}
                            </div>
                            <ActionLink href="https://contacts.google.com/" target="_blank" rel="noreferrer" variant="secondary" className="">
                                    Review in Google Contacts
                                    <ExternalLink className="h-4 w-4" />
                                </ActionLink>
                        </div>
                        <div className="mt-4 space-y-3">
                            {duplicatePhoneIssues.slice(0, 5).map((issue) => (
                                <div key={issue.phoneNumber} className="rounded-2xl border border-warning/20 bg-background/80 p-3">
                                    <div className="text-sm font-semibold text-foreground">{issue.phoneNumber}</div>
                                    <div className="mt-1 text-sm text-default-500">{issue.names.join(', ')}</div>
                                </div>
                            ))}
                            {duplicatePhoneIssueCount > duplicatePhoneIssues.slice(0, 5).length ? (
                                <p className="text-xs text-default-400">
                                    Showing 5 of {duplicatePhoneIssueCount} duplicate phone number{duplicatePhoneIssueCount === 1 ? '' : 's'}.
                                </p>
                            ) : null}
                        </div>
                    </div>
                ) : null}
                {googleSync?.hasRefreshToken ? (
                    <p className="text-xs leading-5 text-default-400">
                        Disconnecting stops future syncs and lets you connect a different Google account. Your last synced contacts stay visible until a future sync replaces them.
                    </p>
                ) : null}
            </Card.Content>
        </Card>
    );
}
