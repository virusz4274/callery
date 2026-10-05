'use client';

import { useState } from 'react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { Button, Tabs } from '@heroui/react';
import { ArrowLeft, CreditCard, FileAudio, ShieldCheck } from 'lucide-react';
import { deleteUser, restoreUser } from '@/app/actions/admin';
import type { Invoice, Recording, User } from '@/lib/types';
import { UserDetailsHeader } from './user-details/user-details-header';
import { UserInfoPanel } from './user-details/user-info-panel';
import { UserPaymentHistoryPanel } from './user-details/user-payment-history-panel';
import { UserRecordingsPanel } from './user-details/user-recordings-panel';
import { AdminPageShell } from '@/components/admin/admin-page-shell';

type UserDetailsPageProps = {
    user: User;
    recordings: Recording[];
    invoices: Invoice[];
    defaultTab?: string;
};

export function UserDetailsPage({ user, recordings, invoices, defaultTab }: UserDetailsPageProps) {
    const router = useRouter();
    const [selectedTab, setSelectedTab] = useState<string>(defaultTab || 'info');
    const [isDeleting, setIsDeleting] = useState(false);
    const [isRestoring, setIsRestoring] = useState(false);

    const handleDeleteUser = async () => {
        if (
            !confirm(
                'Are you sure you want to schedule this user for deletion? The account will be disabled and can be restored during the restore window.'
            )
        ) {
            return;
        }

        setIsDeleting(true);
        try {
            await deleteUser(user.id);
            router.push('/admin/users');
        } catch (error) {
            console.error('Failed to delete user:', error);
            alert('Failed to delete user');
            setIsDeleting(false);
        }
    };

    const handleRestoreUser = async () => {
        setIsRestoring(true);
        try {
            await restoreUser(user.id);
            router.refresh();
        } catch (error) {
            console.error('Failed to restore user:', error);
            alert(error instanceof Error ? error.message : 'Failed to restore user');
        } finally {
            setIsRestoring(false);
        }
    };

    return (
        <AdminPageShell
            eyebrow="User profile"
            title={user.name}
            description="Inspect account status, plan usage, recordings, and billing history for this user from one admin detail view."
            actions={
                <Link href="/admin/users">
                    <Button variant="secondary" className="w-full rounded-full px-6 font-semibold">
                        <ArrowLeft className="h-4 w-4" />
                        Back to users
                    </Button>
                </Link>
            }
            stats={[
                {
                    label: 'Plan',
                    value: user.planName,
                    helper: 'Current assigned subscription tier',
                    icon: ShieldCheck,
                },
                {
                    label: 'Recordings',
                    value: recordings.length,
                    helper: 'Calls currently linked to this account',
                    icon: FileAudio,
                },
                {
                    label: 'Invoices',
                    value: invoices.length,
                    helper: 'Billing records available for review',
                    icon: CreditCard,
                },
            ]}
        >
            <div className="space-y-6">
                <UserDetailsHeader
                    user={user}
                    isDeleting={isDeleting}
                    isRestoring={isRestoring}
                    onDeleteUser={handleDeleteUser}
                    onRestoreUser={handleRestoreUser}
                />

                <Tabs
                    aria-label="User Details"
                    selectedKey={selectedTab}
                    onSelectionChange={(key) => setSelectedTab(key as string)}
                    className="w-full"
                >
                    <Tabs.ListContainer className="rounded-[1.5rem] border border-default-200/80 bg-background/90 p-2 shadow-[0_20px_54px_-42px_rgba(15,23,42,0.35)]">
                        <Tabs.List className="gap-2">
                            <Tabs.Tab id="info">User information</Tabs.Tab>
                            <Tabs.Tab id="recordings">Recordings ({recordings.length})</Tabs.Tab>
                            <Tabs.Tab id="payment-history">Payment history</Tabs.Tab>
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
