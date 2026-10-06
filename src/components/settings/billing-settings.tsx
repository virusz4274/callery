import { useEffect, useState } from 'react';
import { useToast } from '@/components/toast-provider';
import { authFetch } from '@/lib/api-client';
import { SettingsSection } from './settings-section';
import { BillingHistoryCard } from './billing/billing-history-card';
import { CurrentPlanCard } from './billing/current-plan-card';
import type { BillingSettingsProps, Invoice } from './billing/types';
import { useBillingActions } from './billing/use-billing-actions';
import { isFreeTrialPlanKey } from '@/lib/plans';

export function BillingSettings({ userProfile }: BillingSettingsProps) {
    const { toast } = useToast();
    const planName = userProfile?.planName || 'Free Trial';
    const allowOverage = userProfile?.billingSettings.allowOverage ?? false;
    const [invoices, setInvoices] = useState<Invoice[]>([]);
    const [isInvoicesLoading, setIsInvoicesLoading] = useState(true);
    const [invoicesError, setInvoicesError] = useState<string | null>(null);

    const storageUsed = userProfile?.storageUsed || 0;
    const storageAlloc = userProfile?.storageAllocation || 1;
    const storagePercent = Math.min(100, (storageUsed / storageAlloc) * 100);

    const transcribeUsed = userProfile?.transcriptionUsed || 0;
    const transcribeAlloc = userProfile?.transcriptionAllocation || 1;
    const transcribePercent = Math.min(100, (transcribeUsed / transcribeAlloc) * 100);

    const isTrial = userProfile ? isFreeTrialPlanKey(userProfile.planKey) : false;
    const canManageSubscription = !isTrial;

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

    useEffect(() => {
        let isMounted = true;

        async function fetchInvoices() {
            setIsInvoicesLoading(true);
            setInvoicesError(null);

            try {
                const response = await authFetch('/api/stripe/invoices?limit=12');
                if (!response.ok) {
                    const data = await response.json().catch(() => ({}));
                    throw new Error(data.error || 'Failed to fetch invoices');
                }

                const data = await response.json();
                if (isMounted) {
                    setInvoices(data.invoices || []);
                }
            } catch (error) {
                if (isMounted) {
                    setInvoicesError(error instanceof Error ? error.message : 'Failed to load invoices');
                }
            } finally {
                if (isMounted) {
                    setIsInvoicesLoading(false);
                }
            }
        }

        fetchInvoices();

        return () => {
            isMounted = false;
        };
    }, []);

    return (
        <SettingsSection title="Billing & Plans" description="Manage your subscription, limits, and usage preferences.">
            <div className="space-y-6">
                <CurrentPlanCard
                    planName={planName}
                    isFree={isTrial}
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

                <BillingHistoryCard
                    invoices={invoices}
                    isLoading={isInvoicesLoading}
                    error={invoicesError}
                />
            </div>
        </SettingsSection>
    );
}
