import { getAuditLogs } from '@/app/actions/audit-log';
import { getCurrentAdmin } from '@/app/actions/admin';
import { AuditLogsTable } from '@/components/admin/audit-logs-table';
import { connection } from 'next/server';
import { AdminLogResponse } from '@/lib/db/types';
import { redirect } from 'next/navigation';
import { AdminPageShell } from '@/components/admin/admin-page-shell';

export default async function AuditPage({
    searchParams
}: {
    searchParams: Promise<{ page?: string; action?: string; startDate?: string; endDate?: string }>;
}) {
    const admin = await getCurrentAdmin();
    if (!admin) {
        redirect('/');
    }

    await connection();
    const { page: pageParam, action: actionParam, startDate, endDate } = await searchParams;
    const page = Number(pageParam) || 1;

    // Fetch logs
    let logs: AdminLogResponse[] = [];
    let total = 0;
    let totalPages = 0;
    try {
        const start = startDate ? new Date(startDate) : undefined;
        const end = endDate ? new Date(endDate) : undefined;
        const result = await getAuditLogs(page, 20, actionParam, undefined, start, end);
        logs = result.logs;
        total = result.total;
        totalPages = result.totalPages;
    } catch (error) {
        console.error('Failed to fetch audit logs:', error);
        // Provide empty state or handle error UI if needed
    }

    return (
        <AdminPageShell
            eyebrow="Accountability"
            title="Audit logs"
            description="Review administrative actions and time-bound system changes with filters for action type and date range."
            stats={[
                {
                    label: 'Results',
                    value: total,
                    helper: 'Log entries available for the current filter scope',
                    iconName: 'ScrollText',
                },
                {
                    label: 'Action filter',
                    value: actionParam || 'All',
                    helper: 'Current action type restriction',
                    iconName: 'Activity',
                },
                {
                    label: 'Date range',
                    value: startDate || endDate ? 'Filtered' : 'All time',
                    helper: 'Whether the log timeline is date constrained',
                    iconName: 'CalendarDays',
                },
            ]}
        >
            <AuditLogsTable
                initialLogs={logs}
                totalLogs={total}
                currentPage={page}
                totalPages={totalPages}
                initialActionFilter={actionParam}
                initialStartDate={startDate}
                initialEndDate={endDate}
            />
        </AdminPageShell>
    );
}
