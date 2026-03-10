import { redirect } from 'next/navigation';
import { getCurrentAdmin } from '@/app/actions/admin';
import { getPlans } from '@/app/actions/admin-plans';
import { PlansList } from '@/components/admin/plans-list';

export default async function PlansPage() {
    const admin = await getCurrentAdmin();
    if (!admin) {
        redirect('/');
    }

    const plans = await getPlans();

    return <PlansList initialPlans={plans} />;
}
