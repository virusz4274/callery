import { useState } from 'react';
import { getUpgradeablePlans, type PublicPlan } from '@/app/actions/plans';
import { authFetch } from '@/lib/api-client';
import type { Toast } from '@/components/toast-provider';

type ToastFn = (props: Omit<Toast, 'id'>) => void;

export function useBillingActions(toast: ToastFn) {
    const [isTogglingRules, setIsTogglingRules] = useState(false);
    const [isLoadingPortal, setIsLoadingPortal] = useState(false);
    const [isCheckingOut, setIsCheckingOut] = useState(false);
    const [availablePlans, setAvailablePlans] = useState<PublicPlan[]>([]);
    const [isLoadingPlans, setIsLoadingPlans] = useState(false);

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
            const response = await authFetch('/api/stripe/checkout', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({
                    priceId,
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
                title: 'Settings Updated',
                description: `Pay Per Usage is now ${newValue ? 'Enabled' : 'Disabled'}.`,
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

    return {
        availablePlans,
        isCheckingOut,
        isLoadingPlans,
        isLoadingPortal,
        isTogglingRules,
        handleCheckout,
        handlePortal,
        handleToggleOverage,
        handleUpgradeModal,
    };
}
