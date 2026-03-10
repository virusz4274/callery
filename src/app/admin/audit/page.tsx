import { getAuditLogs } from '@/app/actions/audit-log';
import { getCurrentAdmin } from '@/app/actions/admin';
import { AuditLogsTable } from '@/components/admin/audit-logs-table';
import { connection } from 'next/server';
import { AdminLogResponse } from '@/lib/db/types';
import { redirect } from 'next/navigation';

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
        <div className="p-6 max-w-7xl mx-auto space-y-6">
            <h1 className="text-3xl font-bold">Audit Logs</h1>
            <p className="text-default-500">Track all administrative actions and system changes.</p>

            <AuditLogsTable
                initialLogs={logs}
                totalLogs={total}
                currentPage={page}
                totalPages={totalPages}
                initialActionFilter={actionParam}
                initialStartDate={startDate}
                initialEndDate={endDate}
            />
        </div>
    );
}
