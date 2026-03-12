import React from 'react';
import { Card, Chip, Link, Spinner } from '@heroui/react';
import { ReceiptText } from 'lucide-react';
import type { Invoice } from './types';

type BillingHistoryCardProps = {
    invoices: Invoice[];
    isLoading: boolean;
    error?: string | null;
};

function StatusChip({ status }: { status: Invoice['status'] }) {
    return (
        <Chip
            color={status === 'Paid' ? 'success' : status === 'Failed' ? 'danger' : 'warning'}
            size="sm"
            variant="soft"
        >
            {status}
        </Chip>
    );
}

export function BillingHistoryCard({ invoices, isLoading, error }: BillingHistoryCardProps) {
    return (
        <Card className="rounded-[1.6rem] border border-default-200/80 bg-background/95 shadow-[0_20px_56px_-44px_rgba(15,23,42,0.45)]">
            <Card.Header className="flex flex-col items-start gap-2 border-b border-default-100/80 px-5 py-5 sm:px-6">
                <div className="flex items-center gap-3">
                    <div className="flex h-11 w-11 items-center justify-center rounded-2xl bg-primary/10 text-primary">
                        <ReceiptText className="h-5 w-5" />
                    </div>
                    <div>
                        <h4 className="text-lg font-semibold tracking-[-0.03em] text-foreground">Billing history</h4>
                        <p className="text-sm text-default-500">Review recent invoices, payment status, and downloadable receipts.</p>
                    </div>
                </div>
            </Card.Header>
            <Card.Content className="p-5 sm:p-6">
                {isLoading ? (
                    <div className="flex justify-center rounded-[1.3rem] border border-default-200/80 bg-default-50/70 p-8">
                        <Spinner />
                    </div>
                ) : error ? (
                    <div className="rounded-[1.3rem] bg-danger/10 px-4 py-3 text-sm text-danger">{error}</div>
                ) : invoices.length === 0 ? (
                    <div className="rounded-[1.3rem] border border-dashed border-default-200/80 bg-default-50/70 px-6 py-10 text-center">
                        <p className="text-lg font-semibold text-foreground">No invoices yet</p>
                        <p className="mt-2 text-sm leading-6 text-default-500">
                            Once the account starts billing, invoices and receipt links will appear here.
                        </p>
                    </div>
                ) : (
                    <>
                        <div className="grid gap-4 md:hidden">
                            {invoices.map((invoice) => (
                                <article key={invoice.id} className="rounded-[1.3rem] border border-default-200/80 bg-default-50/70 p-4">
                                    <div className="flex items-start justify-between gap-3">
                                        <div>
                                            <p className="text-sm font-semibold text-foreground">{invoice.id}</p>
                                            <p className="text-sm text-default-500">{new Date(invoice.date).toLocaleDateString()}</p>
                                        </div>
                                        <StatusChip status={invoice.status} />
                                    </div>
                                    <div className="mt-4 flex items-center justify-between gap-3">
                                        <p className="text-lg font-semibold text-foreground">${invoice.amount.toFixed(2)}</p>
                                        {invoice.url ? (
                                            <Link href={invoice.url} target="_blank" rel="noopener noreferrer" className="text-sm">
                                                View receipt
                                            </Link>
                                        ) : null}
                                    </div>
                                </article>
                            ))}
                        </div>

                        <div className="hidden overflow-hidden rounded-[1.3rem] border border-default-200/80 md:block">
                            <table className="w-full text-sm">
                                <thead className="border-b border-default-200 bg-default-50 text-default-500">
                                    <tr>
                                        <th className="py-3 pl-4 pr-2 text-left font-semibold uppercase tracking-[0.14em]">Invoice</th>
                                        <th className="px-2 py-3 text-left font-semibold uppercase tracking-[0.14em]">Date</th>
                                        <th className="px-2 py-3 text-left font-semibold uppercase tracking-[0.14em]">Amount</th>
                                        <th className="px-2 py-3 text-right font-semibold uppercase tracking-[0.14em]">Status</th>
                                    </tr>
                                </thead>
                                <tbody>
                                    {invoices.map((invoice) => (
                                        <tr key={invoice.id} className="border-b border-default-100 last:border-0">
                                            <td className="py-4 pl-4 pr-2 font-medium text-foreground">
                                                {invoice.url ? (
                                                    <Link href={invoice.url} target="_blank" rel="noopener noreferrer">
                                                        {invoice.id}
                                                    </Link>
                                                ) : (
                                                    invoice.id
                                                )}
                                            </td>
                                            <td className="px-2 py-4 text-default-600">
                                                {new Date(invoice.date).toLocaleDateString()}
                                            </td>
                                            <td className="px-2 py-4 text-default-700">${invoice.amount.toFixed(2)}</td>
                                            <td className="px-2 py-4 text-right">
                                                <StatusChip status={invoice.status} />
                                            </td>
                                        </tr>
                                    ))}
                                </tbody>
                            </table>
                        </div>
                    </>
                )}
            </Card.Content>
        </Card>
    );
}
