'use client';

import React, { useState } from 'react';
import { Button, Chip, Modal } from '@heroui/react';
import { Layers3 } from 'lucide-react';
import { useRouter } from 'next/navigation';
import { createPlan, updatePlan } from '@/app/actions/admin-plans';
import { useToast } from '@/components/toast-provider';
import type { PlanResponse } from '@/lib/db/types';
import { PlanFormBody } from './plan-form-dialog/plan-form-body';
import {
    buildPlanPayload,
    getInitialPlanFormValues,
    usePlanFormState,
} from './plan-form-dialog/use-plan-form-state';

type PlanFormDialogProps = {
    isOpen: boolean;
    onClose: () => void;
    planToEdit?: PlanResponse | null;
};

export function PlanFormDialog({ isOpen, onClose, planToEdit }: PlanFormDialogProps) {
    const formKey = `${planToEdit?.id ?? 'new'}-${isOpen ? 'open' : 'closed'}`;

    return (
        <Modal isOpen={isOpen} onOpenChange={(open) => !open && onClose()}>
            <Modal.Backdrop className="bg-background/80 backdrop-blur-md">
                <Modal.Container>
                    <Modal.Dialog
                        key={formKey}
                        className="w-full max-w-4xl overflow-hidden rounded-[2rem] border border-default-200/80 bg-background/98 p-0 shadow-[0_30px_80px_-48px_rgba(15,23,42,0.55)]"
                    >
                        <Modal.CloseTrigger />
                        <Modal.Header className="border-b border-default-100/80 px-6 py-6 sm:px-8">
                            <div className="flex flex-col gap-4">
                                <div className="flex flex-wrap items-center gap-3">
                                    <Chip variant="soft" color="default" className="rounded-full px-3 py-1 text-[11px] font-semibold uppercase tracking-[0.18em]">
                                        Billing catalog
                                    </Chip>
                                    <Chip variant="soft" color={planToEdit ? 'accent' : 'success'} className="rounded-full px-3 py-1 text-[11px] font-semibold">
                                        {planToEdit ? 'Editing live plan' : 'New plan draft'}
                                    </Chip>
                                </div>
                                <div className="flex items-start gap-4">
                                    <div className="flex h-12 w-12 shrink-0 items-center justify-center rounded-2xl bg-primary/10 text-primary">
                                        <Layers3 className="h-5 w-5" />
                                    </div>
                                    <div className="space-y-2">
                                        <h2 className="text-2xl font-bold tracking-[-0.04em] text-foreground">
                                            {planToEdit ? 'Update subscription plan' : 'Create subscription plan'}
                                        </h2>
                                        <p className="max-w-2xl text-sm leading-6 text-default-500">
                                            Define pricing, metered usage, and feature packaging in one place so the public pricing page and admin tools stay aligned.
                                        </p>
                                    </div>
                                </div>
                            </div>
                        </Modal.Header>
                        <PlanFormDialogContent planToEdit={planToEdit} onClose={onClose} />
                    </Modal.Dialog>
                </Modal.Container>
            </Modal.Backdrop>
        </Modal>
    );
}

type PlanFormDialogContentProps = {
    onClose: () => void;
    planToEdit?: PlanResponse | null;
};

function PlanFormDialogContent({ onClose, planToEdit }: PlanFormDialogContentProps) {
    const router = useRouter();
    const { toast } = useToast();
    const [isPending, setIsPending] = useState(false);
    const { values, setField } = usePlanFormState(getInitialPlanFormValues(planToEdit));

    const handleSubmit = async () => {
        setIsPending(true);
        try {
            const planData = buildPlanPayload(values);
            if (planToEdit) {
                await updatePlan(planToEdit.id, planData);
            } else {
                await createPlan(planData);
            }

            router.refresh();
            toast({
                title: planToEdit ? 'Plan updated' : 'Plan created',
                description: `${values.name || 'Plan'} is now synced with the admin catalog.`,
                status: 'success',
            });
            onClose();
        } catch (error) {
            console.error('Failed to save plan:', error);
            toast({
                title: 'Plan save failed',
                description: error instanceof Error ? error.message : 'Please review the plan details and try again.',
                status: 'danger',
            });
        } finally {
            setIsPending(false);
        }
    };

    return (
        <>
            <Modal.Body className="px-6 py-6 sm:px-8">
                <PlanFormBody values={values} setField={setField} />
            </Modal.Body>

            <Modal.Footer className="border-t border-default-100/80 px-6 py-5 sm:px-8">
                <div className="flex w-full flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
                    <p className="text-sm text-default-500">
                        Changes here affect checkout flows, plan assignment, and what customers see on pricing.
                    </p>
                    <div className="flex gap-3 self-end">
                        <Button variant="ghost" onPress={onClose} isDisabled={isPending}>
                            Cancel
                        </Button>
                        <Button variant="primary" onPress={handleSubmit} isDisabled={isPending}>
                            {isPending ? 'Saving...' : planToEdit ? 'Save changes' : 'Create plan'}
                        </Button>
                    </div>
                </div>
            </Modal.Footer>
        </>
    );
}
