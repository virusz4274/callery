import { Button, Modal, Spinner } from '@heroui/react';
import { Check } from 'lucide-react';
import type { PublicPlan } from '@/app/actions/plans';

type UpgradePlanModalProps = {
    plans: PublicPlan[];
    isLoadingPlans: boolean;
    isCheckingOut: boolean;
    onOpen: () => void;
    onCheckout: (priceId: string) => void;
};

export function UpgradePlanModal({
    plans,
    isLoadingPlans,
    isCheckingOut,
    onOpen,
    onCheckout,
}: UpgradePlanModalProps) {
    return (
        <Modal>
            <Button variant="primary" className="mt-4 px-6 font-semibold sm:mt-0" onPress={onOpen}>
                Upgrade Plan
            </Button>
            <Modal.Backdrop>
                <Modal.Container>
                    <Modal.Dialog className="sm:max-w-xl">
                        <Modal.CloseTrigger />
                        <Modal.Header>
                            <Modal.Heading>Upgrade Your Plan</Modal.Heading>
                        </Modal.Header>
                        <Modal.Body>
                            {isLoadingPlans ? (
                                <div className="flex justify-center py-10">
                                    <Spinner size="lg" />
                                </div>
                            ) : (
                                <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                                    {plans.map((plan) => (
                                        <div
                                            key={plan.id}
                                            className={`rounded-xl border p-4 transition-colors ${
                                                plan.isPurchasable
                                                    ? 'border-default-200 hover:border-primary'
                                                    : 'border-default-200/80 bg-default-50/60'
                                            }`}
                                        >
                                            <h3 className="font-semibold text-xl">{plan.name}</h3>
                                            <div className="text-2xl font-bold my-2">
                                                ${plan.price}{' '}
                                                <span className="text-sm font-normal text-muted">/{plan.interval}</span>
                                            </div>
                                            <ul className="space-y-2 mb-6">
                                                {plan.features.slice(0, 4).map((feature, index) => (
                                                    <li key={index} className="flex items-center gap-2 text-sm text-muted">
                                                        <Check className="w-4 h-4 text-success" />
                                                        {feature}
                                                    </li>
                                                ))}
                                            </ul>
                                            <Button
                                                className="w-full font-semibold"
                                                variant="primary"
                                                onPress={() => onCheckout(plan.stripePriceId)}
                                                isDisabled={isCheckingOut || !plan.isPurchasable}
                                            >
                                                {isCheckingOut ? (
                                                    <Spinner size="sm" />
                                                ) : plan.isPurchasable ? (
                                                    `Choose ${plan.name}`
                                                ) : (
                                                    'Checkout unavailable'
                                                )}
                                            </Button>
                                            {!plan.isPurchasable && (
                                                <p className="mt-2 text-xs text-muted">
                                                    This plan is visible here, but checkout is not configured yet.
                                                </p>
                                            )}
                                        </div>
                                    ))}
                                </div>
                            )}
                        </Modal.Body>
                        <Modal.Footer>
                            <Button variant="ghost" slot="close">
                                Close
                            </Button>
                        </Modal.Footer>
                    </Modal.Dialog>
                </Modal.Container>
            </Modal.Backdrop>
        </Modal>
    );
}
