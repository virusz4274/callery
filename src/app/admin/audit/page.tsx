import { getAuditLogs } from '@/app/actions/audit-log';
import { AuditLogsTable } from '@/components/admin/audit-logs-table';
import { connection } from 'next/server';
import { AdminLogResponse } from '@/lib/db/types';

export default async function AuditPage({
    searchParams
}: {
    searchParams: Promise<{ page?: string; action?: string }>;
}) {
    await connection();
    const { page: pageParam, action: actionParam } = await searchParams;
    const page = Number(pageParam) || 1;

    // Fetch logs
    let logs: AdminLogResponse[] = [];
    let total = 0;
    let totalPages = 0;
    try {
        const result = await getAuditLogs(page, 20, actionParam);
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
            />
        </div>
    );
}
