import { NextRequest, NextResponse } from 'next/server';
import { requireBillingUser, billingErrorResponse } from '@/lib/stripe/http';
import { billingDependencies } from '@/lib/stripe/runtime';
import { BILLING_OPERATIONS, operationSummary, type BillingChangeOperation } from '@/lib/stripe/plan-change';

export async function GET(req: NextRequest, context: { params: Promise<{ id: string }> }) {
    try {
        const user = await requireBillingUser(req, false);
        const { id } = await context.params;
        const { db } = await billingDependencies();
        const operation = await db.collection<BillingChangeOperation>(BILLING_OPERATIONS).findOne({ _id: id, authSubject: user.authSubject });
        if (!operation) return NextResponse.json({ error: 'Billing change not found.' }, { status: 404 });
        return NextResponse.json({ ...operationSummary(operation), canCancel: operation.state === 'scheduled' || !operation.remoteStartedAt && ['quoted', 'draining'].includes(operation.state),
            ...(!['applied', 'canceled'].includes(operation.state) ? { preview: operation.preview } : {}) }, { headers: { 'Cache-Control': 'private, no-store' } });
    } catch (error) { return billingErrorResponse(error); }
}
