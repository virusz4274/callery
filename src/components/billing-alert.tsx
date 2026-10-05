'use client';

import { Alert } from '@heroui/react';
import { UserResponse } from '@/lib/db/types';
import Link from 'next/link';
import { isFreeTrialPlanKey } from '@/lib/plans';
import { publicEnv } from '@/lib/public-env';

interface BillingAlertProps {
    userProfile: UserResponse | null;
}

export function BillingAlert({ userProfile }: BillingAlertProps) {
    if (!publicEnv.NEXT_PUBLIC_ENABLE_BILLING) return null;
    if (!userProfile) return null;

    const status = userProfile.stripeSubscriptionStatus;
    const isPastDue = status === 'past_due' || status === 'unpaid';

    const trialEndsAt = userProfile.trialEndsAt ? new Date(userProfile.trialEndsAt) : null;
    const isTrialExpired = isFreeTrialPlanKey(userProfile.planKey) &&
        trialEndsAt &&
        new Date() > trialEndsAt;

    if (isPastDue) {
        return (
            <Alert status="danger" className="mb-4">
                <Alert.Indicator />
                <Alert.Content>
                    <Alert.Title>Payment failed</Alert.Title>
                    <Alert.Description>
                        Your account features are currently restricted.{' '}
                        <Link
                            href="/settings?tab=billing"
                            className="font-semibold underline underline-offset-2 hover:opacity-80 transition-opacity"
                        >
                            Update Payment Method &rarr;
                        </Link>
                    </Alert.Description>
                </Alert.Content>
            </Alert>
        );
    }

    if (isTrialExpired) {
        return (
            <Alert status="warning" className="mb-4">
                <Alert.Indicator />
                <Alert.Content>
                    <Alert.Title>Free trial ended</Alert.Title>
                    <Alert.Description>
                        Upgrade to a paid plan to continue using all features.{' '}
                        <Link
                            href="/settings?tab=billing"
                            className="font-semibold underline underline-offset-2 hover:opacity-80 transition-opacity"
                        >
                            Upgrade Now &rarr;
                        </Link>
                    </Alert.Description>
                </Alert.Content>
            </Alert>
        );
    }

    return null;
}
