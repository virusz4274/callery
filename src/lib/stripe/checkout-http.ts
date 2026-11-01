import { logger } from '@/lib/logger';

import { NextRequest, NextResponse } from 'next/server';
import { z } from 'zod';
import { getAuthSubjectFromSession, getUserFromRequest } from '@/lib/auth-utils';
import { findUserByAuthSubject } from '@/lib/db/users';
import { getMongoDb } from '@/lib/mongodb';
import { getPublicAppOrigin } from '@/lib/public-url';
import { env } from '@/lib/env';
import { createOrResumeCheckout, CheckoutConflictError } from '@/lib/stripe/checkout';
import { BillingConfigurationError } from '@/lib/stripe/metering';
import { BillingBusyError } from '@/lib/stripe/billing-lock';
import { isOriginAllowed } from '@/lib/rate-limit';
import { getActiveCatalogBundle } from './catalog-bundle';

const CheckoutBodySchema = z.object({
    priceId: z.string().trim().max(200).optional(),
    planKey: z.string().trim().max(100).optional(),
    catalogVersion: z.string().trim().min(1).max(200).optional(),
    returnUrl: z.string().max(2048).optional(),
    successUrl: z.string().max(2048).optional(),
    cancelUrl: z.string().max(2048).optional(),
}).strict().refine(body => body.priceId || body.planKey);

interface CheckoutHttpDependencies {
    subject: (request: NextRequest) => Promise<string | null>;
    profile: typeof findUserByAuthSubject;
    database: typeof getMongoDb;
    checkout: typeof createOrResumeCheckout;
}
const defaults: CheckoutHttpDependencies = {
    subject: async request => await getAuthSubjectFromSession() || await getUserFromRequest(request),
    profile: findUserByAuthSubject, database: getMongoDb, checkout: createOrResumeCheckout,
};

function resolveSafeReturnUrl(
    candidateUrl: string | undefined,
    origin: string,
    fallbackPath: string
): string {
    const fallback = new URL(fallbackPath, origin).toString();
    if (!candidateUrl) {
        return fallback;
    }

    try {
        const parsed = new URL(candidateUrl, origin);
        if (parsed.origin !== origin) {
            return fallback;
        }

        return parsed.toString();
    } catch {
        return fallback;
    }
}

/** The HTTP entry point resolves exactly the immutable offer displayed by the app. */
export async function handleStripeCheckout(req: NextRequest, dependencies: CheckoutHttpDependencies = defaults) {
    if (!env.NEXT_PUBLIC_ENABLE_BILLING) {
        return NextResponse.json({ error: 'Billing is disabled on this instance.' }, { status: 403 });
    }

    try {
        if (!req.headers.get('origin') || !isOriginAllowed(req.headers.get('origin'), new URL(env.NEXT_PUBLIC_APP_URL).origin)) {
            return NextResponse.json({ error: 'Invalid request origin.' }, { status: 403 });
        }
        // 1. Authenticate
        const uid = await dependencies.subject(req);
        if (!uid) {
            return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
        }

        const rawBody = await req.json().catch(() => null);
        const parsedBody = CheckoutBodySchema.safeParse(rawBody ?? {});
        if (!parsedBody.success) {
            return NextResponse.json({ error: 'Invalid request body' }, { status: 400 });
        }
        const { priceId, planKey, catalogVersion, returnUrl, successUrl, cancelUrl } = parsedBody.data;
        const db = await dependencies.database(), bundle = await getActiveCatalogBundle(db);
        const selected = bundle?.plans.find(entry => entry.plan.isActive && !entry.plan.isDefault && !entry.plan.archivedAt
            && (!priceId || entry.plan.stripePriceId === priceId) && (!planKey || entry.plan.key === planKey));
        if (!selected?.plan.stripePriceId) {
            return NextResponse.json(
                { error: 'Invalid plan. Please choose a valid paid plan and try again.' },
                { status: 400 }
            );
        }
        if (catalogVersion && catalogVersion !== selected.catalogVersion) return NextResponse.json(
            { error: 'The published offer changed. Reload the pricing page before checking out.' }, { status: 409 });

        // 2. Get User
        const user = await dependencies.profile(uid);
        if (!user) {
            return NextResponse.json({ error: 'User not found' }, { status: 404 });
        }

        const appOrigin = getPublicAppOrigin(req);
        const resolvedSuccessUrl = resolveSafeReturnUrl(
            successUrl || returnUrl,
            appOrigin,
            '/settings?tab=billing&success=true'
        );
        const resolvedCancelUrl = resolveSafeReturnUrl(
            cancelUrl || returnUrl,
            appOrigin,
            '/settings?tab=billing&canceled=true'
        );

        const url = await dependencies.checkout(uid, { ...selected.plan, usageTariffs: selected.usageTariffs }, { success: resolvedSuccessUrl, cancel: resolvedCancelUrl });
        return NextResponse.json({ url });

    } catch (error) {
        if (error instanceof CheckoutConflictError || error instanceof BillingBusyError) {
            return NextResponse.json({ error: error.message }, { status: 409 });
        }
        if (error instanceof BillingConfigurationError) {
            return NextResponse.json({ error: error.message }, { status: 400 });
        }
        logger.error('Stripe Checkout Error:', error);
        return NextResponse.json(
            { error: error instanceof Error ? error.message : 'Internal Server Error' },
            { status: 500 }
        );
    }
}
