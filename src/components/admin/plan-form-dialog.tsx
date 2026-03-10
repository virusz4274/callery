'use client';

import React, { useState } from 'react';
import { Button, Modal } from '@heroui/react';
import { useRouter } from 'next/navigation';
import type { PlanResponse } from '@/lib/db/types';
import { createPlan, updatePlan } from '@/app/actions/admin-plans';
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
            <Modal.Backdrop className="bg-background/80 backdrop-blur-sm">
                <Modal.Container>
                    <Modal.Dialog
                        key={formKey}
                        className="w-full max-w-2xl bg-card p-6 rounded-xl shadow-xl border border-default-200"
                    >
                        <Modal.Header>
                            <h2 className="text-xl font-bold">{planToEdit ? 'Edit Plan' : 'Create New Plan'}</h2>
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
            onClose();
        } catch (error) {
            console.error('Failed to save plan:', error);
            alert('Failed to save plan');
        } finally {
            setIsPending(false);
        }
    };

    return (
        <>
            <Modal.Body>
                <PlanFormBody values={values} setField={setField} />
            </Modal.Body>

            <Modal.Footer>
                <Button variant="ghost" onPress={onClose} isDisabled={isPending}>
                    Cancel
                </Button>
                <Button variant="primary" onPress={handleSubmit} isDisabled={isPending} className="ml-2">
                    {isPending ? 'Saving...' : planToEdit ? 'Update Plan' : 'Create Plan'}
                </Button>
            </Modal.Footer>
        </>
    );
}
