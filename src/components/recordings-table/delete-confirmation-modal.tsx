
import { AlertDialog, Button } from '@heroui/react';
import { Trash2 } from 'lucide-react';

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
        <AlertDialog.Backdrop isOpen={isOpen} onOpenChange={onOpenChange}>
            <AlertDialog.Container className="flex items-end sm:items-center justify-center h-full">
                <AlertDialog.Dialog className="m-0 sm:m-4 rounded-t-2xl sm:rounded-xl bg-card/95 backdrop-blur-xl border-t sm:border border-default-200/50 shadow-2xl w-full max-w-md">
                    <AlertDialog.CloseTrigger />
                    <AlertDialog.Header>
                        <AlertDialog.Icon status="danger" />
                        <AlertDialog.Heading>Are you sure?</AlertDialog.Heading>
                    </AlertDialog.Header>
                    <AlertDialog.Body>
                        This will permanently delete {count} recording(s). This action cannot be undone.
                    </AlertDialog.Body>
                    <AlertDialog.Footer>
                        <Button variant="ghost" slot="close">Cancel</Button>
                        <Button variant="danger" onPress={onConfirm} isPending={isDeleting}>
                            <Trash2 className="mr-2 h-4 w-4" />
                            Delete
                        </Button>
                    </AlertDialog.Footer>
                </AlertDialog.Dialog>
            </AlertDialog.Container>
        </AlertDialog.Backdrop>
    );
}
