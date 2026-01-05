
'use client';

import React from 'react';
import { Card, Button, Chip, Spinner } from '@heroui/react';
import { SettingsPage } from './settings-page';
import Link from 'next/link';

interface BillingSettingsProps {
    invoices: any[];
    isLoading: boolean;
}

export function BillingSettings({ invoices, isLoading }: BillingSettingsProps) {
    return (
        <SettingsPage title="Billing & Plans" description="Manage your subscription, payment methods, and billing history.">
            <div className="space-y-6">
                <Card className="bg-card/70 border-default-200">
                    <Card.Content className="space-y-6">
                        <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between">
                            <div>
                                <h4 className="text-lg font-medium">Current Plan</h4>
                                <div className="mt-1 flex items-center gap-2 text-default-500">
                                    Pro Plan <Chip color="success" size="sm" variant="soft">Active</Chip>
                                </div>
                                <p className="mt-2 text-sm text-default-400">
                                    Renews on Jan 1, 2024 • $15.00/month
                                </p>
                            </div>
                            <Button variant="secondary" className="mt-4 sm:mt-0">Update Payment Method</Button>
                        </div>
                        <div className="flex flex-col gap-4 sm:flex-row">
                            <Link href="/pricing" passHref legacyBehavior>
                                <Button variant="secondary" onPress={() => window.location.href = "/pricing"}>
                                    Change Plan
                                </Button>
                            </Link>
                            <Button variant="danger">Cancel Subscription</Button>
                        </div>
                    </Card.Content>
                </Card>

                <Card className="bg-card/70 border-default-200">
                    <Card.Header>
                        <h4 className="text-base font-medium">Billing History</h4>
                    </Card.Header>
                    <Card.Content>
                        {isLoading ? (
                            <div className="flex justify-center p-4">
                                <Spinner />
                            </div>
                        ) : (
                            <div className="relative w-full overflow-auto">
                                <table className="w-full text-sm text-left">
                                    <thead className="text-default-500 font-medium border-b border-default-200">
                                        <tr>
                                            <th className="h-12 px-4 align-middle">DATE</th>
                                            <th className="h-12 px-4 align-middle">AMOUNT</th>
                                            <th className="h-12 px-4 align-middle">STATUS</th>
                                            <th className="h-12 px-4 align-middle">INVOICE</th>
                                        </tr>
                                    </thead>
                                    <tbody className="[&_tr:last-child]:border-0">
                                        {invoices.map((invoice) => (
                                            <tr key={invoice.id} className="border-b border-default-100 hover:bg-default-50 transition-colors">
                                                <td className="p-4 align-middle">{invoice.date}</td>
                                                <td className="p-4 align-middle">{invoice.amount}</td>
                                                <td className="p-4 align-middle">
                                                    <Chip
                                                        size="sm"
                                                        color={invoice.status === 'Paid' ? 'default' : 'danger'}
                                                        variant="soft"
                                                    >
                                                        {invoice.status}
                                                    </Chip>
                                                </td>
                                                <td className="p-4 align-middle">
                                                    <Link href="#" className="underline text-primary">Download</Link>
                                                </td>
                                            </tr>
                                        ))}
                                    </tbody>
                                </table>
                            </div>
                        )}
                    </Card.Content>
                </Card>
            </div>
        </SettingsPage>
    );
}
