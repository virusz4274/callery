'use client';

import { useState } from 'react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { Tabs } from '@heroui/react';
import { ArrowLeft } from 'lucide-react';
import { deleteUser, restoreUser } from '@/app/actions/admin';
import type { Invoice, Recording, User } from '@/lib/types';
import { UserDetailsHeader } from './user-details/user-details-header';
import { UserInfoPanel } from './user-details/user-info-panel';
import { UserPaymentHistoryPanel } from './user-details/user-payment-history-panel';
import { UserRecordingsPanel } from './user-details/user-recordings-panel';

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
        <div className="space-y-6">
            <Link href="/admin" className="flex items-center gap-2 text-sm text-default-500 hover:text-foreground w-fit">
                <ArrowLeft className="h-4 w-4" />
                Back to User Management
            </Link>

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
                <Tabs.ListContainer>
                    <Tabs.List>
                        <Tabs.Tab id="info">User Information</Tabs.Tab>
                        <Tabs.Tab id="recordings">Recordings ({recordings.length})</Tabs.Tab>
                        <Tabs.Tab id="payment-history">Payment History</Tabs.Tab>
                    </Tabs.List>
                </Tabs.ListContainer>

                <Tabs.Panel id="info">
                    <UserInfoPanel user={user} />
                </Tabs.Panel>

                <Tabs.Panel id="recordings">
                    <UserRecordingsPanel recordings={recordings} />
                </Tabs.Panel>

                <Tabs.Panel id="payment-history">
                    <UserPaymentHistoryPanel invoices={invoices} />
                </Tabs.Panel>
            </Tabs>
        </div>
    );
}
