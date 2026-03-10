import { useToast } from '@/components/toast-provider';
import { SettingsPage } from './settings-page';
import { BillingHistoryCard } from './billing/billing-history-card';
import { CurrentPlanCard } from './billing/current-plan-card';
import type { BillingSettingsProps } from './billing/types';
import { useBillingActions } from './billing/use-billing-actions';

export function BillingSettings({ isLoading, userProfile }: BillingSettingsProps) {
    const { toast } = useToast();
    const planName = userProfile?.plan || 'Free Plan';
    const allowOverage = userProfile?.billingSettings?.allowOverage ?? false;

    const storageUsed = userProfile?.storageUsed || 0;
    const storageAlloc = userProfile?.storageAllocation || 1;
    const storagePercent = Math.min(100, (storageUsed / storageAlloc) * 100);

    const transcribeUsed = userProfile?.transcriptionUsed || 0;
    const transcribeAlloc = userProfile?.transcriptionAllocation || 1;
    const transcribePercent = Math.min(100, (transcribeUsed / transcribeAlloc) * 100);

    const isTrial = planName === 'Free Trial';
    const isFree = planName === 'Free';
    const canManageSubscription = !isTrial && !isFree;

    const {
        availablePlans,
        isCheckingOut,
        isLoadingPlans,
        isLoadingPortal,
        isTogglingRules,
        handleCheckout,
        handlePortal,
        handleToggleOverage,
        handleUpgradeModal,
    } = useBillingActions(toast);

    return (
        <SettingsPage title="Billing & Plans" description="Manage your subscription, limits, and usage preferences.">
            <div className="space-y-6">
                <CurrentPlanCard
                    planName={planName}
                    isFree={isFree}
                    isTrial={isTrial}
                    canManageSubscription={canManageSubscription}
                    allowOverage={allowOverage}
                    storageUsed={storageUsed}
                    storageAlloc={storageAlloc}
                    storagePercent={storagePercent}
                    transcribeUsed={transcribeUsed}
                    transcribeAlloc={transcribeAlloc}
                    transcribePercent={transcribePercent}
                    isLoadingPortal={isLoadingPortal}
                    isLoadingPlans={isLoadingPlans}
                    isCheckingOut={isCheckingOut}
                    isTogglingRules={isTogglingRules}
                    availablePlans={availablePlans}
                    onPortal={handlePortal}
                    onUpgradeOpen={handleUpgradeModal}
                    onCheckout={handleCheckout}
                    onToggleOverage={handleToggleOverage}
                />

                <BillingHistoryCard isLoading={isLoading} />
            </div>
        </SettingsPage>
    );
}
