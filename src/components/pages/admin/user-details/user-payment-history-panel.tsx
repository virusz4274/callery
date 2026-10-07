import { Card, Chip, Table } from '@heroui/react';
import { ClientFormattedDate } from '@/components/client-formatted-date';
import type { Invoice } from '@/lib/types';

type UserPaymentHistoryPanelProps = {
    invoices: Invoice[];
};

export function UserPaymentHistoryPanel({ invoices }: UserPaymentHistoryPanelProps) {
    return (
        <Card>
            <Card.Header className="border-b border-border px-6 py-5">
                <div className="flex flex-col">
                    <h3 className="text-lg font-bold text-foreground">Payment history</h3>
                    <p className="text-small text-muted">The most recent invoices available for this user.</p>
                </div>
            </Card.Header>
            <Card.Content className="p-6">
                <div className="min-w-0">
                    <Table><Table.ScrollContainer><Table.Content aria-label="Payment history">
                        <Table.Header>
                                <Table.Column id="column-1" isRowHeader>Invoice ID</Table.Column>
                                <Table.Column id="column-2">Date</Table.Column>
                                <Table.Column id="column-3">Amount</Table.Column>
                                <Table.Column id="column-4" className="text-right">Status</Table.Column>
                            </Table.Header>
                        <Table.Body renderEmptyState={() => <p className="py-6 text-center text-muted">No invoices.</p>}>
                            {(
                                invoices.map((invoice) => (
                                    <Table.Row key={invoice.id} id={invoice.id}>
                                        <Table.Cell className="p-4 align-middle font-medium">{invoice.id}</Table.Cell>
                                        <Table.Cell className="p-4 align-middle">
                                            <ClientFormattedDate date={invoice.date} formatString="MMMM dd, yyyy" />
                                        </Table.Cell>
                                        <Table.Cell className="p-4 align-middle">${invoice.amount.toFixed(2)}</Table.Cell>
                                        <Table.Cell className="p-4 align-middle text-right">
                                            <Chip
                                                color={invoice.status === 'Paid' ? 'success' : 'danger'}
                                                variant="soft"
                                                size="sm"
                                            >
                                                {invoice.status}
                                            </Chip>
                                        </Table.Cell>
                                    </Table.Row>
                                ))
                            )}
                        </Table.Body>
                    </Table.Content></Table.ScrollContainer></Table>
                </div>
            </Card.Content>
        </Card>
    );
}
