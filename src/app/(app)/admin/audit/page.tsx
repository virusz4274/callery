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
    let total: number | null = null;
    let loadError: string | null = null;
    let totalPages = 0;
    try {
        const start = startDate ? new Date(startDate) : undefined;
        const end = endDate ? new Date(endDate) : undefined;
        if ((start && !Number.isFinite(start.getTime())) || (end && !Number.isFinite(end.getTime())) || (start && end && start > end)) throw new Error('Choose a valid date range with the end date after the start date.');
        const result = await getAuditLogs(page, 20, actionParam, undefined, start, end);
        logs = result.logs;
        total = result.total;
        totalPages = result.totalPages;
    } catch (error) {
        console.error('Failed to fetch audit logs:', error);
        loadError = error instanceof Error ? error.message : 'Please retry loading audit logs.';
    }

    return (
        <AdminPageShell
            eyebrow="Accountability"
            title="Audit logs"


        >
            <AuditLogsTable
                initialLogs={logs}
                loadError={loadError}
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
