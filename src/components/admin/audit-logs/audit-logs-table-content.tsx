'use client';

import React from 'react';
import { Chip } from '@heroui/react';
import type { AdminLogResponse } from '@/lib/db/types';

type AuditLogsTableContentProps = {
    logs: AdminLogResponse[];
};

function renderCell(log: AdminLogResponse, columnKey: React.Key) {
    switch (columnKey) {
        case 'action':
            return (
                <Chip size="sm" variant="soft" color="accent">
                    {log.action}
                </Chip>
            );
        case 'admin':
            return (
                <div className="flex flex-col">
                    <span className="text-small font-medium">{log.adminEmail}</span>
                    <span className="text-tiny text-default-400">{log.adminId}</span>
                </div>
            );
        case 'details':
            return <div className="max-w-md truncate text-tiny text-default-500 font-mono">{JSON.stringify(log.details)}</div>;
        case 'target':
            return (
                <div className="flex flex-col">
                    <span className="text-tiny uppercase font-bold text-default-400">{log.targetType}</span>
                    <span className="text-tiny">{log.targetId}</span>
                </div>
            );
        case 'date':
            return <span className="text-small">{new Date(log.createdAt).toLocaleString()}</span>;
        default:
            return null;
    }
}

export function AuditLogsTableContent({ logs }: AuditLogsTableContentProps) {
    return (
        <div className="overflow-x-auto">
            <table className="min-w-full divide-y divide-default-200" aria-label="Audit Logs Table">
                <thead className="bg-default-100">
                    <tr>
                        <th className="px-6 py-3 text-left text-xs font-medium text-default-500 uppercase tracking-wider">DATE</th>
                        <th className="px-6 py-3 text-left text-xs font-medium text-default-500 uppercase tracking-wider">ADMIN</th>
                        <th className="px-6 py-3 text-left text-xs font-medium text-default-500 uppercase tracking-wider">ACTION</th>
                        <th className="px-6 py-3 text-left text-xs font-medium text-default-500 uppercase tracking-wider">TARGET</th>
                        <th className="px-6 py-3 text-left text-xs font-medium text-default-500 uppercase tracking-wider">DETAILS</th>
                    </tr>
                </thead>

                <tbody className="bg-content1 divide-y divide-default-200">
                    {logs.length === 0 ? (
                        <tr>
                            <td colSpan={5} className="px-6 py-4 text-center text-sm text-default-500">
                                No logs found.
                            </td>
                        </tr>
                    ) : (
                        logs.map((log) => (
                            <tr key={log.id}>
                                <td className="px-6 py-4 whitespace-nowrap">{renderCell(log, 'date')}</td>
                                <td className="px-6 py-4 whitespace-nowrap">{renderCell(log, 'admin')}</td>
                                <td className="px-6 py-4 whitespace-nowrap">{renderCell(log, 'action')}</td>
                                <td className="px-6 py-4 whitespace-nowrap">{renderCell(log, 'target')}</td>
                                <td className="px-6 py-4 whitespace-nowrap">{renderCell(log, 'details')}</td>
                            </tr>
                        ))
                    )}
                </tbody>
            </table>
        </div>
    );
}
