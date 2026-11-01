import { useState } from 'react';
import { getUpgradeablePlans, type PublicPlan } from '@/app/actions/plans';
import { authFetch } from '@/lib/api-client';
import type { Toast } from '@/components/toast-provider';
import type { BillingChangePreview } from '@/lib/stripe/plan-change';

type ToastFn = (props: Omit<Toast, 'id'>) => void;

export function useBillingActions(toast: ToastFn, hasSubscription = false) {
    const [isTogglingRules, setIsTogglingRules] = useState(false);
    const [isLoadingPortal, setIsLoadingPortal] = useState(false);
    const [isCheckingOut, setIsCheckingOut] = useState(false);
    const [isResumingUsage, setIsResumingUsage] = useState(false);
    const [availablePlans, setAvailablePlans] = useState<PublicPlan[]>([]);
    const [isLoadingPlans, setIsLoadingPlans] = useState(false);
    const [preview, setPreview] = useState<BillingChangePreview | null>(null);
    const [storageConsent, setStorageConsent] = useState(false);

    const handlePortal = async () => {
        setIsLoadingPortal(true);
        try {
            const response = await authFetch('/api/stripe/portal', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ returnUrl: '/settings?tab=billing' }),
            });

            if (!response.ok) {
                const data = await response.json();
                throw new Error(data.error || 'Failed to create portal session');
            }

            const { url } = await response.json();
            window.location.href = url;
        } catch (error: unknown) {
            const message = error instanceof Error ? error.message : 'Could not redirect to billing portal.';
            console.error('Portal error:', error);
            toast({
                title: 'Billing Portal Error',
                description: message,
                status: 'danger',
            });
            setIsLoadingPortal(false);
        }
    };

    const handleUpgradeModal = async () => {
        setIsLoadingPlans(true);
        try {
            const plans = await getUpgradeablePlans();
            setAvailablePlans(plans);
        } catch (error) {
            console.error('Failed to fetch plans:', error);
            toast({ title: 'Error', description: 'Could not load plans.', status: 'danger' });
        } finally {
            setIsLoadingPlans(false);
        }
    };

    const handleCheckout = async (priceId: string) => {
        setIsCheckingOut(true);
        try {
            const selectedPlan = availablePlans.find(plan => plan.stripePriceId === priceId);
            if (!selectedPlan) throw new Error('Reload the available plans and try again.');
            if (hasSubscription) {
                const plan = selectedPlan;
                const response = await authFetch('/api/stripe/plan-change/preview', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ planKey: plan.key }) });
                const data = await response.json();
                if (!response.ok) throw new Error(data.error || 'Could not preview this plan change.');
                setPreview(data); setStorageConsent(false); setIsCheckingOut(false);
                return;
            }
            const response = await authFetch('/api/stripe/checkout', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({
                    priceId,
                    catalogVersion: selectedPlan.catalogVersion,
                    returnUrl: '/settings?tab=billing',
                    successUrl: '/settings?tab=billing&success=true',
                    cancelUrl: '/settings?tab=billing&canceled=true',
                }),
            });

            if (!response.ok) {
                const data = await response.json();
                throw new Error(data.error || 'Failed to start checkout');
            }

            const { url } = await response.json();
            window.location.href = url;
        } catch (error: unknown) {
            const message = error instanceof Error ? error.message : 'Could not start checkout.';
            console.error('Checkout error:', error);
            toast({
                title: 'Checkout Error',
                description: message,
                status: 'danger',
            });
            setIsCheckingOut(false);
        }
    };

    const handleConfirmPlanChange = async () => {
        if (!preview) return;
        setIsCheckingOut(true);
        try {
            const response = await authFetch('/api/stripe/plan-change', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ previewId: preview.id, storageOverageConsent: storageConsent }) });
            const operation = await response.json();
            if (!response.ok) throw new Error(operation.error || 'Could not apply this plan change.');
            setPreview(null);
            if (operation.state === 'canceled') {
                toast({ title: 'Plan change canceled', description: operation.error || 'Your existing paid plan is unchanged. Request a new quote to try again.', status: 'warning' });
                return;
            }
            if (operation.state === 'needs_review') {
                toast({ title: 'Plan change needs review', description: operation.error || 'Billing needs verification before the change can finish.', status: 'warning' });
                return;
            }
            if (operation.paymentUrl) window.location.href = operation.paymentUrl;
            else window.location.reload();
        } catch (error) {
            toast({ title: 'Plan change needs attention', description: error instanceof Error ? error.message : 'Please try again.', status: 'danger' });
        } finally { setIsCheckingOut(false); }
    };
    const handleCancelPlanChange = async () => {
        if (!preview) return;
        setIsCheckingOut(true);
        try {
            const response = await authFetch('/api/stripe/plan-change', { method: 'DELETE', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ previewId: preview.id }) });
            const data = await response.json();
            if (!response.ok) throw new Error(data.error || 'Could not cancel this pending change.');
            setPreview(null);
        } catch (error) { toast({ title: 'Plan change needs attention', description: error instanceof Error ? error.message : 'Please try again.', status: 'danger' }); }
        finally { setIsCheckingOut(false); }
    };

    const handleToggleOverage = async (newValue: boolean) => {
        setIsTogglingRules(true);
        try {
            const response = await authFetch('/api/user/billing-settings', {
                method: 'PATCH',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ allowOverage: newValue }),
            });

            if (!response.ok) {
                const data = await response.json();
                throw new Error(data.error || 'Failed to update settings');
            }

            toast({
                title: `Pay per usage ${newValue ? 'enabled' : 'disabled'}`,
                status: 'success',
            });

            window.location.reload();
        } catch (error: unknown) {
            const message = error instanceof Error ? error.message : 'An unknown error occurred';
            toast({ title: 'Error', description: message, status: 'danger' });
        } finally {
            setIsTogglingRules(false);
        }
    };

    const handleResumeUsage = async () => {
        setIsResumingUsage(true);
        try {
            const response = await authFetch('/api/stripe/lifetime/resume', { method: 'POST' });
            if (!response.ok) {
                const data = await response.json();
                throw new Error(data.error || 'Usage billing could not be resumed.');
            }
            toast({ title: 'Usage billing setup requested', status: 'success' });
            window.location.reload();
        } catch (error) {
            toast({ title: 'Usage billing needs attention', description: error instanceof Error ? error.message : 'Please try again.', status: 'danger' });
        } finally {
            setIsResumingUsage(false);
        }
    };

    return {
        availablePlans,
        isCheckingOut,
        isResumingUsage,
        isLoadingPlans,
        isLoadingPortal,
        isTogglingRules,
        handleCheckout,
        handlePortal,
        handleToggleOverage,
        handleResumeUsage,
        handleUpgradeModal,
        preview, storageConsent, setStorageConsent, handleConfirmPlanChange, handleCancelPlanChange,
    };
}
