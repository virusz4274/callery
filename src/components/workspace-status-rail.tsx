'use client';

import React from 'react';
import Link from 'next/link';
import type { AppUser as User } from '@/lib/auth/types';
import type { UserResponse, AnnouncementResponse } from '@/lib/db/types';
import { Button, Spinner, Surface } from '@heroui/react';
import { AlertCircle, Bell, CreditCard, MailWarning, X } from 'lucide-react';
import { getActiveAnnouncements } from '@/app/actions/admin-announcements';
import { isFreeTrialPlanKey } from '@/lib/plans';

type WorkspaceStatusRailProps = {
    user: User | null;
    userProfile: UserResponse | null;
    onResendVerification: () => Promise<void>;
};

type StatusItem = {
    id: string;
    title: string;
    description: string;
    tone: 'danger' | 'warning' | 'accent';
    actionLabel?: string;
    actionHref?: string;
    action?: () => Promise<void> | void;
    icon: typeof MailWarning;
};

const DISMISSED_KEY = 'callery:workspace-status:dismissed';

export function WorkspaceStatusRail({
    user,
    userProfile,
    onResendVerification,
}: WorkspaceStatusRailProps) {
    const [announcements, setAnnouncements] = React.useState<AnnouncementResponse[]>([]);
    const [dismissedIds, setDismissedIds] = React.useState<Set<string>>(new Set());
    const [pendingActionId, setPendingActionId] = React.useState<string | null>(null);

    React.useEffect(() => {
        try {
            const stored = window.localStorage.getItem(DISMISSED_KEY);
            if (!stored) {
                return;
            }
            const parsed = JSON.parse(stored) as string[];
            if (Array.isArray(parsed)) {
                // Browser storage hydration runs once after the server render.
                // eslint-disable-next-line react-hooks/set-state-in-effect
                setDismissedIds(new Set(parsed));
            }
        } catch {
            // Ignore malformed local storage state.
        }
    }, []);

    React.useEffect(() => {
        const fetchAnnouncements = async () => {
            try {
                const data = await getActiveAnnouncements();
                setAnnouncements(data);
            } catch {
                setAnnouncements([]);
            }
        };

        void fetchAnnouncements();
    }, []);

    const dismiss = React.useCallback((id: string) => {
        setDismissedIds((current) => {
            const next = new Set(current);
            next.add(id);
            window.localStorage.setItem(DISMISSED_KEY, JSON.stringify(Array.from(next)));
            return next;
        });
    }, []);

    const items = React.useMemo<StatusItem[]>(() => {
        const nextItems: StatusItem[] = [];
        const isEmailPasswordProvider = user?.canChangePassword;

        if (user && !user.emailVerified && isEmailPasswordProvider) {
            nextItems.push({
                id: 'email-verification',
                title: 'Verify your email',
                description: 'Your account is still unverified.',
                tone: 'danger',
                actionLabel: 'Resend',
                action: onResendVerification,
                icon: MailWarning,
            });
        }

        if (userProfile) {
            const status = userProfile.stripeSubscriptionStatus;
            const isPastDue = status === 'past_due' || status === 'unpaid';
            const trialEndsAt = userProfile.trialEndsAt ? new Date(userProfile.trialEndsAt) : null;
            const isTrialExpired = isFreeTrialPlanKey(userProfile.planKey) &&
                trialEndsAt &&
                new Date() > trialEndsAt;

            if (isPastDue) {
                nextItems.push({
                    id: 'billing-past-due',
                    title: 'Payment failed',
                    description: 'Features may be restricted until billing is fixed.',
                    tone: 'danger',
                    actionLabel: 'Open billing',
                    actionHref: '/settings?tab=billing',
                    icon: AlertCircle,
                });
            } else if (isTrialExpired) {
                nextItems.push({
                    id: 'billing-trial-expired',
                    title: 'Trial ended',
                    description: 'Upgrade to keep full access.',
                    tone: 'warning',
                    actionLabel: 'View plans',
                    actionHref: '/settings?tab=billing',
                    icon: CreditCard,
                });
            }
        }

        for (const announcement of announcements) {
            nextItems.push({
                id: `announcement:${announcement.id}`,
                title: announcement.title,
                description: announcement.message,
                tone: announcement.type === 'alert'
                    ? 'danger'
                    : announcement.type === 'warning'
                        ? 'warning'
                        : 'accent',
                icon: Bell,
            });
        }

        return nextItems.filter((item) => !dismissedIds.has(item.id));
    }, [announcements, dismissedIds, onResendVerification, user, userProfile]);

    if (items.length === 0) {
        return null;
    }

    return (
        <div className="space-y-2">
            {items.map((item) => {
                const Icon = item.icon;
                const toneClasses =
                    item.tone === 'danger'
                        ? 'border-danger/20 bg-danger/5 text-danger'
                        : item.tone === 'warning'
                            ? 'border-warning/20 bg-warning/5 text-warning'
                            : 'border-accent/20 bg-accent/5 text-accent';

                return (
                    <Surface
                        key={item.id}
                        variant="default"
                        className={`rounded-xl border px-4 py-3 shadow-none ${toneClasses}`}
                    >
                        <div className="flex items-start gap-3">
                            <div className="mt-0.5 flex h-8 w-8 flex-shrink-0 items-center justify-center rounded-full bg-background/80">
                                <Icon className="h-4 w-4" />
                            </div>

                            <div className="min-w-0 flex-1 space-y-1">
                                <div className="text-sm font-semibold text-foreground">{item.title}</div>
                                <p className="line-clamp-2 text-sm text-default-600">{item.description}</p>
                            </div>

                            <div className="flex items-center gap-2">
                                {item.actionHref && item.actionLabel && (
                                    <Link href={item.actionHref}>
                                        <Button size="sm" variant="ghost" className="rounded-full font-medium">
                                            {item.actionLabel}
                                        </Button>
                                    </Link>
                                )}
                                {item.action && item.actionLabel && (
                                    <Button
                                        size="sm"
                                        variant="ghost"
                                        className="rounded-full font-medium"
                                        isDisabled={pendingActionId === item.id}
                                        onPress={async () => {
                                            setPendingActionId(item.id);
                                            try {
                                                await item.action?.();
                                            } finally {
                                                setPendingActionId(null);
                                            }
                                        }}
                                    >
                                        {pendingActionId === item.id ? <Spinner size="sm" color="current" /> : null}
                                        {item.actionLabel}
                                    </Button>
                                )}
                                <Button
                                    isIconOnly
                                    size="sm"
                                    variant="ghost"
                                    className="rounded-full text-default-400"
                                    onPress={() => dismiss(item.id)}
                                    aria-label={`Dismiss ${item.title}`}
                                >
                                    <X className="h-4 w-4" />
                                </Button>
                            </div>
                        </div>
                    </Surface>
                );
            })}
        </div>
    );
}
