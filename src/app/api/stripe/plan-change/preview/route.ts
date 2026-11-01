import { NextRequest, NextResponse } from 'next/server';
import { z } from 'zod';
import { requireBillingUser, billingErrorResponse } from '@/lib/stripe/http';
import { createPlanChangePreview } from '@/lib/stripe/plan-change';
const Body = z.object({ planKey: z.string().trim().min(1).max(100) }).strict();
export async function POST(req: NextRequest) {
    try {
        const user = await requireBillingUser(req);
        const body = Body.safeParse(await req.json().catch(() => null));
        if (!body.success) return NextResponse.json({ error: 'Choose a valid target plan.' }, { status: 400 });
        return NextResponse.json(await createPlanChangePreview(user.authSubject, body.data.planKey));
    } catch (error) { return billingErrorResponse(error); }
}
