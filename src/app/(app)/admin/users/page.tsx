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
