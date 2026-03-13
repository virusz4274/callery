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
    totalLogs,
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
            const query = params.toString();
            router.push(query ? `${pathname}?${query}` : pathname);
        });
    };

    const getDateBoundaryIso = (value: string, boundary: 'start' | 'end') => {
        const [year, month, day] = value.split('-').map(Number);
        const date = boundary === 'start'
            ? new Date(year, month - 1, day, 0, 0, 0, 0)
            : new Date(year, month - 1, day, 23, 59, 59, 999);

        return date.toISOString();
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
                params.set(type, getDateBoundaryIso(value, type === 'startDate' ? 'start' : 'end'));
            } else {
                params.delete(type);
            }
            params.set('page', '1');
        });
    };

    const handleClearFilters = () => {
        navigateWithParams((params) => {
            params.delete('action');
            params.delete('startDate');
            params.delete('endDate');
            params.set('page', '1');
        });
    };

    return (
        <Card className="rounded-[1.9rem] border border-default-200/80 bg-background/95 p-4 shadow-[0_24px_64px_-48px_rgba(15,23,42,0.45)] sm:p-5">
            <div className="mb-4 flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
                <div>
                    <h3 className="text-xl font-bold tracking-[-0.03em] text-foreground">System audit logs</h3>
                    <p className="text-sm text-default-500">{totalLogs} matching events across admin actions, account changes, and system controls.</p>
                </div>
                {isPending && <Spinner size="sm" />}
            </div>

            <AuditLogsFilters
                initialActionFilter={initialActionFilter}
                initialStartDate={initialStartDate}
                initialEndDate={initialEndDate}
                onActionFilterChange={handleActionFilterChange}
                onDateChange={handleDateChange}
                onClearFilters={handleClearFilters}
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
