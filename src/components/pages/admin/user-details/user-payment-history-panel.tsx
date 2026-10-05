import { Card, Chip } from '@heroui/react';
import { ClientFormattedDate } from '@/components/client-formatted-date';
import type { Invoice } from '@/lib/types';

type UserPaymentHistoryPanelProps = {
    invoices: Invoice[];
};

export function UserPaymentHistoryPanel({ invoices }: UserPaymentHistoryPanelProps) {
    return (
        <Card className="rounded-[2rem] border border-default-200/80 bg-background/95 shadow-[0_20px_54px_-44px_rgba(15,23,42,0.45)]">
            <Card.Header className="border-b border-default-100/70 px-6 py-5">
                <div className="flex flex-col">
                    <h3 className="text-lg font-bold tracking-[-0.03em] text-foreground">Payment history</h3>
                    <p className="text-small text-default-500">A record of all invoices for this user.</p>
                </div>
            </Card.Header>
            <Card.Content className="p-6">
                <div className="overflow-hidden rounded-xl border border-default-200/80">
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
