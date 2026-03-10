import React from 'react';
import { Card, Chip } from '@heroui/react';
import { ClientFormattedDate } from '@/components/client-formatted-date';
import type { Invoice } from '@/lib/types';

type UserPaymentHistoryPanelProps = {
    invoices: Invoice[];
};

export function UserPaymentHistoryPanel({ invoices }: UserPaymentHistoryPanelProps) {
    return (
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
                            {invoices.length > 0 ? (
                                invoices.map((invoice) => (
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
                                ))
                            ) : (
                                <tr>
                                    <td colSpan={4} className="p-4 text-center">
                                        No invoices.
                                    </td>
                                </tr>
                            )}
                        </tbody>
                    </table>
                </div>
            </Card.Content>
        </Card>
    );
}
