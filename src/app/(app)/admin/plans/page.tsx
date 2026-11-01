import { redirect } from 'next/navigation';
import { getCurrentAdmin } from '@/app/actions/admin';
import { getPlans } from '@/app/actions/admin-plans';
import { PlansList } from '@/components/admin/plans-list';
import { AdminPageShell } from '@/components/admin/admin-page-shell';
import { getBillingCatalogReview } from '@/app/actions/admin-billing-catalog';
import { BillingCatalogPanel } from '@/components/admin/billing-catalog-panel';

export default async function PlansPage() {
    const admin = await getCurrentAdmin();
    if (!admin) {
        redirect('/');
    }

    const plans = await getPlans();
    const catalog = await getBillingCatalogReview();

    return (
        <AdminPageShell
            eyebrow="Billing catalog"
            title="Pricing plans"

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
            <div className="space-y-6"><BillingCatalogPanel initial={catalog} /><PlansList initialPlans={plans} managedBilling={catalog.enabled} /></div>
        </AdminPageShell>
    );
}
