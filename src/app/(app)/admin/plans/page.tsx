import { redirect } from 'next/navigation';
import { getCurrentAdmin } from '@/app/actions/admin';
import { getPlans } from '@/app/actions/admin-plans';
import { PlansList } from '@/components/admin/plans-list';
import { AdminPageShell } from '@/components/admin/admin-page-shell';

export default async function PlansPage() {
    const admin = await getCurrentAdmin();
    if (!admin) {
        redirect('/');
    }

    const plans = await getPlans();

    return (
        <AdminPageShell
            eyebrow="Billing catalog"
            title="Pricing plans"
            description="Control the subscription tiers, default onboarding plans, and limit structure offered across the product."
            stats={[
                {
                    label: 'Plans',
                    value: plans.length,
                    helper: 'Total plans currently configured',
                    iconName: 'CreditCard',
                },
                {
                    label: 'Default',
                    value: plans.find((plan) => plan.isDefault)?.name || 'None',
                    helper: 'Plan assigned to new signups by default',
                    iconName: 'ShieldCheck',
                },
                {
                    label: 'Paid tiers',
                    value: plans.filter((plan) => plan.price > 0).length,
                    helper: 'Revenue-generating plans available today',
                    iconName: 'BadgeDollarSign',
                },
            ]}
        >
            <PlansList initialPlans={plans} />
        </AdminPageShell>
    );
}
