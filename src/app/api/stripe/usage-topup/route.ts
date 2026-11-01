import { NextRequest, NextResponse } from 'next/server';
import { z } from 'zod';
import { requireBillingUser, billingErrorResponse } from '@/lib/stripe/http';
import { createUsageTopup, updateAutomaticTopup } from '@/lib/stripe/prepaid-topup';
import { getPrepaidState } from '@/lib/stripe/ledger';
import { env } from '@/lib/env';
const Body = z.object({ amountMinor: z.number().int().min(500).max(100000), currency: z.literal('usd').default('usd') }).strict();
const Settings = z.object({ enabled: z.boolean(), thresholdMinor: z.number().int().nonnegative().default(500),
    amountMinor: z.number().int().min(500).max(100000).default(1000), dailyCapMinor: z.number().int().min(500).max(1000000).default(2000),
    monthlyCapMinor: z.number().int().min(500).max(1000000).default(10000) }).strict();
export async function POST(req: NextRequest) {
    try {
        const user = await requireBillingUser(req), body = Body.safeParse(await req.json().catch(() => null));
        if (!body.success) return NextResponse.json({ error: 'Choose a usage-credit amount between USD 5 and USD 1,000.' }, { status: 400 });
        const origin = new URL(env.NEXT_PUBLIC_APP_URL).origin;
        return NextResponse.json(await createUsageTopup(user.authSubject, body.data.amountMinor,
            { success: `${origin}/settings?tab=billing&topup=success`, cancel: `${origin}/settings?tab=billing&topup=canceled` }));
    } catch (error) { return billingErrorResponse(error); }
}
export async function PATCH(req: NextRequest) {
    try {
        const user = await requireBillingUser(req), body = Settings.safeParse(await req.json().catch(() => null));
        if (!body.success) return NextResponse.json({ error: 'Choose valid automatic top-up limits.' }, { status: 400 });
        await updateAutomaticTopup(user.authSubject, body.data);
        return NextResponse.json({ updated: true });
    } catch (error) { return billingErrorResponse(error); }
}
export async function GET(req: NextRequest) {
    try { const user = await requireBillingUser(req, false); return NextResponse.json({ ...getPrepaidState(user), autoTopup: user.automaticTopup },
        { headers: { 'Cache-Control': 'private, no-store' } }); }
    catch (error) { return billingErrorResponse(error); }
}
