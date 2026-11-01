import { UsagePriceExamples } from '@/components/usage-price-examples';
import { useEffect, useState } from 'react';
import { useToast } from '@/components/toast-provider';
import { authFetch } from '@/lib/api-client';
import { SettingsSection } from './settings-section';
import { BillingHistoryCard } from './billing/billing-history-card';
import { CurrentPlanCard } from './billing/current-plan-card';
import type { BillingSettingsProps, Invoice } from './billing/types';
import { useBillingActions } from './billing/use-billing-actions';
import { isFreeTrialPlanKey } from '@/lib/plans';
import { Button } from '@heroui/react';
import { PrepaidUsageCard } from './billing/prepaid-usage-card';

export function BillingSettings({ userProfile }: BillingSettingsProps) {
    const { toast } = useToast();
    const planName = userProfile?.planName || 'Free Trial';
    const allowOverage = userProfile?.billingSettings.allowOverage ?? false;
    const [invoices, setInvoices] = useState<Invoice[]>([]);
    const [isInvoicesLoading, setIsInvoicesLoading] = useState(true);
    const [invoicesError, setInvoicesError] = useState<string | null>(null);

    const storageUsed = userProfile?.storageUsed || 0;
    const storageAlloc = userProfile?.storageAllocation ?? 0;
    const storagePercent = storageAlloc > 0 ? Math.min(100, (storageUsed / storageAlloc) * 100) : 0;

    const transcribeUsed = userProfile?.billingStatus?.entitlement === 'subscription'
        ? userProfile.transcriptionAllowanceUsed ?? userProfile.transcriptionUsed
        : userProfile?.transcriptionUsed || 0;
    const transcribeAlloc = userProfile?.transcriptionAllocation ?? 0;
    const transcribePercent = transcribeAlloc > 0 ? Math.min(100, (transcribeUsed / transcribeAlloc) * 100) : 0;

    const isTrial = userProfile ? isFreeTrialPlanKey(userProfile.planKey) : false;
    const canManageSubscription = userProfile?.billingStatus?.canManageBilling ?? !isTrial;
    const billingStatus = userProfile?.billingStatus;
    const operatorFunded = billingStatus?.entitlement === 'admin';
    const changesExistingSubscription = billingStatus?.entitlement === 'subscription'
        && !['canceled', 'incomplete_expired'].includes(userProfile?.stripeSubscriptionStatus || '');

    const {
        availablePlans,
        isCheckingOut,
        isLoadingPlans,
        isLoadingPortal,
        isTogglingRules,
        isResumingUsage,
        handleCheckout,
        handlePortal,
        handleToggleOverage,
        handleUpgradeModal,
        handleResumeUsage,
        preview, storageConsent, setStorageConsent, handleConfirmPlanChange, handleCancelPlanChange,
    } = useBillingActions(toast, changesExistingSubscription);

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
        <SettingsSection title="Billing & Plans">
            <div className="space-y-6">
                {billingStatus?.lifetimePurchased && (
                    <div className="rounded-xl border border-border bg-background p-4 text-sm leading-6">
                        Your lifetime access is permanent. Storage and transcription are charged separately through your usage subscription.
                    </div>
                )}
                {billingStatus?.needsAttention && (
                    <div role="status" className="space-y-3 rounded-xl border border-warning p-4 text-sm leading-6">
                        <p className="font-semibold">{billingStatus.usageSetup && billingStatus.usageSetup !== 'ready' ? 'Usage billing setup needs attention' : 'Review your billing'}</p>
                        <p>{billingStatus.lifetimePurchased ? 'Your lifetime purchase is preserved. ' : ''}Complete billing setup or resolve payment issues to start new uploads and transcription. Unfunded archives have a 30-day recovery window.</p>
                        {billingStatus.recoveryDeadline && <p>Export or restore billing before {new Date(billingStatus.recoveryDeadline).toLocaleDateString()}. Recordings and export archives are removed after this deadline.</p>}
                        {billingStatus.canManageBilling ? (
                            <Button variant="secondary" onPress={handlePortal} isPending={isLoadingPortal}>Update payment method</Button>
                        ) : <p>Contact support to review your billing account.</p>}
                        {billingStatus.entitlement === 'lifetime' && billingStatus.usageSetup !== 'ready' && (
                            <div className="space-y-2">
                                <p>Resuming usage billing authorizes ongoing storage and transcription charges at your plan rates.</p>
                                <Button variant="primary" onPress={handleResumeUsage} isPending={isResumingUsage}>Resume usage billing</Button>
                            </div>
                        )}
                    </div>
                )}
                <CurrentPlanCard
                    planName={planName}
                    isFree={isTrial || operatorFunded}
                    isTrial={isTrial}
                    operatorFunded={operatorFunded}
                    canManageSubscription={canManageSubscription}
                    allowOverage={allowOverage}
                    isLifetime={billingStatus?.entitlement === 'lifetime'}
                    needsBillingAttention={billingStatus?.needsAttention}
                    storageUsed={storageUsed}
                    storageAlloc={storageAlloc}
                    storagePercent={storagePercent}
                    transcribeUsed={transcribeUsed}
                    transcribeAlloc={transcribeAlloc}
                    transcriptionUnlimited={userProfile?.transcriptionUnlimited}
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
                {preview && <div role="region" aria-label="Confirm plan change" className="space-y-3 rounded-xl border border-primary p-5">
                    <h4 className="font-semibold">Review {preview.timing === 'period_end' ? 'renewal' : 'immediate'} change to {preview.targetPlanKey}</h4>
                    {preview.timing === 'period_end' ? <p className="text-sm">Your current plan stays active until {new Date(preview.effectiveAt).toLocaleString()}. The downgrade applies at renewal without an immediate refund. You can cancel the scheduled change before it takes effect.</p> : <>
                        <p className="text-sm">Your monthly usage window and consumed allowance stay the same. Stripe credits unused subscription time against this change.</p>
                        <p className="text-sm">Complete payment and any bank verification on Stripe. Your current paid plan stays available until payment is confirmed. The change then takes effect as soon as accepted work and billing checks finish.</p>
                    </>}
                    <ul className="space-y-1 text-sm">{preview.lines.map((line, index) => <li key={index}>{line.description}: {new Intl.NumberFormat('en-US', { style: 'currency', currency: preview.currency }).format(line.amountMinor / 100)}</li>)}</ul>
                    <p>Due now: {new Intl.NumberFormat('en-US', { style: 'currency', currency: preview.currency }).format(preview.amountDueMinor / 100)}</p>
                    {preview.usagePricing?.tier === 'lifetime' && <>
                        <p className="text-sm text-muted">Lifetime usage is prepaid separately. Usage is billed at the displayed rates for provider-weighted audio and storage. There is no per-recording minimum.</p>
                        <UsagePriceExamples pricing={preview.usagePricing} />
                    </>}
                    {preview.storageOverageConsent && <label className="flex items-start gap-2 text-sm"><input type="checkbox" checked={storageConsent} onChange={event => setStorageConsent(event.target.checked)} />I accept prepaid storage charges for retained files above the new allowance.</label>}
                    <p className="text-xs text-muted">Confirm this quote before {new Date(preview.expiresAt).toLocaleTimeString()}. Usage charges stay on your regular usage invoice.</p>
                    <div className="flex gap-2"><Button onPress={handleConfirmPlanChange} isPending={isCheckingOut} isDisabled={preview.storageOverageConsent && !storageConsent}>{preview.timing === 'period_end' ? 'Schedule downgrade' : 'Confirm immediate change'}</Button><Button variant="ghost" onPress={handleCancelPlanChange} isDisabled={isCheckingOut}>Cancel pending change</Button></div>
                </div>}
                {canManageSubscription && !isTrial && !operatorFunded && <PrepaidUsageCard />}

                <BillingHistoryCard
                    invoices={invoices}
                    isLoading={isInvoicesLoading}
                    error={invoicesError}
                />
            </div>
        </SettingsSection>
    );
}
