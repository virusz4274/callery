'use client';

import React from 'react';
import { Chip } from '@heroui/react';
import type { AdminLogResponse } from '@/lib/db/types';

function formatDetails(details: AdminLogResponse['details']) {
    return JSON.stringify(details, null, 2);
}

function renderActionChip(action: string) {
    return (
        <Chip size="sm" variant="soft" color="accent" className="max-w-full truncate">
            {action}
        </Chip>
    );
}

export function AuditLogsTableContent({ logs }: { logs: AdminLogResponse[] }) {
    if (logs.length === 0) {
        return (
            <div className="rounded-[1.5rem] border border-dashed border-default-200/80 bg-default-50/60 px-6 py-12 text-center">
                <p className="text-lg font-semibold text-foreground">No audit entries matched these filters</p>
                <p className="mt-2 text-sm leading-6 text-default-500">
                    Try widening the date range or clearing the action filter to see more admin activity.
                </p>
            </div>
        );
    }

    return (
        <>
            <div className="grid gap-4 lg:hidden">
                {logs.map((log) => (
                    <article key={log.id} className="rounded-[1.4rem] border border-default-200/80 bg-background p-4 shadow-[0_18px_48px_-40px_rgba(15,23,42,0.45)]">
                        <div className="flex items-start justify-between gap-3">
                            <div className="space-y-1">
                                <p className="text-sm font-semibold text-foreground">{log.adminEmail}</p>
                                <p className="text-xs text-default-500">{new Date(log.createdAt).toLocaleString()}</p>
                            </div>
                            {renderActionChip(log.action)}
                        </div>
                        <div className="mt-4 grid gap-3 text-sm">
                            <div>
                                <p className="text-[11px] font-semibold uppercase tracking-[0.16em] text-default-400">Target</p>
                                <p className="mt-1 text-foreground">{log.targetType}</p>
                                <p className="text-default-500">{log.targetId}</p>
                            </div>
                            <div>
                                <p className="text-[11px] font-semibold uppercase tracking-[0.16em] text-default-400">Details</p>
                                <pre className="mt-1 overflow-x-auto rounded-xl bg-default-50 p-3 text-xs leading-5 text-default-600">
                                    {formatDetails(log.details)}
                                </pre>
                            </div>
                        </div>
                    </article>
                ))}
            </div>

            <div className="hidden overflow-hidden rounded-[1.5rem] border border-default-200/80 lg:block">
                <div className="overflow-x-auto">
                    <table className="min-w-full divide-y divide-default-200" aria-label="Audit Logs Table">
                        <thead className="bg-default-50">
                            <tr>
                                <th className="px-5 py-3 text-left text-xs font-semibold uppercase tracking-[0.16em] text-default-500">Date</th>
                                <th className="px-5 py-3 text-left text-xs font-semibold uppercase tracking-[0.16em] text-default-500">Admin</th>
                                <th className="px-5 py-3 text-left text-xs font-semibold uppercase tracking-[0.16em] text-default-500">Action</th>
                                <th className="px-5 py-3 text-left text-xs font-semibold uppercase tracking-[0.16em] text-default-500">Target</th>
                                <th className="px-5 py-3 text-left text-xs font-semibold uppercase tracking-[0.16em] text-default-500">Details</th>
                            </tr>
                        </thead>

                        <tbody className="divide-y divide-default-100 bg-background">
                            {logs.map((log) => (
                                <tr key={log.id} className="align-top">
                                    <td className="px-5 py-4 whitespace-nowrap text-sm text-foreground">
                                        {new Date(log.createdAt).toLocaleString()}
                                    </td>
                                    <td className="px-5 py-4 whitespace-nowrap">
                                        <div className="flex flex-col">
                                            <span className="text-sm font-medium text-foreground">{log.adminEmail}</span>
                                            <span className="text-xs text-default-400">{log.adminId}</span>
                                        </div>
                                    </td>
                                    <td className="px-5 py-4 whitespace-nowrap">{renderActionChip(log.action)}</td>
                                    <td className="px-5 py-4 whitespace-nowrap">
                                        <div className="flex flex-col gap-1">
                                            <span className="text-[11px] font-semibold uppercase tracking-[0.16em] text-default-400">{log.targetType}</span>
                                            <span className="text-sm text-foreground">{log.targetId}</span>
                                        </div>
                                    </td>
                                    <td className="px-5 py-4">
                                        <pre className="max-w-xl overflow-x-auto rounded-xl bg-default-50 p-3 text-xs leading-5 text-default-600">
                                            {formatDetails(log.details)}
                                        </pre>
                                    </td>
                                </tr>
                            ))}
                        </tbody>
                    </table>
                </div>
            </div>
        </>
    );
}
