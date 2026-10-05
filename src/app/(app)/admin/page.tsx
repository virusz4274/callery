import { Suspense } from 'react';
import { getSystemStats, getOrphanedRecordingsCount, getCurrentAdmin } from '@/app/actions/admin';
import { AdminDashboard } from '@/components/pages/admin/admin-dashboard';
import { redirect } from 'next/navigation';
import { AdminLoadingState } from '@/components/loading-shells';

export default async function AdminPage() {
    const admin = await getCurrentAdmin();
    if (!admin) {
        redirect('/');
    }

    const stats = await getSystemStats();
    const orphanedCount = await getOrphanedRecordingsCount();

    return (
        <Suspense fallback={<AdminLoadingState />}>
            <AdminDashboard stats={stats} orphanedCount={orphanedCount} />
        </Suspense>
    );
}
