import { getAuditLogs } from '@/app/actions/audit-log';
import { AuditLogsTable } from '@/components/admin/audit-logs-table';

export default async function AuditPage({
    searchParams
}: {
    searchParams: Promise<{ page?: string; action?: string }>;
}) {
    const { page: pageParam, action: actionParam } = await searchParams;
    const page = Number(pageParam) || 1;

    // Fetch logs
    const { logs, total, totalPages } = await getAuditLogs(page, 20, actionParam);

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
