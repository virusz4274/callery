import { Suspense } from 'react';
import { getSystemStats, getOrphanedRecordingsCount, getCurrentAdmin } from '@/app/actions/admin';
import { AdminDashboard } from '@/components/pages/admin/admin-dashboard';
import { Spinner } from '@/components/ui-primitives';
import { redirect } from 'next/navigation';

export default async function AdminPage() {
    const admin = await getCurrentAdmin();
    if (!admin) {
        redirect('/');
    }

    const stats = await getSystemStats();
    const orphanedCount = await getOrphanedRecordingsCount();

    return (
        <Suspense fallback={<div className="flex justify-center p-8"><Spinner size="lg" /></div>}>
            <AdminDashboard stats={stats} orphanedCount={orphanedCount} />
        </Suspense>
    );
}
