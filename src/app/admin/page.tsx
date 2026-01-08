import { Suspense } from 'react';
import { getSystemStats, getOrphanedRecordingsCount } from '@/app/actions/admin';
import { AdminDashboard } from '@/components/pages/admin/admin-dashboard';
import { Spinner } from '@/components/ui-primitives';

export default async function AdminPage() {
    const stats = await getSystemStats();
    const orphanedCount = await getOrphanedRecordingsCount();

    return (
        <Suspense fallback={<div className="flex justify-center p-8"><Spinner size="lg" /></div>}>
            <AdminDashboard stats={stats} orphanedCount={orphanedCount} />
        </Suspense>
    );
}
