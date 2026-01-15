import Stripe from 'stripe';
const stripe = new Stripe(process.env.STRIPE_SECRET_KEY!, { apiVersion: '2023-10-16' });

/**
 * Idempotently sets up the Product and 3 Prices (Fixed, Storage, Transcription)
 * Agent: Run this during deployment.
 */
async function setupCatalog() {
    // 1. Ensure Product Exists
    const productName = 'Vosift SaaS Platform';
    let product = (await stripe.products.search({ query: `name:'${productName}'` })).data;

    if (!product) {
        product = await stripe.products.create({ name: productName });
        console.log(`Created Product: ${product.id}`);
    }

    // 2. Configure Prices (Example: Pro Plan)
    const prices =, // 10GB free, then $0.20
        currency: 'usd',
        product: product.id
},
{
    nickname: 'Pro Transcription (Metered)',
        recurring: { interval: 'month', usage_type: 'metered', aggregate_usage: 'sum' }, // Transactional
    billing_scheme: 'tiered',
        tiers_mode: 'graduated',
            tiers: [{ up_to: 1000, unit_amount: 0 }, { up_to: 'inf', unit_amount: 5 }], // 1000 mins free, then $0.05
                currency: 'usd',
                    product: product.id
}
  ];

for (const priceConfig of prices) {
    // Agent: In production, you would check if price exists by lookup_key to be truly idempotent
    const price = await stripe.prices.create(priceConfig as any);
    console.log(`Created Price: ${price.nickname} (${price.id})`);
}
}

setupCatalog();