import React from 'react';
import { Card, Chip, Link, Spinner } from '@heroui/react';
import type { Invoice } from './types';

type BillingHistoryCardProps = {
    invoices: Invoice[];
    isLoading: boolean;
    error?: string | null;
};

export function BillingHistoryCard({ invoices, isLoading, error }: BillingHistoryCardProps) {
    return (
        <Card className="bg-card/70 border-default-200">
            <Card.Header>
                <h4 className="text-base font-medium">Billing History</h4>
            </Card.Header>
            <Card.Content>
                {isLoading ? (
                    <div className="flex justify-center p-4">
                        <Spinner />
                    </div>
                ) : error ? (
                    <div className="p-4 text-center text-danger text-sm">{error}</div>
                ) : invoices.length === 0 ? (
                    <div className="p-4 text-center text-default-500 text-sm">No invoices found.</div>
                ) : (
                    <div className="overflow-x-auto">
                        <table className="w-full text-sm">
                            <thead className="text-default-500 border-b border-default-200">
                                <tr>
                                    <th className="text-left py-2 pr-2">Invoice</th>
                                    <th className="text-left py-2 pr-2">Date</th>
                                    <th className="text-left py-2 pr-2">Amount</th>
                                    <th className="text-right py-2">Status</th>
                                </tr>
                            </thead>
                            <tbody>
                                {invoices.map((invoice) => (
                                    <tr key={invoice.id} className="border-b border-default-100 last:border-0">
                                        <td className="py-3 pr-2 font-medium">
                                            {invoice.url ? (
                                                <Link href={invoice.url} target="_blank" rel="noopener noreferrer">
                                                    {invoice.id}
                                                </Link>
                                            ) : (
                                                invoice.id
                                            )}
                                        </td>
                                        <td className="py-3 pr-2 text-default-600">
                                            {new Date(invoice.date).toLocaleDateString()}
                                        </td>
                                        <td className="py-3 pr-2 text-default-700">${invoice.amount.toFixed(2)}</td>
                                        <td className="py-3 text-right">
                                            <Chip
                                                color={invoice.status === 'Paid' ? 'success' : invoice.status === 'Failed' ? 'danger' : 'warning'}
                                                size="sm"
                                                variant="soft"
                                            >
                                                {invoice.status}
                                            </Chip>
                                        </td>
                                    </tr>
                                ))}
                            </tbody>
                        </table>
                    </div>
                )}
            </Card.Content>
        </Card>
    );
}
