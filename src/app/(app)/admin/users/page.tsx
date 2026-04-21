import { Suspense } from 'react';
import { getUsers, getCurrentAdmin } from '@/app/actions/admin';
import { getPlans } from '@/app/actions/admin-plans';
import { UserManagementTable } from '@/components/admin/user-management-table';
import { redirect } from 'next/navigation';
import { AdminPageShell } from '@/components/admin/admin-page-shell';
import { AdminLoadingState } from '@/components/loading-shells';

export default async function UsersPage({
    searchParams,
}: {
    searchParams: Promise<{ page?: string; search?: string }>;
}) {
    const admin = await getCurrentAdmin();
    if (!admin) {
        redirect('/');
    }

    const { page: pageParam, search: searchParam } = await searchParams;
    const page = Number(pageParam) || 1;
    const search = searchParam || '';

    // Fetches run in parallel
    const [data, plans] = await Promise.all([
        getUsers(page, 10, search),
        getPlans()
    ]);

    return (
        <AdminPageShell
            eyebrow="Accounts and access"
            title="User management"
            description="Search accounts, adjust plans and limits, and inspect operational state without leaving the admin console."
            stats={[
                {
                    label: 'Users',
                    value: data.total,
                    helper: 'Accounts matching the current system scope',
                    iconName: 'Users',
                },
                {
                    label: 'Search',
                    value: search || 'None',
                    helper: 'Current search filter applied to the table',
                    iconName: 'Search',
                },
                {
                    label: 'Plans',
                    value: plans.length,
                    helper: 'Available plans that can be assigned to users',
                    iconName: 'ShieldCheck',
                },
            ]}
        >
            <Suspense fallback={<AdminLoadingState />}>
                <UserManagementTable
                    initialUsers={data.users}
                    totalUsers={data.total}
                    currentPage={data.page}
                    totalPages={data.totalPages}
                    initialSearch={search}
                    plans={plans}
                />
            </Suspense>
        </AdminPageShell>
    );
}
