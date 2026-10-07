'use client';

import { ActionLink } from '@/components/action-link';
import { useRef, useState, useSyncExternalStore } from 'react';
import { usePathname, useRouter, useSearchParams } from 'next/navigation';
import { Tabs } from '@heroui/react';
import { ArrowLeft, CreditCard, FileAudio } from 'lucide-react';
import { deleteUser, restoreUser } from '@/app/actions/admin';
import type { Invoice, Recording, User } from '@/lib/types';
import { UserDetailsHeader } from './user-details/user-details-header';
import { UserInfoPanel } from './user-details/user-info-panel';
import { UserPaymentHistoryPanel } from './user-details/user-payment-history-panel';
import { UserRecordingsPanel } from './user-details/user-recordings-panel';
import { usersReturnContext } from '@/lib/admin-navigation';
import { ConfirmActionDialog } from '@/components/admin/confirm-action-dialog';
import { useToast } from '@/components/toast-provider';
import { AdminPageShell } from '@/components/admin/admin-page-shell';

type UserDetailsPageProps = {
    user: User;
    recordings: Recording[];
    invoices: Invoice[];
    defaultTab?: string;
};

export function UserDetailsPage({ user, recordings, invoices }: UserDetailsPageProps) {
    const router = useRouter();
    const params = useSearchParams();
    const pathname = usePathname();
    const selectedTab = ['info', 'recordings', 'payment-history'].includes(params.get('tab') || '') ? params.get('tab') || 'info' : 'info';
    const returnHref = useSyncExternalStore(() => () => {}, () => usersReturnContext().href, () => '/admin/users');
    const [confirming, setConfirming] = useState(false);
    const [error, setError] = useState<string | null>(null);
    const busy = useRef(false);
    const { toast } = useToast();
    const [isDeleting, setIsDeleting] = useState(false);
    const [isRestoring, setIsRestoring] = useState(false);

    const handleDeleteUser = async () => {
        if (busy.current) return;
        busy.current = true; setIsDeleting(true); setError(null);
        try { await deleteUser(user.id); toast({ title: 'User scheduled for deletion', status: 'success' }); router.push(returnHref); }
        catch (error) { setError(error instanceof Error ? error.message : 'Please try again.'); }
        finally { busy.current = false; setIsDeleting(false); }
    };
    const handleRestoreUser = async () => {
        if (busy.current) return;
        busy.current = true; setIsRestoring(true);
        try { await restoreUser(user.id); toast({ title: 'User restored', status: 'success' }); router.refresh(); }
        catch (error) { toast({ title: 'Unable to restore user', description: error instanceof Error ? error.message : 'Please try again.', status: 'danger' }); }
        finally { busy.current = false; setIsRestoring(false); }
    };

    return (
        <AdminPageShell
            eyebrow="User profile"
            title={user.name || user.email}

            actions={
                <ActionLink href={returnHref} variant="secondary" className="min-h-11 px-4">
                        <ArrowLeft className="h-4 w-4" />
                        Back to users
                    </ActionLink>
            }
            stats={[
                {
                    label: 'Recordings',
                    value: recordings.length,
                    helper: 'Calls currently linked to this account',
                    icon: FileAudio,
                },
                {
                    label: 'Recent invoices',
                    value: invoices.length,
                    helper: 'Up to 20 most recent billing records',
                    icon: CreditCard,
                },
            ]}
        >
            <div className="space-y-5">
                {confirming && <ConfirmActionDialog title={`Schedule deletion for ${user.name || user.email}?`} description="The account will be disabled immediately and can be restored during the existing restore window." label="Schedule deletion" pending={isDeleting} error={error} onConfirm={() => void handleDeleteUser()} onClose={() => setConfirming(false)} />}
                <UserDetailsHeader
                    user={user}
                    isDeleting={isDeleting}
                    isRestoring={isRestoring}
                    onDeleteUser={() => { setError(null); setConfirming(true); }}
                    onRestoreUser={handleRestoreUser}
                />

                <Tabs
                    aria-label="User Details"
                    selectedKey={selectedTab}
                    onSelectionChange={key => { const next = new URLSearchParams(params); next.set('tab', String(key)); router.push(`${pathname}?${next}`, { scroll: false }); }}
                    className="w-full"
                >
                    <Tabs.ListContainer className="max-w-full overflow-x-auto p-2">
                        <Tabs.List className="gap-2">
                            <Tabs.Tab className="min-h-11 whitespace-nowrap" id="info">User information</Tabs.Tab>
                            <Tabs.Tab className="min-h-11 whitespace-nowrap" id="recordings">Recordings ({recordings.length})</Tabs.Tab>
                            <Tabs.Tab className="min-h-11 whitespace-nowrap" id="payment-history">Payment history</Tabs.Tab>
                        </Tabs.List>
                    </Tabs.ListContainer>

                    <Tabs.Panel id="info" className="pt-5">
                        <UserInfoPanel user={user} />
                    </Tabs.Panel>

                    <Tabs.Panel id="recordings" className="pt-5">
                        <UserRecordingsPanel recordings={recordings} />
                    </Tabs.Panel>

                    <Tabs.Panel id="payment-history" className="pt-5">
                        <UserPaymentHistoryPanel invoices={invoices} />
                    </Tabs.Panel>
                </Tabs>
            </div>
        </AdminPageShell>
    );
}
