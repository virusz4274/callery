import React from 'react';
import { Button, Card, Chip, Spinner, Switch, Tooltip } from '@heroui/react';
import { Info } from 'lucide-react';
import { UpgradePlanModal } from './upgrade-plan-modal';
import { UsageProgressBar } from './usage-progress-bar';
import { formatBytes, formatSeconds } from './format';
import type { PublicPlan } from '@/app/actions/plans';

type CurrentPlanCardProps = {
    planName: string;
    isFree: boolean;
    isTrial: boolean;
    canManageSubscription: boolean;
    allowOverage: boolean;
    storageUsed: number;
    storageAlloc: number;
    storagePercent: number;
    transcribeUsed: number;
    transcribeAlloc: number;
    transcribePercent: number;
    isLoadingPortal: boolean;
    isLoadingPlans: boolean;
    isCheckingOut: boolean;
    isTogglingRules: boolean;
    availablePlans: PublicPlan[];
    onPortal: () => void;
    onUpgradeOpen: () => void;
    onCheckout: (priceId: string) => void;
    onToggleOverage: (newValue: boolean) => void;
};

export function CurrentPlanCard({
    planName,
    isFree,
    isTrial,
    canManageSubscription,
    allowOverage,
    storageUsed,
    storageAlloc,
    storagePercent,
    transcribeUsed,
    transcribeAlloc,
    transcribePercent,
    isLoadingPortal,
    isLoadingPlans,
    isCheckingOut,
    isTogglingRules,
    availablePlans,
    onPortal,
    onUpgradeOpen,
    onCheckout,
    onToggleOverage,
}: CurrentPlanCardProps) {
    return (
        <Card className="bg-card/70 border-default-200">
            <Card.Content className="space-y-6">
                <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between">
                    <div>
                        <h4 className="text-lg font-medium">Current Plan</h4>
                        <div className="mt-1 flex items-center gap-2 text-default-500">
                            <span className="font-semibold text-foreground">{planName}</span>
                            <Chip color={isTrial ? 'warning' : 'success'} size="sm" variant="soft">
                                {isTrial ? 'Trial Active' : 'Active'}
                            </Chip>
                        </div>
                        <p className="mt-2 text-sm text-default-400">
                            {isTrial
                                ? 'Trial ends in 30 days. Upgrade to keep full access.'
                                : 'Manage your plan and billing details.'}
                        </p>
                    </div>

                    {canManageSubscription ? (
                        <Button
                            variant="primary"
                            className="mt-4 sm:mt-0 font-medium"
                            onPress={onPortal}
                            isDisabled={isLoadingPortal}
                        >
                            {isLoadingPortal ? <Spinner size="sm" color="current" /> : 'Manage Subscription'}
                        </Button>
                    ) : (
                        <UpgradePlanModal
                            plans={availablePlans}
                            isLoadingPlans={isLoadingPlans}
                            isCheckingOut={isCheckingOut}
                            onOpen={onUpgradeOpen}
                            onCheckout={onCheckout}
                        />
                    )}
                </div>

                <div className="space-y-4 pt-4 border-t border-default-100">
                    <UsageProgressBar
                        label="Storage Usage"
                        usedLabel={`${formatBytes(storageUsed)} / ${formatBytes(storageAlloc)}`}
                        percent={storagePercent}
                    />
                    <UsageProgressBar
                        label="Transcription Minutes"
                        usedLabel={`${formatSeconds(transcribeUsed)} / ${formatSeconds(transcribeAlloc)}`}
                        percent={transcribePercent}
                    />
                </div>

                {!isFree && !isTrial && (
                    <div className="pt-4 border-t border-default-100 flex items-center justify-between">
                        <div className="space-y-1">
                            <div className="flex items-center gap-2">
                                <h4 className="font-medium text-foreground">Pay Per Usage (Overage)</h4>
                                <Tooltip delay={0}>
                                    <Button
                                        isIconOnly
                                        className="w-auto h-auto min-w-0 min-h-0 bg-transparent data-[hover=true]:bg-transparent p-0"
                                    >
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
                                If enabled, you can continue using features after hitting your plan limits. Extra
                                usage is billed at standard rates.
                            </p>
                        </div>

                        <Switch
                            isSelected={allowOverage}
                            onChange={onToggleOverage}
                            isDisabled={isTogglingRules}
                        >
                            <Switch.Control className={allowOverage ? 'bg-success' : 'bg-default-200'}>
                                <Switch.Thumb />
                            </Switch.Control>
                        </Switch>
                    </div>
                )}
            </Card.Content>
        </Card>
    );
}
