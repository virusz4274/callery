import type Stripe from 'stripe';
import { BillingConfigurationError } from './metering';

/** Do not inherit Dashboard defaults: they can expose uncapped plan changes. */
export async function restrictedPortalConfiguration(stripe: Stripe, id = process.env.STRIPE_PORTAL_CONFIGURATION_ID): Promise<string> {
    if (!id || !/^bpc_[A-Za-z0-9]+$/.test(id)) {
        throw new BillingConfigurationError('Configure STRIPE_PORTAL_CONFIGURATION_ID for the restricted payment and cancellation portal.');
    }
    const configuration = await stripe.billingPortal.configurations.retrieve(id);
    const features = configuration.features;
    const allowed = new Set(['invoice_history', 'payment_method_update', 'subscription_cancel']);
    if (configuration.id !== id || !configuration.active
        || !features.invoice_history.enabled || !features.payment_method_update.enabled
        || !features.subscription_cancel.enabled || features.subscription_cancel.mode !== 'at_period_end'
        || features.subscription_cancel.proration_behavior !== 'none'
        || Object.entries(features).some(([name, feature]) => !allowed.has(name) && feature.enabled)) {
        throw new BillingConfigurationError('The Stripe portal must allow only payment methods, invoices and cancellation at period end without prorations. Change plans inside the app.');
    }
    return configuration.id;
}
