'use client';

import React from 'react';
import { UserResponse } from '@/lib/db/types';
import { AlertCircle, CreditCard } from 'lucide-react';
import Link from 'next/link';
import { isFreeTrialPlanKey } from '@/lib/plans';

interface BillingAlertProps {
    userProfile: UserResponse | null;
}

export function BillingAlert({ userProfile }: BillingAlertProps) {
    if (process.env.NEXT_PUBLIC_ENABLE_BILLING !== 'true') return null;
    if (!userProfile) return null;

    const status = userProfile.stripeSubscriptionStatus;
    const isPastDue = status === 'past_due' || status === 'unpaid';

    // Handle Trial Expiry
    // Note: userProfile from API has string dates, but TypeScript expects Date.
    // We safely parse it here.
    const trialEndsAt = userProfile.trialEndsAt ? new Date(userProfile.trialEndsAt) : null;
    const isTrialExpired = isFreeTrialPlanKey(userProfile.planKey) &&
        trialEndsAt &&
        new Date() > trialEndsAt;

    if (isPastDue) {
        return (
            <div className="w-full bg-red-50 border-l-4 border-red-500 p-4 mb-4 rounded-r-lg shadow-sm dark:bg-red-900/10 dark:border-red-500/50">
                <div className="flex items-start">
                    <div className="flex-shrink-0">
                        <AlertCircle className="h-5 w-5 text-red-500" aria-hidden="true" />
                    </div>
                    <div className="ml-3 flex-1 md:flex md:justify-between">
                        <p className="text-sm text-red-700 dark:text-red-200 font-medium">
                            Your payment failed. Your account features are currently restricted.
                        </p>
                        <p className="mt-3 text-sm md:mt-0 md:ml-6">
                            <Link href="/settings?tab=billing" className="whitespace-nowrap font-medium text-red-700 hover:text-red-600 dark:text-red-300 dark:hover:text-red-200 underline">
                                Update Payment Method &rarr;
                            </Link>
                        </p>
                    </div>
                </div>
            </div>
        );
    }

    if (isTrialExpired) {
        return (
            <div className="w-full bg-yellow-50 border-l-4 border-yellow-500 p-4 mb-4 rounded-r-lg shadow-sm dark:bg-yellow-900/10 dark:border-yellow-500/50">
                <div className="flex items-start">
                    <div className="flex-shrink-0">
                        <CreditCard className="h-5 w-5 text-yellow-600 dark:text-yellow-400" aria-hidden="true" />
                    </div>
                    <div className="ml-3 flex-1 md:flex md:justify-between">
                        <p className="text-sm text-yellow-800 dark:text-yellow-200 font-medium">
                            Your free trial has ended. Please upgrade to a paid plan to continue using all features.
                        </p>
                        <p className="mt-3 text-sm md:mt-0 md:ml-6">
                            <Link href="/settings?tab=billing" className="whitespace-nowrap font-medium text-yellow-800 hover:text-yellow-900 dark:text-yellow-300 dark:hover:text-yellow-200 underline">
                                Upgrade Now &rarr;
                            </Link>
                        </p>
                    </div>
                </div>
            </div>
        );
    }

    return null;
}
