'use client';

import React from 'react';
import { Card, Spinner } from '@heroui/react';
import { usePathname, useRouter, useSearchParams } from 'next/navigation';
import { auditCalendarDate } from '@/lib/admin-validation';
import { AdminFeedback } from './admin-feedback';
import type { AdminLogResponse } from '@/lib/db/types';
import { AuditLogsFilters } from './audit-logs/audit-logs-filters';
import { AuditLogsPagination } from './audit-logs/audit-logs-pagination';
import { AuditLogsTableContent } from './audit-logs/audit-logs-table-content';

type AuditLogsTableProps = {
    initialLogs: AdminLogResponse[];
    totalLogs: number | null;
    loadError?: string | null;
    currentPage: number;
    totalPages: number;
    initialActionFilter?: string;
    initialStartDate?: string;
    initialEndDate?: string;
};

export function AuditLogsTable({
    initialLogs,
    loadError,
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
    const [dateError, setDateError] = React.useState<string | null>(null);

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
        const start = type === 'startDate' ? value : auditCalendarDate(initialStartDate);
        const end = type === 'endDate' ? value : auditCalendarDate(initialEndDate);
        if (start && end && start > end) { setDateError('Choose an end date on or after the start date.'); return; }
        setDateError(null);
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
        setDateError(null);
        navigateWithParams((params) => {
            params.delete('action');
            params.delete('startDate');
            params.delete('endDate');
            params.set('page', '1');
        });
    };

    return (
        <Card className="p-4 sm:p-5">
            <div className="mb-4 flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
                <div>
                    <p aria-live="polite" className="text-sm text-muted">{totalLogs === null ? 'Count unavailable' : `${totalLogs} matching events`}</p>
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

            {dateError && <p role="alert" className="mb-4 text-sm text-danger">{dateError}</p>}
            {loadError ? <AdminFeedback title="Could not load audit logs" message={loadError} onRetry={() => startTransition(() => router.refresh())} pending={isPending} /> : <AuditLogsTableContent logs={initialLogs} /> }

            {!loadError && <AuditLogsPagination
                currentPage={currentPage}
                totalPages={totalPages}
                onPageChange={handlePageChange}
            />}
        </Card>
    );
}
