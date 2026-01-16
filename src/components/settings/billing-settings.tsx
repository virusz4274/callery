
'use client';

import React, { useState } from 'react';
import { Card, Button, Chip, Spinner, Switch, Tooltip } from '@heroui/react';
import { SettingsPage } from './settings-page';
import Link from 'next/link';
import { UserResponse } from '@/lib/db/types';
import { Info } from 'lucide-react';
import { useToast } from '@/components/toast-provider';
import { authFetch } from '@/lib/api-client';

type Invoice = {
    id: string;
    date: string;
    amount: string;
    status: string;
};

interface BillingSettingsProps {
    invoices: Invoice[];
    isLoading: boolean;
    userProfile: UserResponse | null;
}

export function BillingSettings({ isLoading, userProfile }: BillingSettingsProps) {
    const { toast } = useToast();
    const [isTogglingRules, setIsTogglingRules] = useState(false);

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

    const [isLoadingPortal, setIsLoadingPortal] = useState(false);

    const handlePortal = async () => {
        setIsLoadingPortal(true);
        try {
            const res = await authFetch('/api/stripe/portal', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ returnUrl: window.location.href }),
            });

            if (!res.ok) throw new Error('Failed to create portal session');

            const { url } = await res.json();
            window.location.href = url;
        } catch (error) {
            console.error('Portal error:', error);
            toast({ title: 'Error', description: 'Could not redirect to billing portal.', status: 'danger' });
            setIsLoadingPortal(false);
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
                            <Button
                                variant="primary"
                                className="mt-4 sm:mt-0 font-medium"
                                onPress={handlePortal}
                                isDisabled={isFree || isLoadingPortal}
                            >
                                {isLoadingPortal ? <Spinner size="sm" color="current" /> : 'Manage Subscription'}
                            </Button>
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

                {/* Billing History (Placeholder) */}
                <Card className="bg-card/70 border-default-200">
                    <Card.Header>
                        <h4 className="text-base font-medium">Billing History</h4>
                    </Card.Header>
                    <Card.Content>
                        {isLoading ? (
                            <div className="flex justify-center p-4">
                                <Spinner />
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
