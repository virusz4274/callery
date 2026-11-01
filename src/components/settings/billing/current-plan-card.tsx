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
    isLifetime?: boolean;
    operatorFunded?: boolean;
    needsBillingAttention?: boolean;
    storageUsed: number;
    storageAlloc: number;
    storagePercent: number;
    transcribeUsed: number;
    transcribeAlloc: number;
    transcriptionUnlimited?: boolean;
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
    isLifetime = false,
    operatorFunded = false,
    needsBillingAttention = false,
    storageUsed,
    storageAlloc,
    storagePercent,
    transcribeUsed,
    transcribeAlloc,
    transcriptionUnlimited = false,
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
                    <Chip size="sm" variant="soft" color={isTrial || needsBillingAttention ? 'warning' : 'success'}>
                        {needsBillingAttention ? 'Billing needs attention' : operatorFunded ? 'Administrator funded' : isTrial ? 'Trial active' : 'Plan active'}
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
                                Your one-time 30-day trial does not renew monthly. Upgrade before it ends to continue uploading and transcribing.
                            </p>}
                            {operatorFunded && <p className="max-w-2xl text-sm leading-6 text-muted">
                                Your administrator provides this plan. {transcriptionUnlimited ? 'Transcription has no minute quota; configured provider and service limits still apply.' : 'Processing uses your assigned quotas, features, and expiry.'} A Stripe subscription or usage top-up is not required.
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
                            {isLoadingPortal ? 'Opening portal...' : 'Payments & invoices'}
                        </Button>
                    ) : !operatorFunded ? (
                        <UpgradePlanModal
                            plans={availablePlans}
                            isLoadingPlans={isLoadingPlans}
                            isCheckingOut={isCheckingOut}
                            onOpen={onUpgradeOpen}
                            onCheckout={onCheckout}
                        />
                    ) : null}
                </div>
                {canManageSubscription && !isLifetime && !operatorFunded && <UpgradePlanModal plans={availablePlans} isLoadingPlans={isLoadingPlans} isCheckingOut={isCheckingOut} onOpen={onUpgradeOpen} onCheckout={onCheckout} />}

                <div className="space-y-4">
                    <div className="rounded-xl border border-border bg-default-50/70 p-4">
                        <div className="mb-4 flex items-center gap-2 text-sm font-medium text-foreground">
                            <Sparkles className="h-4 w-4 text-primary" />
                            {isLifetime ? 'Metered usage' : 'Included usage'}
                        </div>
                        <div className="space-y-4">
                            <UsageProgressBar
                                label="Storage usage"
                                usedLabel={isLifetime ? formatBytes(storageUsed) : `${formatBytes(storageUsed)} / ${formatBytes(storageAlloc)}`}
                                percent={storagePercent}
                            />
                            <UsageProgressBar
                                label="Weighted transcription minutes"
                                usedLabel={transcriptionUnlimited ? `${formatSeconds(transcribeUsed)} used · Unlimited` : isLifetime ? formatSeconds(transcribeUsed) : `${formatSeconds(transcribeUsed)} / ${formatSeconds(transcribeAlloc)}`}
                                percent={transcriptionUnlimited ? 0 : transcribePercent}
                            />
                        </div>
                    </div>


                </div>

                {!isFree && !isTrial && !isLifetime && !operatorFunded && (
                    <div className="rounded-xl border border-border bg-background p-4 sm:p-5">
                        <div className="flex flex-col gap-4 lg:flex-row lg:items-center lg:justify-between">
                            <div className="space-y-2">
                                <div className="flex items-center gap-2">
                                    <h4 className="font-semibold text-foreground">Pay per usage</h4>
                                </div>
                                <p className="max-w-2xl text-sm leading-6 text-muted">
                                    Prepaid credit funds usage beyond your plan limits. New usage pauses when credit runs out.
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
