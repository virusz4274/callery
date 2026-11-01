import { NextRequest, NextResponse } from 'next/server';
import { z } from 'zod';
import { requireBillingUser, billingErrorResponse } from '@/lib/stripe/http';
import { applyPlanChange, cancelPlanChange } from '@/lib/stripe/plan-change';
const Body = z.object({ previewId: z.string().uuid(), storageOverageConsent: z.boolean().default(false) }).strict();
export async function POST(req: NextRequest) {
    try {
        const user = await requireBillingUser(req);
        const body = Body.safeParse(await req.json().catch(() => null));
        if (!body.success) return NextResponse.json({ error: 'A valid billing preview is required.' }, { status: 400 });
        return NextResponse.json(await applyPlanChange(user.authSubject, body.data.previewId, body.data.storageOverageConsent));
    } catch (error) { return billingErrorResponse(error); }
}
export async function DELETE(req: NextRequest) {
    try {
        const user = await requireBillingUser(req);
        const body = z.object({ previewId: z.string().uuid() }).strict().safeParse(await req.json().catch(() => null));
        if (!body.success) return NextResponse.json({ error: 'A valid billing operation is required.' }, { status: 400 });
        await cancelPlanChange(user.authSubject, body.data.previewId);
        return NextResponse.json({ canceled: true });
    } catch (error) { return billingErrorResponse(error); }
}
