import { Suspense } from 'react';
import { getUsers } from '@/app/actions/admin';
import { getPlans } from '@/app/actions/admin-plans';
import { UserManagementTable } from '@/components/admin/user-management-table';
import { Spinner } from '@/components/ui-primitives';

export default async function UsersPage({
    searchParams,
}: {
    searchParams: Promise<{ page?: string; search?: string }>;
}) {
    const { page: pageParam, search: searchParam } = await searchParams;
    const page = Number(pageParam) || 1;
    const search = searchParam || '';

    // Fetches run in parallel
    const [data, plans] = await Promise.all([
        getUsers(page, 10, search),
        getPlans()
    ]);

    return (
        <div className="space-y-6">
            <div>
                <h1 className="text-3xl font-bold tracking-tight">User Management</h1>
                <p className="text-default-500">Manage system users, roles, and limits.</p>
            </div>

            <Suspense fallback={<div className="flex justify-center p-8"><Spinner size="lg" /></div>}>
                <UserManagementTable
                    initialUsers={data.users}
                    totalUsers={data.total}
                    currentPage={data.page}
                    totalPages={data.totalPages}
                    initialSearch={search}
                    plans={plans}
                />
            </Suspense>
        </div>
    );
}
