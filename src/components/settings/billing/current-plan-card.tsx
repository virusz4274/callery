import { Button, Card, Chip, Spinner, Switch } from '@heroui/react';
import { CreditCard, Sparkles, WalletCards } from 'lucide-react';
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
        <Card>
            <Card.Content className="space-y-5 p-5 sm:p-6">
                <div className="flex flex-wrap items-center gap-2">
                    <Chip size="sm" variant="soft" color={isTrial ? 'warning' : 'success'}>
                        {isTrial ? 'Trial active' : 'Plan active'}
                    </Chip>
                </div>

                <div className="flex flex-col gap-5 lg:flex-row lg:items-start lg:justify-between">
                    <div className="flex items-start gap-4">
                        <div className="flex h-12 w-12 shrink-0 items-center justify-center rounded-2xl bg-primary/10 text-primary">
                            <WalletCards className="h-5 w-5" />
                        </div>
                        <div className="space-y-2">
                            <h4 className="text-xl font-semibold text-foreground">{planName}</h4>
                            {isTrial && <p className="max-w-2xl text-sm leading-6 text-muted">
                                Upgrade before your trial ends to keep access.
                            </p>}
                        </div>
                    </div>

                    {canManageSubscription ? (
                        <Button
                            variant="primary"
                            className="w-full gap-2 sm:w-auto"
                            onPress={onPortal}
                            isDisabled={isLoadingPortal}
                        >
                            {isLoadingPortal ? <Spinner size="sm" color="current" /> : <CreditCard className="h-4 w-4" />}
                            {isLoadingPortal ? 'Opening portal...' : 'Manage subscription'}
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

                <div className="space-y-4">
                    <div className="rounded-xl border border-border bg-default-50/70 p-4">
                        <div className="mb-4 flex items-center gap-2 text-sm font-medium text-foreground">
                            <Sparkles className="h-4 w-4 text-primary" />
                            Included usage
                        </div>
                        <div className="space-y-4">
                            <UsageProgressBar
                                label="Storage usage"
                                usedLabel={`${formatBytes(storageUsed)} / ${formatBytes(storageAlloc)}`}
                                percent={storagePercent}
                            />
                            <UsageProgressBar
                                label="Transcription minutes"
                                usedLabel={`${formatSeconds(transcribeUsed)} / ${formatSeconds(transcribeAlloc)}`}
                                percent={transcribePercent}
                            />
                        </div>
                    </div>


                </div>

                {!isFree && !isTrial && (
                    <div className="rounded-xl border border-border bg-background p-4 sm:p-5">
                        <div className="flex flex-col gap-4 lg:flex-row lg:items-center lg:justify-between">
                            <div className="space-y-2">
                                <div className="flex items-center gap-2">
                                    <h4 className="font-semibold text-foreground">Pay per usage</h4>
                                </div>
                                <p className="max-w-2xl text-sm leading-6 text-muted">
                                    Usage beyond your plan limits is billed at standard rates.
                                </p>
                            </div>

                            <Switch
                                aria-label="Allow pay per usage"
                                isSelected={allowOverage}
                                onChange={(nextValue) => onToggleOverage(nextValue)}
                                isDisabled={isTogglingRules}
                            >
                                <Switch.Content className="min-h-11 min-w-11 justify-center">
                                    <Switch.Control className={allowOverage ? 'bg-success' : 'bg-default-200'}>
                                        <Switch.Thumb />
                                    </Switch.Control>
                                </Switch.Content>
                            </Switch>
                        </div>
                    </div>
                )}
            </Card.Content>
        </Card>
    );
}
