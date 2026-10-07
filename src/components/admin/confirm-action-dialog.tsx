'use client';

import { Button, Modal } from '@heroui/react';

export function ConfirmActionDialog({ title, description, label, pending, error, onConfirm, onClose, danger = true }: {
    title: string; description: string; label: string; pending: boolean; error?: string | null;
    onConfirm: () => void; onClose: () => void; danger?: boolean;
}) {
    return <Modal.Backdrop isOpen onOpenChange={open => { if (!open && !pending) onClose(); }} isDismissable={!pending}>
            <Modal.Container size="md" scroll="inside">
                <Modal.Dialog className="p-0">
                    <Modal.CloseTrigger className="size-11" isDisabled={pending} aria-label="Cancel action" />
                    <Modal.Header className="min-h-16 px-5 py-4 pr-16"><Modal.Heading className="line-clamp-2 break-words">{title}</Modal.Heading></Modal.Header>
                    <Modal.Body className="px-5 py-4">
                        {title.length > 50 && <p className="mb-3 break-words font-medium text-foreground">{title}</p>}
                        <p className="text-foreground">{description}</p>
                        {error && <p role="alert" className="mt-3 text-danger">{error}</p>}
                    </Modal.Body>
                    <Modal.Footer className="flex-wrap gap-2 border-t border-border px-5 py-4">
                        <Button variant="secondary" className="h-auto min-h-11 min-w-0 flex-1 whitespace-normal py-2" isDisabled={pending} onPress={onClose}>Cancel</Button>
                        <Button variant={danger ? 'danger' : 'primary'} className="h-auto min-h-11 min-w-0 flex-1 whitespace-normal py-2" isPending={pending} onPress={onConfirm}>{label}</Button>
                    </Modal.Footer>
                </Modal.Dialog>
            </Modal.Container>
        </Modal.Backdrop>;
}
