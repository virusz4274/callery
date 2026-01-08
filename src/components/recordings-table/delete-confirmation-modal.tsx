
import React from 'react';
import { Modal, Button } from '@heroui/react';
import { Trash2, Loader2 } from 'lucide-react';

interface DeleteConfirmationModalProps {
    isOpen: boolean;
    onOpenChange: (isOpen: boolean) => void;
    count: number;
    onConfirm: () => void;
    isDeleting: boolean;
}

export function DeleteConfirmationModal({
    isOpen,
    onOpenChange,
    count,
    onConfirm,
    isDeleting
}: DeleteConfirmationModalProps) {
    return (
        <Modal isOpen={isOpen} onOpenChange={onOpenChange}>
            <Button className="hidden" />
            <Modal.Backdrop>
                <Modal.Container>
                    <Modal.Dialog className="bg-card/70 backdrop-blur-xl border border-default-200 shadow-2xl">
                        <Modal.CloseTrigger />
                        <Modal.Header>
                            <Modal.Heading>Are you sure?</Modal.Heading>
                        </Modal.Header>
                        <Modal.Body>
                            This will permanently delete {count} recording(s). This action cannot be undone.
                        </Modal.Body>
                        <Modal.Footer>
                            <Button variant="ghost" onPress={() => onOpenChange(false)}>Cancel</Button>
                            <Button variant="danger" onPress={onConfirm} isPending={isDeleting}>
                                {isDeleting ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : <Trash2 className="mr-2 h-4 w-4" />}
                                Delete
                            </Button>
                        </Modal.Footer>
                    </Modal.Dialog>
                </Modal.Container>
            </Modal.Backdrop>
        </Modal>
    );
}
