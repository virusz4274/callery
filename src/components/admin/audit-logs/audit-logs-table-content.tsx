'use client';

import { Accordion, Chip, Table, Surface } from '@heroui/react';
import type { AdminLogResponse } from '@/lib/db/types';

function formatDetails(details: AdminLogResponse['details']) {
    return JSON.stringify(details, null, 2);
}

function AuditDetails({ log }: { log: AdminLogResponse }) {
    const summary = Object.keys(log.details || {}).join(', ') || 'No details';
    return <div className="min-w-0 max-w-lg">
        <p className="line-clamp-2 break-words text-sm text-muted">{summary}</p>
        <Accordion><Accordion.Item id="details"><Accordion.Heading><Accordion.Trigger aria-label={`Details for ${log.action} by ${log.adminEmail}`} className="min-h-11 text-sm">View details<Accordion.Indicator /></Accordion.Trigger></Accordion.Heading><Accordion.Panel><Accordion.Body><pre className="max-h-64 overflow-auto whitespace-pre-wrap break-all rounded-lg bg-surface-secondary p-3 text-xs leading-5 text-foreground">{formatDetails(log.details)}</pre></Accordion.Body></Accordion.Panel></Accordion.Item></Accordion>
    </div>;
}

function renderActionChip(action: string) {
    return (
        <Chip size="sm" variant="soft" color="accent" className="max-w-full">
            {action}
        </Chip>
    );
}

export function AuditLogsTableContent({ logs }: { logs: AdminLogResponse[] }) {
    if (logs.length === 0) {
        return (
            <Surface variant="secondary" className="border-dashed px-6 py-12 text-center">
                <p className="text-lg font-semibold text-foreground">No audit entries matched these filters</p>
                <p className="mt-2 text-sm leading-6 text-muted">
                    Try widening the date range or clearing the action filter to see more admin activity.
                </p>
            </Surface>
        );
    }

    return (
        <>
            <div className="grid min-w-0 gap-4 xl:hidden">
                {logs.map((log) => (
                    <Surface key={log.id} variant="secondary" className="p-4">
                        <div className="flex flex-wrap items-start justify-between gap-3">
                            <div className="space-y-1">
                                <p className="break-all text-sm font-semibold text-foreground">{log.adminEmail}</p>
                                <p className="text-xs text-muted">{new Date(log.createdAt).toLocaleString()}</p>
                            </div>
                            {renderActionChip(log.action)}
                        </div>
                        <div className="mt-4 grid gap-3 text-sm">
                            <div>
                                <p className="text-xs font-semibold uppercase text-muted">Target</p>
                                <p className="mt-1 text-foreground">{log.targetType}</p>
                                <p className="break-all text-muted">{log.targetId}</p>
                            </div>
                            <div>
                                <p className="text-xs font-semibold uppercase text-muted">Details</p>
                                <AuditDetails log={log} />
                            </div>
                        </div>
                    </Surface>
                ))}
            </div>

            <Surface variant="secondary" className="hidden overflow-hidden xl:block">
                <Table variant="secondary">
                    <Table.ScrollContainer className="overflow-x-auto">
                        <Table.Content aria-label="Audit Logs Table" className="min-w-[960px]">
                            <Table.Header>
                                <Table.Column id="date" isRowHeader>
                                    Date
                                </Table.Column>
                                <Table.Column id="admin">Admin</Table.Column>
                                <Table.Column id="action">Action</Table.Column>
                                <Table.Column id="target">Target</Table.Column>
                                <Table.Column id="details">Details</Table.Column>
                            </Table.Header>

                            <Table.Body>
                                {logs.map((log) => (
                                    <Table.Row key={log.id} id={log.id}>
                                        <Table.Cell className="whitespace-nowrap text-sm text-foreground">
                                            {new Date(log.createdAt).toLocaleString()}
                                        </Table.Cell>
                                        <Table.Cell className="whitespace-nowrap">
                                            <div className="flex flex-col">
                                                <span className="text-sm font-medium text-foreground">{log.adminEmail}</span>
                                                <span className="text-xs text-muted">{log.adminId}</span>
                                            </div>
                                        </Table.Cell>
                                        <Table.Cell className="whitespace-nowrap">
                                            {renderActionChip(log.action)}
                                        </Table.Cell>
                                        <Table.Cell className="whitespace-nowrap">
                                            <div className="flex flex-col gap-1">
                                                <span className="text-xs font-semibold uppercase text-muted">
                                                    {log.targetType}
                                                </span>
                                                <span className="text-sm text-foreground">{log.targetId}</span>
                                            </div>
                                        </Table.Cell>
                                        <Table.Cell>
                                            <AuditDetails log={log} />
                                        </Table.Cell>
                                    </Table.Row>
                                ))}
                            </Table.Body>
                        </Table.Content>
                    </Table.ScrollContainer>
                </Table>
            </Surface>
        </>
    );
}
