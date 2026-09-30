import { PricingSection } from "@/components/pricing-section";
import { billingEnabled } from "@/lib/config";

export default function PricingPage() {
    if (!billingEnabled()) {
        return (
            <div className="container mx-auto px-4 py-16">
                <div className="mx-auto max-w-xl text-center">
                    <h1 className="text-2xl font-semibold">Billing is disabled</h1>
                    <p className="mt-4 text-default-500">
                        This instance runs in self-hosted mode without subscriptions or
                        usage billing. All features are available to every account.
                    </p>
                </div>
            </div>
        );
    }
    return (
        <div className="container mx-auto px-4 py-16">
            <PricingSection />
        </div>
    );
}
