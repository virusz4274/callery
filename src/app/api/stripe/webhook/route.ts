
import { NextRequest, NextResponse } from 'next/server';
import { stripe } from '@/lib/stripe';
import { getMongoDb, Collections } from '@/lib/mongodb';
import { updateUser } from '@/lib/db/users';
import { Plan } from '@/lib/db/types';

export async function POST(req: NextRequest) {
    const body = await req.text();
    const signature = req.headers.get('stripe-signature') as string;

    let event;

    try {
        event = stripe.webhooks.constructEvent(
            body,
            signature,
            process.env.STRIPE_WEBHOOK_SECRET as string
        );
    } catch (err) {
        console.error(`Webhook signature verification failed.`, err);
        return NextResponse.json({ error: 'Webhook signature verification failed.' }, { status: 400 });
    }

    const db = await getMongoDb();

    try {
        switch (event.type) {
            case 'checkout.session.completed': {
                const session = event.data.object;
                const uid = session.metadata?.firebaseUid;

                if (uid) {
                    await updateUser(uid, {
                        stripeCustomerId: session.customer as string,
                        stripeSubscriptionId: session.subscription as string,
                        stripeSubscriptionStatus: 'active', // Assume active on success
                    });
                }
                break;
            }
            case 'customer.subscription.updated': {
                const subscription = event.data.object;
                const stripePriceId = subscription.items.data[0].price.id;
                const customerId = subscription.customer as string;
                const status = subscription.status;

                // Find user by stripeCustomerId
                const user = await db.collection(Collections.USERS).findOne({ stripeCustomerId: customerId });
                if (!user) {
                    console.error('User not found for subscription update:', customerId);
                    break;
                }

                // Find plan by stripePriceId
                const plan = await db.collection<Plan>(Collections.PLANS).findOne({ stripePriceId });

                const updateData: Record<string, unknown> = {
                    stripeSubscriptionId: subscription.id,
                    stripePriceId: stripePriceId,
                    // eslint-disable-next-line @typescript-eslint/no-explicit-any
                    stripeCurrentPeriodEnd: new Date((subscription as any).current_period_end * 1000),
                    stripeSubscriptionStatus: status,
                };

                if (plan && status === 'active') {
                    updateData.plan = plan.name;
                    // Update limits based on plan
                    updateData.storageAllocation = plan.limits.storage;
                    updateData.transcriptionAllocation = plan.limits.transcription;
                } else if (status === 'past_due' || status === 'unpaid') {
                    // Optionally downgrade or just mark status?
                    // For now, we update the status, and access checks should verify this status.
                }

                await updateUser(user.firebaseUid, updateData);
                break;
            }
            case 'customer.subscription.deleted': {
                const subscription = event.data.object;
                const customerId = subscription.customer as string;

                const user = await db.collection(Collections.USERS).findOne({ stripeCustomerId: customerId });
                if (!user) break;

                // Revert to Free
                // TODO: Ideally fetch the default plan from SystemSettings
                await updateUser(user.firebaseUid, {
                    plan: 'Free',
                    stripeSubscriptionId: undefined,
                    stripePriceId: undefined,
                    stripeCurrentPeriodEnd: undefined,
                    stripeSubscriptionStatus: 'canceled',
                });
                break;
            }
            case 'invoice.payment_failed': {
                const invoice = event.data.object;
                const customerId = invoice.customer as string;
                console.error(`Invoice payment failed for customer ${customerId}`);
                // Could emit notification here
                break;
            }
        }
    } catch (error) {
        console.error('Webhook handler failed:', error);
        return NextResponse.json({ error: 'Webhook handler failed' }, { status: 500 });
    }

    return NextResponse.json({ received: true });
}
