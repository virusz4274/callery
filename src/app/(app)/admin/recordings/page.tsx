import { redirect } from 'next/navigation';
import { connection } from 'next/server';
import { requireCurrentAdmin } from '@/lib/admin-auth';
import { getCompanyRecordings, getTeamAdministration } from '@/app/actions/team';
import { CompanyRecordings } from '@/components/admin/company-recordings';
import { AdminPageShell } from '@/components/admin/admin-page-shell';
import { ActionLink } from '@/components/action-link';

export default async function CompanyRecordingsPage({ searchParams }: {
    searchParams: Promise<{ page?: string; employeeId?: string; search?: string; startDate?: string; endDate?: string }>;
}) {
    await connection();
    await requireCurrentAdmin();
    const administration = await getTeamAdministration();
    if (!administration) redirect('/admin/settings');
    const params = await searchParams;
    const page = Math.max(1, Math.min(100_000, Number(params.page) || 1));
    const data = await getCompanyRecordings({ page,
        ...(params.employeeId ? { employeeId: params.employeeId } : {}), ...(params.search ? { search: params.search } : {}),
        ...(params.startDate ? { startDate: params.startDate } : {}), ...(params.endDate ? { endDate: params.endDate } : {}),
    });
    return <AdminPageShell eyebrow={administration.team.companyName} title="Company recordings" actions={<ActionLink href="/admin/users" variant="secondary">Manage employees</ActionLink>}>
        <CompanyRecordings key={JSON.stringify([params.employeeId, params.search, params.startDate, params.endDate, page])} data={data} administration={administration} />
    </AdminPageShell>;
}
