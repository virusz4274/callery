import { useEffect, useState } from 'react';
import { Card, Button, Chip, Spinner, Switch, Tooltip, Modal } from '@heroui/react';
import { SettingsPage } from './settings-page';
import Link from 'next/link';
import { UserResponse } from '@/lib/db/types';
import type { Invoice } from '@/lib/types';
import { Info, Check } from 'lucide-react';
import { useToast } from '@/components/toast-provider';
import { authFetch } from '@/lib/api-client';
import { ClientFormattedDate } from '@/components/client-formatted-date';
import { getPublishedPlans, PublicPlan } from '@/app/actions/plans';

interface BillingSettingsProps {
    invoices?: Invoice[];
    isLoading: boolean;
    userProfile: UserResponse | null;
}

export function BillingSettings({ invoices: initialInvoices = [], isLoading, userProfile }: BillingSettingsProps) {
    const { toast } = useToast();
    const [isTogglingRules, setIsTogglingRules] = useState(false);
    const [invoices, setInvoices] = useState<Invoice[]>(initialInvoices);
    const [isLoadingInvoices, setIsLoadingInvoices] = useState(true);

    useEffect(() => {
        let cancelled = false;
        authFetch('/api/user/invoices')
            .then(async (res) => {
                if (!res.ok) throw new Error('Failed to fetch invoices');
                const data = await res.json();
                if (!cancelled) setInvoices(data.invoices || []);
            })
            .catch((error) => {
                console.error('Error fetching invoices:', error);
                if (!cancelled) {
                    toast({ title: 'Could not load invoices', description: 'Billing history is unavailable right now.', status: 'warning' });
                }
            })
            .finally(() => {
                if (!cancelled) setIsLoadingInvoices(false);
            });
        return () => { cancelled = true; };
    }, [toast]);

    // Use profile data if available, else fallback to user object
    const planName = userProfile?.plan || 'Free Plan';
    const allowOverage = userProfile?.billingSettings?.allowOverage ?? false;

    // Usage Stats
    const storageUsed = userProfile?.storageUsed || 0;
    const storageAlloc = userProfile?.storageAllocation || 1; // Avoid div by 0
    const storagePercent = Math.min(100, (storageUsed / storageAlloc) * 100);

    const transcribeUsed = userProfile?.transcriptionUsed || 0;
    const transcribeAlloc = userProfile?.transcriptionAllocation || 1;
    const transcribePercent = Math.min(100, (transcribeUsed / transcribeAlloc) * 100);

    const isTrial = planName === 'Free Trial';
    const isFree = planName === 'Free';
    const canManageSubscription = !isTrial && !isFree; // Only paid plans can manage via Portal

    const [isLoadingPortal, setIsLoadingPortal] = useState(false);
    const [isCheckingOut, setIsCheckingOut] = useState(false);

    // Upgrade Modal State
    const [availablePlans, setAvailablePlans] = useState<PublicPlan[]>([]);
    const [isLoadingPlans, setIsLoadingPlans] = useState(false);

    const handlePortal = async () => {
        setIsLoadingPortal(true);
        try {
            const res = await authFetch('/api/stripe/portal', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ returnUrl: window.location.href }),
            });

            if (!res.ok) {
                const data = await res.json();
                throw new Error(data.error || 'Failed to create portal session');
            }

            const { url } = await res.json();
            window.location.assign(url);
        } catch (error: any) {
            console.error('Portal error:', error);
            toast({
                title: 'Billing Portal Error',
                description: error.message || 'Could not redirect to billing portal.',
                status: 'danger'
            });
            setIsLoadingPortal(false);
        }
    };

    const handleUpgradeModal = async () => {
        setIsLoadingPlans(true);
        try {
            const plans = await getPublishedPlans();
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
            const res = await authFetch('/api/stripe/checkout', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({
                    priceId,
                    returnUrl: window.location.href
                }),
            });

            if (!res.ok) {
                const data = await res.json();
                throw new Error(data.error || 'Failed to start checkout');
            }

            const { url } = await res.json();
            window.location.assign(url);
        } catch (error: any) {
            console.error('Checkout error:', error);
            toast({
                title: 'Checkout Error',
                description: error.message || 'Could not start checkout.',
                status: 'danger'
            });
            setIsCheckingOut(false);
        }
    };

    const handleToggleOverage = async (newValue: boolean) => {
        setIsTogglingRules(true);
        try {
            const res = await authFetch('/api/user/billing-settings', {
                method: 'PATCH',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ allowOverage: newValue })
            });

            if (!res.ok) {
                const data = await res.json();
                throw new Error(data.error || 'Failed to update settings');
            }

            // Optimistic update or reload profile? 
            // Ideally we call a refresh function passed from parent, but for now trigger a toast
            toast({ title: 'Settings Updated', description: `Pay Per Usage is now ${newValue ? 'Enabled' : 'Disabled'}.`, status: 'success' });

            // Force reload page to refresh headers/state if context doesn't auto-update
            window.location.reload();

        } catch (error: unknown) {
            const message = error instanceof Error ? error.message : 'An unknown error occurred';
            toast({ title: 'Error', description: message, status: 'danger' });
        } finally {
            setIsTogglingRules(false);
        }
    };

    return (
        <SettingsPage title="Billing & Plans" description="Manage your subscription, limits, and usage preferences.">
            <div className="space-y-6">
                {/* Plan Card */}
                <Card className="bg-card/70 border-default-200">
                    <Card.Content className="space-y-6">
                        <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between">
                            <div>
                                <h4 className="text-lg font-medium">Current Plan</h4>
                                <div className="mt-1 flex items-center gap-2 text-default-500">
                                    <span className="font-semibold text-foreground">{planName}</span>
                                    <Chip color={isTrial ? "warning" : "success"} size="sm" variant="soft">
                                        {isTrial ? 'Trial Active' : 'Active'}
                                    </Chip>
                                </div>
                                <p className="mt-2 text-sm text-default-400">
                                    {isTrial
                                        ? 'Trial ends in 30 days. Upgrade to keep full access.'
                                        : 'Manage your plan and billing details.'}
                                </p>
                            </div>
                            {/* Action Button: Subscribe (Trial) vs Manage (Paid) */}
                            {canManageSubscription ? (
                                <Button
                                    variant="primary"
                                    className="mt-4 sm:mt-0 font-medium"
                                    onPress={handlePortal}
                                    isDisabled={isLoadingPortal}
                                >
                                    {isLoadingPortal ? <Spinner size="sm" color="current" /> : 'Manage Subscription'}
                                </Button>
                            ) : (
                                <Modal>
                                    <Button
                                        variant="primary"
                                        className="mt-4 sm:mt-0 font-medium"
                                        onPress={handleUpgradeModal}
                                    >
                                        Upgrade Plan
                                    </Button>
                                    <Modal.Backdrop>
                                        <Modal.Container>
                                            <Modal.Dialog className="sm:max-w-xl">
                                                <Modal.CloseTrigger />
                                                <Modal.Header>
                                                    <Modal.Heading>Upgrade Your Plan</Modal.Heading>
                                                </Modal.Header>
                                                <Modal.Body>
                                                    {isLoadingPlans ? (
                                                        <div className="flex justify-center py-10">
                                                            <Spinner size="lg" />
                                                        </div>
                                                    ) : (
                                                        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                                                            {availablePlans.map((plan) => (
                                                                <div key={plan.id} className="border border-default-200 rounded-lg p-4 hover:border-primary transition-colors">
                                                                    <h3 className="font-bold text-xl">{plan.name}</h3>
                                                                    <div className="text-2xl font-bold my-2">
                                                                        ${plan.price} <span className="text-sm font-normal text-default-500">
                                                                            /{plan.interval}
                                                                        </span>
                                                                    </div>
                                                                    <ul className="space-y-2 mb-6">
                                                                        {plan.features.slice(0, 4).map((feat, i) => (
                                                                            <li key={i} className="flex items-center gap-2 text-sm text-default-600">
                                                                                <Check className="w-4 h-4 text-success" />
                                                                                {feat}
                                                                            </li>
                                                                        ))}
                                                                    </ul>
                                                                    <Button
                                                                        className="w-full"
                                                                        variant="primary"
                                                                        onPress={() => handleCheckout(plan.stripePriceId)}
                                                                        isDisabled={isCheckingOut}
                                                                    >
                                                                        {isCheckingOut ? <Spinner size="sm" /> : `Choose ${plan.name}`}
                                                                    </Button>
                                                                </div>
                                                            ))}
                                                        </div>
                                                    )}
                                                </Modal.Body>
                                                <Modal.Footer>
                                                    <Button variant="ghost" slot="close">
                                                        Close
                                                    </Button>
                                                </Modal.Footer>
                                            </Modal.Dialog>
                                        </Modal.Container>
                                    </Modal.Backdrop>
                                </Modal>
                            )}
                        </div>

                        {/* Usage Bars */}
                        <div className="space-y-4 pt-4 border-t border-default-100">
                            <div>
                                <div className="flex justify-between text-sm mb-1">
                                    <span className="text-default-500">Storage Usage</span>
                                    <span className="font-medium">{formatBytes(storageUsed)} / {formatBytes(storageAlloc)}</span>
                                </div>
                                <div className="h-2 w-full bg-default-100 rounded-full overflow-hidden">
                                    <div
                                        className={`h-full transition-all duration-300 ${storagePercent > 90 ? 'bg-danger' : 'bg-primary'}`}
                                        style={{ width: `${storagePercent}%` }}
                                    />
                                </div>
                            </div>
                            <div>
                                <div className="flex justify-between text-sm mb-1">
                                    <span className="text-default-500">Transcription Minutes</span>
                                    <span className="font-medium">{formatSeconds(transcribeUsed)} / {formatSeconds(transcribeAlloc)}</span>
                                </div>
                                <div className="h-2 w-full bg-default-100 rounded-full overflow-hidden">
                                    <div
                                        className={`h-full transition-all duration-300 ${transcribePercent > 90 ? 'bg-danger' : 'bg-primary'}`}
                                        style={{ width: `${transcribePercent}%` }}
                                    />
                                </div>
                            </div>
                        </div>

                        {/* Pay Per Usage Toggle */}
                        {!isFree && !isTrial && (
                            <div className="pt-4 border-t border-default-100 flex items-center justify-between">
                                <div className="space-y-1">
                                    <div className="flex items-center gap-2">
                                        <h4 className="font-medium text-foreground">Pay Per Usage (Overage)</h4>
                                        <Tooltip delay={0}>
                                            <Button isIconOnly className="w-auto h-auto min-w-0 min-h-0 bg-transparent data-[hover=true]:bg-transparent p-0">
                                                <Info className="w-4 h-4 text-default-400" />
                                            </Button>
                                            <Tooltip.Content>
                                                <div className="max-w-[200px] p-2">
                                                    Allow usage beyond plan limits. You will be billed for extra usage.
                                                </div>
                                            </Tooltip.Content>
                                        </Tooltip>
                                    </div>
                                    <p className="text-sm text-default-500 max-w-md">
                                        If enabled, you can continue using features after hitting your plan limits. Extra usage is billed at standard rates.
                                    </p>
                                </div>
                                <Switch
                                    isSelected={allowOverage}
                                    onChange={handleToggleOverage}
                                    isDisabled={isTogglingRules}
                                >
                                    <Switch.Control className={allowOverage ? "bg-success" : "bg-default-200"}>
                                        <Switch.Thumb />
                                    </Switch.Control>
                                </Switch>
                            </div>
                        )}
                    </Card.Content>
                </Card>

                <Card className="bg-card/70 border-default-200">
                    <Card.Header>
                        <h4 className="text-base font-medium">Billing History</h4>
                    </Card.Header>
                    <Card.Content>
                        {isLoading || isLoadingInvoices ? (
                            <div className="flex justify-center p-4">
                                <Spinner />
                            </div>
                        ) : invoices.length > 0 ? (
                            <div className="rounded-lg border border-default-200 overflow-hidden">
                                <table className="w-full text-sm text-left">
                                    <thead className="text-default-500 font-medium bg-default-50 border-b border-default-200">
                                        <tr>
                                            <th className="h-10 px-4 align-middle">Invoice</th>
                                            <th className="h-10 px-4 align-middle">Date</th>
                                            <th className="h-10 px-4 align-middle">Amount</th>
                                            <th className="h-10 px-4 align-middle text-right">Status</th>
                                        </tr>
                                    </thead>
                                    <tbody className="divide-y divide-default-100">
                                        {invoices.map((invoice) => (
                                            <tr key={invoice.id}>
                                                <td className="p-4 align-middle font-mono text-xs">{invoice.id}</td>
                                                <td className="p-4 align-middle">
                                                    <ClientFormattedDate date={invoice.date} formatString="MMMM dd, yyyy" />
                                                </td>
                                                <td className="p-4 align-middle">${invoice.amount.toFixed(2)}</td>
                                                <td className="p-4 align-middle text-right">
                                                    <Chip
                                                        color={invoice.status === 'Paid' ? 'success' : invoice.status === 'Pending' ? 'warning' : 'danger'}
                                                        variant="soft"
                                                        size="sm"
                                                    >
                                                        {invoice.status}
                                                    </Chip>
                                                </td>
                                            </tr>
                                        ))}
                                    </tbody>
                                </table>
                            </div>
                        ) : (
                            <div className="p-4 text-center text-default-500 text-sm">
                                No invoices found.
                            </div>
                        )}
                    </Card.Content>
                </Card>
            </div>
        </SettingsPage >
    );
}

function formatBytes(bytes: number, decimals = 1) {
    if (!+bytes) return '0 B';
    const k = 1024;
    const dm = decimals < 0 ? 0 : decimals;
    const sizes = ['B', 'KB', 'MB', 'GB', 'TB'];
    const i = Math.floor(Math.log(bytes) / Math.log(k));
    return `${parseFloat((bytes / Math.pow(k, i)).toFixed(dm))} ${sizes[i]}`;
}

function formatSeconds(seconds: number) {
    const mins = Math.floor(seconds / 60);
    return `${mins} mins`;
}
