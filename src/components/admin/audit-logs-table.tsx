'use client';

import React from 'react';
import {
    Chip,
    Card,
    Spinner,
    Select,
    Label,
    ListBox,
    Button
} from '@heroui/react';
import { ChevronLeft, ChevronRight } from 'lucide-react';
import type { AdminLogResponse } from '@/lib/db/types';
import { useRouter, useSearchParams, usePathname } from 'next/navigation';

type AuditLogsTableProps = {
    initialLogs: AdminLogResponse[];
    totalLogs: number;
    currentPage: number;
    totalPages: number;
    initialActionFilter?: string;
};

const ACTION_TYPES = [
    'USER_BAN', 'USER_UNBAN', 'USER_ROLE_UPDATE', 'USER_LIMITS_UPDATE', 'USER_DELETE',
    'PLAN_CREATE', 'PLAN_UPDATE', 'PLAN_DELETE',
    'SETTINGS_UPDATE',
    'ANNOUNCEMENT_CREATE', 'ANNOUNCEMENT_UPDATE', 'ANNOUNCEMENT_DELETE'
];

export function AuditLogsTable({
    initialLogs,

    currentPage,
    totalPages,
    initialActionFilter
}: AuditLogsTableProps) {
    const router = useRouter();
    const searchParams = useSearchParams();
    const pathname = usePathname();
    const [isPending, startTransition] = React.useTransition();

    const handlePageChange = (page: number) => {
        const params = new URLSearchParams(searchParams);
        params.set('page', page.toString());
        startTransition(() => {
            router.push(`${pathname}?${params.toString()}`);
        });
    };

    const handleActionFilterChange = (key: React.Key | null) => {
        const params = new URLSearchParams(searchParams);
        if (key) {
            params.set('action', key.toString());
        } else {
            params.delete('action');
        }
        params.set('page', '1');
        startTransition(() => {
            router.push(`${pathname}?${params.toString()}`);
        });
    };

    const renderCell = (log: AdminLogResponse, columnKey: React.Key) => {
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
                return (
                    <div className="max-w-md truncate text-tiny text-default-500 font-mono">
                        {JSON.stringify(log.details)}
                    </div>
                );
            case 'target':
                return (
                    <div className="flex flex-col">
                        <span className="text-tiny uppercase font-bold text-default-400">{log.targetType}</span>
                        <span className="text-tiny">{log.targetId}</span>
                    </div>
                );
            case 'date':
                return (
                    <span className="text-small">
                        {new Date(log.createdAt).toLocaleString()}
                    </span>
                );
            default:
                return null;
        }
    };

    return (
        <Card className="p-4">
            <div className="flex justify-between items-center mb-4">
                <h3 className="text-xl font-bold">System Audit Logs</h3>
                {isPending && <Spinner size="sm" />}
            </div>

            <div className="flex gap-4 mb-6">
                <div className="w-64">
                    <Select
                        className="w-full"
                        placeholder="All Actions"
                        selectedKey={initialActionFilter || null}
                        onSelectionChange={(key) => handleActionFilterChange(key)}
                    >
                        <Label>Filter by Action</Label>
                        <Select.Trigger>
                            <Select.Value />
                            <Select.Indicator />
                        </Select.Trigger>
                        <Select.Popover>
                            <ListBox>
                                {ACTION_TYPES.map((action) => (
                                    <ListBox.Item key={action} textValue={action}>
                                        {action}
                                    </ListBox.Item>
                                ))}
                            </ListBox>
                        </Select.Popover>
                    </Select>
                </div>
            </div>

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
                        {initialLogs.length === 0 ? (
                            <tr>
                                <td colSpan={5} className="px-6 py-4 text-center text-sm text-default-500">
                                    No logs found.
                                </td>
                            </tr>
                        ) : (
                            initialLogs.map((log) => (
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

            {totalPages > 1 && (
                <div className="flex justify-center items-center gap-4 mt-4">
                    <Button
                        size="sm"
                        variant="ghost"
                        isDisabled={currentPage <= 1}
                        onPress={() => handlePageChange(currentPage - 1)}
                    >
                        <ChevronLeft size={16} />
                        Previous
                    </Button>
                    <span className="text-sm text-default-400">
                        Page {currentPage} of {totalPages}
                    </span>
                    <Button
                        size="sm"
                        variant="ghost"
                        isDisabled={currentPage >= totalPages}
                        onPress={() => handlePageChange(currentPage + 1)}
                    >
                        Next
                        <ChevronRight size={16} />
                    </Button>
                </div>
            )}
        </Card>
    );
}
