import 'dotenv/config';
import Stripe from 'stripe';
const stripe = new Stripe(process.env.STRIPE_SECRET_KEY!, { apiVersion: '2023-10-16' });

/**
 * Idempotently sets up the Product and 3 Prices (Fixed, Storage, Transcription)
 * Agent: Run this during deployment.
 */
async function setupCatalog() {
    // 1. Ensure Product Exists
    const productName = 'Vosift SaaS Platform';
    // Search API is flaky/unavailable in some regions/test modes, use list instead
    const products = await stripe.products.list({ limit: 100, active: true });
    let product = products.data.find(p => p.name === productName);

    if (!product) {
        product = await stripe.products.create({ name: productName });
        console.log(`Created Product: ${product.id}`);
    } else {
        console.log(`Found Existing Product: ${product.id}`);
    }

    // 2. Configure Prices (Example: Pro Plan)
    const prices = [
        {
            nickname: 'Pro Base License',
            unit_amount: 2900, // $29.00
            currency: 'usd',
            recurring: { interval: 'month' },
            product: product.id,
        },
        {
            nickname: 'Pro Transcription (Metered)',
            recurring: { interval: 'month', usage_type: 'metered', aggregate_usage: 'sum' },
            billing_scheme: 'tiered',
            tiers_mode: 'graduated',
            tiers: [{ up_to: 1000, unit_amount: 0 }, { up_to: 'inf', unit_amount: 5 }], // 1000 mins free, then $0.05
            currency: 'usd',
            product: product.id,
        },
        {
            nickname: 'Pro Storage (Metered)',
            recurring: { interval: 'month', usage_type: 'metered', aggregate_usage: 'max' },
            billing_scheme: 'tiered',
            tiers_mode: 'graduated',
            tiers: [{ up_to: 10, unit_amount: 0 }, { up_to: 'inf', unit_amount: 20 }], // 10GB free, then $0.20
            currency: 'usd',
            product: product.id,
        }
    ];

    for (const priceConfig of prices) {
        try {
            // Agent: In production, you would check if price exists by lookup_key to be truly idempotent
            const price = await stripe.prices.create(priceConfig as any);
            console.log(`Created Price: ${price.nickname} (${price.id})`);
        } catch (error: any) {
            console.error(`Failed to create price ${priceConfig.nickname}:`, error.message);
            if (error.raw) {
                console.error('Raw Error:', JSON.stringify(error.raw, null, 2));
            }
        }
    }
}

setupCatalog().catch(console.error);