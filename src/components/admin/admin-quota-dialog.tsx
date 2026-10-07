'use client';

import { useRef, useState } from 'react';
import { Button, Input, Label, Modal } from '@heroui/react';
import { useRouter } from 'next/navigation';
import { updateUserLimits, updateUserUsage } from '@/app/actions/admin';
import type { UserResponse } from '@/lib/db/types';
import { AdminLimitsSchema, AdminUsageSchema, numericInput, validationFailure, type AdminFieldErrors } from '@/lib/admin-validation';
import { useToast } from '@/components/toast-provider';
import { FieldError, focusInvalid } from './admin-form-errors';

export function AdminQuotaDialog({ user, mode, isOpen, onClose }: { user: UserResponse; mode: 'limits' | 'usage'; isOpen: boolean; onClose: () => void }) {
    const limits = mode === 'limits';
    const [storage, setStorage] = useState(String(limits ? user.storageAllocation / 1024 ** 3 : user.storageUsed));
    const [transcription, setTranscription] = useState(String(limits ? user.transcriptionAllocation / 60 : user.transcriptionUsed));
    const [errors, setErrors] = useState<AdminFieldErrors>({});
    const [error, setError] = useState<string | null>(null);
    const [pending, setPending] = useState(false);
    const busy = useRef(false);
    const form = useRef<HTMLFormElement>(null);
    const router = useRouter();
    const { toast } = useToast();
    const storageName = limits ? 'storageAllocation' : 'storageUsed';
    const transcriptionName = limits ? 'transcriptionAllocation' : 'transcriptionUsed';
    const submit = async (event: React.FormEvent) => {
        event.preventDefault();
        if (busy.current) return;
        const storageValue = limits && storage === String(user.storageAllocation / 1024 ** 3) ? user.storageAllocation : numericInput(storage) * (limits ? 1024 ** 3 : 1);
        const transcriptionValue = limits && transcription === String(user.transcriptionAllocation / 60) ? user.transcriptionAllocation : numericInput(transcription) * (limits ? 60 : 1);
        const payload = { [storageName]: storageValue, [transcriptionName]: transcriptionValue };
        const validation = (limits ? AdminLimitsSchema : AdminUsageSchema).safeParse(payload);
        if (!validation.success) { setErrors(validationFailure(validation.error).fieldErrors); focusInvalid(form.current); return; }
        setErrors({}); setError(null); busy.current = true; setPending(true);
        try {
            const result = limits
                ? await updateUserLimits(user.id, { storageAllocation: storageValue, transcriptionAllocation: transcriptionValue })
                : await updateUserUsage(user.id, { storageUsed: storageValue, transcriptionUsed: transcriptionValue });
            if (result?.fieldErrors) { setErrors(result.fieldErrors); focusInvalid(form.current); return; }
            toast({ title: limits ? 'User limits updated' : 'Usage updated', status: 'success' });
            router.refresh(); onClose();
        } catch (error) { setError(error instanceof Error ? error.message : 'Please try again.'); }
        finally { busy.current = false; setPending(false); }
    };
    return <Modal.Backdrop isOpen={isOpen} onOpenChange={open => { if (!open && !busy.current) onClose(); }} isDismissable={!pending}>
            <Modal.Container size="lg" scroll="inside">
                <Modal.Dialog className="p-0">
                    <Modal.CloseTrigger aria-label="Close quota editor" className="size-11" isDisabled={pending} />
                    <Modal.Header className="px-5 py-4 pr-16">
                        <Modal.Heading>{limits ? 'Edit limits' : 'Edit usage'}</Modal.Heading>
                    </Modal.Header>
                    <Modal.Body className="border-y border-border px-5 py-4">
                        <form ref={form} id={`admin-${mode}-form`} noValidate onSubmit={submit} className="space-y-5">
                            <p className="break-words font-medium text-foreground">{user.name || user.email}</p>
                            <p className="text-sm text-muted">{limits ? 'Override the allocations provided by the current plan.' : 'Adjust consumed usage to credit failed processing or support corrections. Values are stored in bytes and seconds.'}</p>
                            <div className="space-y-2">
                                <Label htmlFor={storageName}>Storage {limits ? '(GB)' : 'used (bytes)'}</Label>
                                <Input id={storageName} type="number" min={0} step="any" value={storage} onChange={e => setStorage(e.target.value)} aria-invalid={!!errors[storageName]} aria-describedby={[!limits && `${storageName}-help`, errors[storageName] && `${storageName}-error`].filter(Boolean).join(' ') || undefined} className="min-h-11 w-full" />
                                {!limits && <p id={`${storageName}-help`} className="text-xs text-muted">≈ {(numericInput(storage) / 1024 ** 3 || 0).toFixed(4)} GB</p>}
                                <FieldError errors={errors} name={storageName} />
                            </div>
                            <div className="space-y-2">
                                <Label htmlFor={transcriptionName}>Transcription {limits ? '(minutes)' : 'used (seconds)'}</Label>
                                <Input id={transcriptionName} type="number" min={0} step="any" value={transcription} onChange={e => setTranscription(e.target.value)} aria-invalid={!!errors[transcriptionName]} aria-describedby={[!limits && `${transcriptionName}-help`, errors[transcriptionName] && `${transcriptionName}-error`].filter(Boolean).join(' ') || undefined} className="min-h-11 w-full" />
                                {!limits && <p id={`${transcriptionName}-help`} className="text-xs text-muted">≈ {(numericInput(transcription) / 60 || 0).toFixed(2)} minutes</p>}
                                <FieldError errors={errors} name={transcriptionName} />
                            </div>
                            {error && <p role="alert" className="text-sm text-danger">{error} Your changes are retained; try saving again.</p>}
                        </form>
                    </Modal.Body>
                    <Modal.Footer className="flex-wrap gap-2 px-5 py-4">
                        <Button variant="secondary" className="h-auto min-h-11 min-w-0 flex-1 whitespace-normal py-2" isDisabled={pending} onPress={onClose}>Cancel</Button>
                        <Button type="submit" form={`admin-${mode}-form`} className="h-auto min-h-11 min-w-0 flex-1 whitespace-normal py-2" isPending={pending}>{error ? 'Retry save' : 'Save changes'}</Button>
                    </Modal.Footer>
                </Modal.Dialog>
            </Modal.Container>
        </Modal.Backdrop>;
}
