import React from 'react';
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
            <Button variant="primary" className="mt-4 sm:mt-0 font-medium" onPress={onOpen}>
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
                                            className="border border-default-200 rounded-lg p-4 hover:border-primary transition-colors"
                                        >
                                            <h3 className="font-bold text-xl">{plan.name}</h3>
                                            <div className="text-2xl font-bold my-2">
                                                ${plan.price}{' '}
                                                <span className="text-sm font-normal text-default-500">/{plan.interval}</span>
                                            </div>
                                            <ul className="space-y-2 mb-6">
                                                {plan.features.slice(0, 4).map((feature, index) => (
                                                    <li key={index} className="flex items-center gap-2 text-sm text-default-600">
                                                        <Check className="w-4 h-4 text-success" />
                                                        {feature}
                                                    </li>
                                                ))}
                                            </ul>
                                            <Button
                                                className="w-full"
                                                variant="primary"
                                                onPress={() => onCheckout(plan.stripePriceId)}
                                                isDisabled={isCheckingOut}
                                            >
                                                {isCheckingOut ? <Spinner size="sm" /> : `Choose ${plan.name}`}
                                            </Button>
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
