
'use client';

import type { User, Recording, Invoice } from '@/lib/types';

import { Avatar, Card, Tabs, Chip, Button } from '@heroui/react';
import { ClientFormattedDate } from '@/components/client-formatted-date';
import { ArrowLeft, Trash2 } from 'lucide-react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { deleteUser } from '@/app/actions/admin';
import { useState } from 'react';

type UserDetailsPageProps = {
    user: User;
    recordings: Recording[];
    invoices: Invoice[];
    defaultTab?: string;
};

function SimpleProgress({ value }: { value: number }) {
    return (
        <div className="h-2 w-full rounded-full bg-default-200">
            <div className="h-full rounded-full bg-primary transition-all duration-300" style={{ width: `${Math.min(Math.max(value, 0), 100)}%` }} />
        </div>
    );
}

export function UserDetailsPage({ user, recordings, invoices, defaultTab }: UserDetailsPageProps) {
    const [selectedTab, setSelectedTab] = useState<string>(defaultTab || "info");
    const [isDeleting, setIsDeleting] = useState(false);
    const router = useRouter();

    const handleDeleteUser = async () => {
        if (!confirm('Are you sure you want to permanently delete this user? This action cannot be undone.')) {
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

    const formatDuration = (seconds: number) => {
        const mins = Math.floor(seconds / 60);
        const secs = seconds % 60;
        return `${String(mins).padStart(2, '0')}:${String(secs).padStart(2, '0')}`;
    };

    return (
        <div className="space-y-6">
            <Link href="/admin" className="flex items-center gap-2 text-sm text-default-500 hover:text-foreground w-fit">
                <ArrowLeft className="h-4 w-4" />
                Back to User Management
            </Link>

            <Card>
                <Card.Header className="flex gap-4 justify-between">
                    <Avatar className="h-16 w-16">
                        <Avatar.Image src={user.photoURL} alt={user.name} />
                        <Avatar.Fallback>{user.name.charAt(0)}</Avatar.Fallback>
                    </Avatar>
                    <div>
                        <h2 className="text-3xl font-bold">{user.name}</h2>
                        <p className="text-default-500">{user.phoneNumber || 'No phone number'}</p>
                    </div>
                    <div className="flex gap-2 ml-auto">
                        {/* Placeholder for Manage Plan - can be connected later */}
                        {/* <Button variant="flat">Manage Plan</Button> */}
                        <Button
                            variant="danger-soft"
                            isDisabled={isDeleting}
                            onPress={handleDeleteUser}
                        >
                            {isDeleting ? 'Deleting...' : (
                                <div className="flex items-center gap-2">
                                    <Trash2 className="h-4 w-4" />
                                    <span>Delete User</span>
                                </div>
                            )}
                        </Button>
                    </div>
                </Card.Header>
            </Card>

            <Tabs aria-label="User Details" selectedKey={selectedTab} onSelectionChange={(key) => setSelectedTab(key as string)} className="w-full">
                <Tabs.ListContainer>
                    <Tabs.List>
                        <Tabs.Tab id="info">User Information</Tabs.Tab>
                        <Tabs.Tab id="recordings">Recordings ({recordings.length})</Tabs.Tab>
                        <Tabs.Tab id="payment-history">Payment History</Tabs.Tab>
                    </Tabs.List>
                </Tabs.ListContainer>

                <Tabs.Panel id="info">
                    <Card>
                        <Card.Header>
                            <h3 className="text-xl font-bold">Plan & Usage</h3>
                        </Card.Header>
                        <Card.Content className="space-y-6">
                            <div className="flex justify-between items-center">
                                <span className="font-semibold">Current Plan:</span>
                                <div>
                                    <Chip>{user.plan}</Chip>
                                </div>
                            </div>
                            <div className="flex justify-between items-center border-b border-default-100 pb-4">
                                <span className="font-semibold text-small">Last Logged In:</span>
                                <span className="text-small text-default-500">
                                    {user.lastLoginAt ? <ClientFormattedDate date={user.lastLoginAt} formatString="PPp" /> : 'Never'}
                                </span>
                            </div>
                            <div>
                                <div className="flex justify-between mb-1">
                                    <span className="text-small">Storage Usage</span>
                                    <span className="text-small text-default-500">{user.storageUsed.toFixed(2)} / {user.storageAllocation} GB</span>
                                </div>
                                <SimpleProgress value={(user.storageUsed / user.storageAllocation) * 100} />
                            </div>
                            <div>
                                <div className="flex justify-between mb-1">
                                    <span className="text-small">Transcription Usage</span>
                                    <span className="text-small text-default-500">{(user.transcriptionUsed / 60).toFixed(1)} / {(user.transcriptionAllocation / 60).toFixed(0)} min</span>
                                </div>
                                <SimpleProgress value={(user.transcriptionUsed / user.transcriptionAllocation) * 100} />
                            </div>
                        </Card.Content>
                    </Card>
                </Tabs.Panel>

                <Tabs.Panel id="recordings">
                    <Card>
                        <Card.Header>
                            <div className="flex flex-col">
                                <h3 className="text-lg font-bold">User Recordings</h3>
                                <p className="text-small text-default-500">A list of all recordings associated with this user.</p>
                            </div>
                        </Card.Header>
                        <Card.Content>
                            <div className="rounded-lg border border-default-200 overflow-hidden">
                                <table className="w-full text-sm text-left">
                                    <thead className="text-default-500 font-medium bg-default-50 border-b border-default-200">
                                        <tr>
                                            <th className="h-10 px-4 align-middle">Date</th>
                                            <th className="h-10 px-4 align-middle">Duration</th>
                                            <th className="h-10 px-4 align-middle">Transcript Snippet</th>
                                        </tr>
                                    </thead>
                                    <tbody className="divide-y divide-default-100">
                                        {recordings.length > 0 ? recordings.map((rec) => (
                                            <tr key={rec.id}>
                                                <td className="p-4 align-middle">
                                                    <ClientFormattedDate date={rec.recordedAt} formatString="PPp" />
                                                </td>
                                                <td className="p-4 align-middle">{formatDuration(rec.duration)}</td>
                                                <td className="p-4 align-middle text-default-500 truncate max-w-sm">
                                                    {rec.summary || (rec.fullTranscript && rec.fullTranscript[0]?.text) || '-'}
                                                </td>
                                            </tr>
                                        )) : (
                                            <tr><td colSpan={3} className="p-4 text-center">No recordings.</td></tr>
                                        )}
                                    </tbody>
                                </table>
                            </div>
                        </Card.Content>
                    </Card>
                </Tabs.Panel>

                <Tabs.Panel id="payment-history">
                    <Card>
                        <Card.Header>
                            <div className="flex flex-col">
                                <h3 className="text-lg font-bold">Payment History</h3>
                                <p className="text-small text-default-500">A record of all invoices for this user.</p>
                            </div>
                        </Card.Header>
                        <Card.Content>
                            <div className="rounded-lg border border-default-200 overflow-hidden">
                                <table className="w-full text-sm text-left">
                                    <thead className="text-default-500 font-medium bg-default-50 border-b border-default-200">
                                        <tr>
                                            <th className="h-10 px-4 align-middle">Invoice ID</th>
                                            <th className="h-10 px-4 align-middle">Date</th>
                                            <th className="h-10 px-4 align-middle">Amount</th>
                                            <th className="h-10 px-4 align-middle text-right">Status</th>
                                        </tr>
                                    </thead>
                                    <tbody className="divide-y divide-default-100">
                                        {invoices.length > 0 ? invoices.map((invoice) => (
                                            <tr key={invoice.id}>
                                                <td className="p-4 align-middle font-medium">{invoice.id}</td>
                                                <td className="p-4 align-middle">
                                                    <ClientFormattedDate date={invoice.date} formatString="MMMM dd, yyyy" />
                                                </td>
                                                <td className="p-4 align-middle">${invoice.amount.toFixed(2)}</td>
                                                <td className="p-4 align-middle text-right">
                                                    <Chip
                                                        color={invoice.status === 'Paid' ? 'success' : 'danger'}
                                                        variant="soft"
                                                        size="sm"
                                                    >
                                                        {invoice.status}
                                                    </Chip>
                                                </td>
                                            </tr>
                                        )) : (
                                            <tr><td colSpan={4} className="p-4 text-center">No invoices.</td></tr>
                                        )}
                                    </tbody>
                                </table>
                            </div>
                        </Card.Content>
                    </Card>
                </Tabs.Panel>
            </Tabs>
        </div>
    );
}
