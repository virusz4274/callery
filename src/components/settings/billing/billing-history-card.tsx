import { Card, Chip, Link, Spinner, Surface, Table } from '@heroui/react';
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
        <Card>
            <Card.Header className="flex flex-col items-start gap-2 border-b border-border px-5 py-5 sm:px-6">
                <div className="flex items-center gap-3">
                    <div className="flex h-11 w-11 items-center justify-center rounded-2xl bg-primary/10 text-primary">
                        <ReceiptText className="h-5 w-5" />
                    </div>
                    <div>
                        <h4 className="text-lg font-semibold text-foreground">Billing history</h4>
                    </div>
                </div>
            </Card.Header>
            <Card.Content className="p-5 sm:p-6">
                {isLoading ? (
                    <div className="flex justify-center rounded-xl border border-border bg-default-50/70 p-8">
                        <Spinner />
                    </div>
                ) : error ? (
                    <div className="rounded-xl bg-danger/10 px-4 py-3 text-sm text-danger">{error}</div>
                ) : invoices.length === 0 ? (
                    <div className="rounded-xl border border-dashed border-border bg-default-50/70 px-6 py-10 text-center">
                        <p className="text-sm text-muted">No invoices yet</p>
                    </div>
                ) : (
                    <>
                        <div className="grid gap-4 md:hidden">
                            {invoices.map((invoice) => (
                                <Surface key={invoice.id} variant="secondary" className="p-4">
                                    <div className="flex items-start justify-between gap-3">
                                        <div>
                                            <p className="text-sm font-semibold text-foreground">{invoice.id}</p>
                                            <p className="text-sm text-muted">{new Date(invoice.date).toLocaleDateString()}</p>
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
                                </Surface>
                            ))}
                        </div>

                        <div className="hidden min-w-0 md:block">
                            <Table><Table.ScrollContainer><Table.Content aria-label="Billing history">
                                <Table.Header>
                                        <Table.Column id="column-1" isRowHeader>Invoice</Table.Column>
                                        <Table.Column id="column-2">Date</Table.Column>
                                        <Table.Column id="column-3">Amount</Table.Column>
                                        <Table.Column id="column-4" className="text-right">Status</Table.Column>
                                    </Table.Header>
                                <Table.Body renderEmptyState={() => <p className="py-6 text-center text-muted">No invoices.</p>}>
                                    {invoices.map((invoice) => (
                                        <Table.Row key={invoice.id} id={invoice.id}>
                                            <Table.Cell className="font-medium text-foreground">
                                                {invoice.url ? (
                                                    <Link href={invoice.url} target="_blank" rel="noopener noreferrer">
                                                        {invoice.id}
                                                    </Link>
                                                ) : (
                                                    invoice.id
                                                )}
                                            </Table.Cell>
                                            <Table.Cell className="text-muted">
                                                {new Date(invoice.date).toLocaleDateString()}
                                            </Table.Cell>
                                            <Table.Cell className="text-foreground">${invoice.amount.toFixed(2)}</Table.Cell>
                                            <Table.Cell className="text-right">
                                                <StatusChip status={invoice.status} />
                                            </Table.Cell>
                                        </Table.Row>
                                    ))}
                                </Table.Body>
                            </Table.Content></Table.ScrollContainer></Table>
                        </div>
                    </>
                )}
            </Card.Content>
        </Card>
    );
}
