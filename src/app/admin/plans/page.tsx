import { getPlans } from '@/app/actions/admin-plans';
import { PlansList } from '@/components/admin/plans-list';

export default async function PlansPage() {
    const plans = await getPlans();

    return <PlansList initialPlans={plans} />;
}
