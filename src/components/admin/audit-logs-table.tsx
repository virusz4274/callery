'use client';

import React from 'react';
import { Card, Spinner } from '@heroui/react';
import { usePathname, useRouter, useSearchParams } from 'next/navigation';
import type { AdminLogResponse } from '@/lib/db/types';
import { AuditLogsFilters } from './audit-logs/audit-logs-filters';
import { AuditLogsPagination } from './audit-logs/audit-logs-pagination';
import { AuditLogsTableContent } from './audit-logs/audit-logs-table-content';

type AuditLogsTableProps = {
    initialLogs: AdminLogResponse[];
    totalLogs: number;
    currentPage: number;
    totalPages: number;
    initialActionFilter?: string;
    initialStartDate?: string;
    initialEndDate?: string;
};

export function AuditLogsTable({
    initialLogs,
    currentPage,
    totalPages,
    initialActionFilter,
    initialStartDate,
    initialEndDate,
}: AuditLogsTableProps) {
    const router = useRouter();
    const searchParams = useSearchParams();
    const pathname = usePathname();
    const [isPending, startTransition] = React.useTransition();

    const navigateWithParams = (mutate: (params: URLSearchParams) => void) => {
        const params = new URLSearchParams(searchParams);
        mutate(params);
        startTransition(() => {
            router.push(`${pathname}?${params.toString()}`);
        });
    };

    const handlePageChange = (page: number) => {
        navigateWithParams((params) => {
            params.set('page', page.toString());
        });
    };

    const handleActionFilterChange = (key: React.Key | null) => {
        navigateWithParams((params) => {
            if (key) {
                params.set('action', key.toString());
            } else {
                params.delete('action');
            }
            params.set('page', '1');
        });
    };

    const handleDateChange = (type: 'startDate' | 'endDate', value: string) => {
        navigateWithParams((params) => {
            if (value) {
                params.set(type, new Date(value).toISOString());
            } else {
                params.delete(type);
            }
            params.set('page', '1');
        });
    };

    return (
        <Card className="p-4">
            <div className="flex justify-between items-center mb-4">
                <h3 className="text-xl font-bold">System Audit Logs</h3>
                {isPending && <Spinner size="sm" />}
            </div>

            <AuditLogsFilters
                initialActionFilter={initialActionFilter}
                initialStartDate={initialStartDate}
                initialEndDate={initialEndDate}
                onActionFilterChange={handleActionFilterChange}
                onDateChange={handleDateChange}
            />

            <AuditLogsTableContent logs={initialLogs} />

            <AuditLogsPagination
                currentPage={currentPage}
                totalPages={totalPages}
                onPageChange={handlePageChange}
            />
        </Card>
    );
}
