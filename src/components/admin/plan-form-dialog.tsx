'use client';

import { useRef, useState } from 'react';
import { Button, Modal } from '@heroui/react';
import { useRouter } from 'next/navigation';
import { createPlan, updatePlan } from '@/app/actions/admin-plans';
import { AdminPlanSchema, validationFailure, type AdminFieldErrors } from '@/lib/admin-validation';
import { FieldError, focusInvalid } from './admin-form-errors';
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
    const [pending, setPending] = useState(false);
    const formKey = `${planToEdit?.id ?? 'new'}-${isOpen ? 'open' : 'closed'}`;

    return (
        <Modal.Backdrop isOpen={isOpen} onOpenChange={(open) => !open && !pending && onClose()} isDismissable={!pending}>
                <Modal.Container size="lg" scroll="inside">
                    <Modal.Dialog
                        key={formKey}
                        className="w-full max-w-4xl overflow-hidden p-0"
                    >
                        <Modal.CloseTrigger className="size-11" aria-label="Close plan editor" isDisabled={pending} />
                        <Modal.Header className="border-b border-border px-5 py-4 pr-16">
                            <Modal.Heading className="text-xl font-semibold">{planToEdit ? 'Edit plan' : 'Create plan'}</Modal.Heading>
                        </Modal.Header>
                        <PlanFormDialogContent planToEdit={planToEdit} onClose={onClose} onPendingChange={setPending} />
                    </Modal.Dialog>
                </Modal.Container>
            </Modal.Backdrop>
    );
}

type PlanFormDialogContentProps = {
    onClose: () => void;
    onPendingChange: (pending: boolean) => void;
    planToEdit?: PlanResponse | null;
};

function PlanFormDialogContent({ onClose, planToEdit, onPendingChange }: PlanFormDialogContentProps) {
    const router = useRouter();
    const { toast } = useToast();
    const [isPending, setIsPending] = useState(false);
    const [errors, setErrors] = useState<AdminFieldErrors>({});
    const [saveError, setSaveError] = useState<string | null>(null);
    const busy = useRef(false);
    const form = useRef<HTMLFormElement>(null);
    const mapErrors = (errors: AdminFieldErrors) => Object.fromEntries(Object.entries(errors).map(([key, value]) => [key === 'limits.storage' ? 'storageGB' : key === 'limits.transcription' ? 'transcriptionMinutes' : key, value]));
    const { values, setField } = usePlanFormState(getInitialPlanFormValues(planToEdit));

    const handleSubmit = async () => {
        if (busy.current) return;
        const planData = buildPlanPayload(values, planToEdit);
        const validation = AdminPlanSchema.safeParse(planData);
        if (!validation.success) { setErrors(mapErrors(validationFailure(validation.error).fieldErrors)); focusInvalid(form.current); return; }
        setErrors({}); setSaveError(null); busy.current = true; setIsPending(true); onPendingChange(true);
        try {
            const result = planToEdit ? await updatePlan(planToEdit.id, planData) : await createPlan(planData);
            if (result && 'fieldErrors' in result) { setErrors(mapErrors(result.fieldErrors)); focusInvalid(form.current); return; }

            router.refresh();
            toast({
                title: planToEdit ? 'Plan updated' : 'Plan created',
                status: 'success',
            });
            onClose();
        } catch (error) {
            setSaveError(error instanceof Error ? error.message : 'Please try again.');
            toast({
                title: 'Plan save failed',
                description: error instanceof Error ? error.message : 'Please review the plan details and try again.',
                status: 'danger',
            });
        } finally {
            busy.current = false; setIsPending(false); onPendingChange(false);
        }
    };

    return (
        <>
            <Modal.Body className="px-5 py-4">
                <form ref={form} id="admin-plan-form" noValidate onSubmit={event => { event.preventDefault(); void handleSubmit(); }}><PlanFormBody values={values} setField={setField} errors={errors} />{saveError && <p role="alert" className="mt-4 text-sm text-danger">{saveError} Your changes are retained; try saving again.</p>}<FieldError errors={errors} name="form" /></form>
            </Modal.Body>

            <Modal.Footer className="flex-wrap gap-2 border-t border-border px-5 py-4">
                <Button variant="secondary" className="h-auto min-h-11 min-w-0 flex-1 whitespace-normal py-2" onPress={onClose} isDisabled={isPending}>Cancel</Button>
                <Button type="submit" form="admin-plan-form" isPending={isPending} className="h-auto min-h-11 min-w-0 flex-1 whitespace-normal py-2">{saveError ? 'Retry save' : planToEdit ? 'Save changes' : 'Create plan'}</Button>
            </Modal.Footer>
        </>
    );
}
