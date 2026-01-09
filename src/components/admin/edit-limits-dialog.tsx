"use client";

import React, { useState } from 'react';
import {
    Modal,
    Button,
    Input,
    Label
} from '@heroui/react';
import type { UserResponse } from '@/lib/db/types';
import { updateUserLimits } from '@/app/actions/admin';
import { useToast } from '@/components/toast-provider';
import { useRouter } from 'next/navigation';

type EditLimitsDialogProps = {
    user: UserResponse;
    isOpen: boolean;
    onClose: () => void;
};

export function EditLimitsDialog({ user, isOpen, onClose }: EditLimitsDialogProps) {
    const { toast } = useToast();
    const router = useRouter();
    const [loading, setLoading] = useState(false);

    // Convert basic units to display units
    // Storage: Bytes -> GB
    // Transcription: Seconds -> Minutes
    const [storageGB, setStorageGB] = useState<string>(
        String(Math.floor(user.storageAllocation / (1024 * 1024 * 1024)))
    );

    const [transcriptionMin, setTranscriptionMin] = useState<string>(
        String(Math.floor(user.transcriptionAllocation / 60))
    );

    const handleSave = async () => {
        setLoading(true);
        try {
            const storageBytes = Number(storageGB) * 1024 * 1024 * 1024;
            const transcriptionSeconds = Number(transcriptionMin) * 60;

            await updateUserLimits(user.id, {
                storageAllocation: storageBytes,
                transcriptionAllocation: transcriptionSeconds
            });

            toast({ title: 'Success', description: 'User limits updated', status: 'success' });
            onClose();
            router.refresh();

        } catch (error) {
            console.error(error);
            toast({ title: 'Error', description: 'Failed to update limits', status: 'danger' });
        } finally {
            setLoading(false);
        }
    };

    return (
        <Modal isOpen={isOpen} onOpenChange={(open) => !open && onClose()}>
            <Button className="hidden" aria-hidden="true" />
            <Modal.Backdrop>
                <Modal.Container>
                    <Modal.Dialog>
                        <Modal.CloseTrigger />
                        <Modal.Header>
                            <Modal.Heading>Edit Limits for {user.name}</Modal.Heading>
                        </Modal.Header>
                        <Modal.Body>
                            <div className="space-y-4 py-4">
                                <p className="text-sm text-gray-500">
                                    Manually overriding these limits will persist until the user&apos;s plan changes.
                                </p>

                                <div className="grid grid-cols-2 gap-4">
                                    <div className="space-y-2">
                                        <Label htmlFor="storage">Storage Allocation (GB)</Label>
                                        <Input
                                            id="storage"
                                            type="number"
                                            min="0"
                                            value={storageGB}
                                            onChange={(e) => setStorageGB(e.target.value)}
                                        />
                                    </div>
                                    <div className="space-y-2">
                                        <Label htmlFor="transcription">Transcription (Minutes)</Label>
                                        <Input
                                            id="transcription"
                                            type="number"
                                            min="0"
                                            value={transcriptionMin}
                                            onChange={(e) => setTranscriptionMin(e.target.value)}
                                        />
                                    </div>
                                </div>
                            </div>
                        </Modal.Body>
                        <Modal.Footer>
                            <Button variant="ghost" onPress={onClose}>Cancel</Button>
                            <Button variant="primary" onPress={handleSave} isPending={loading}>
                                Save Changes
                            </Button>
                        </Modal.Footer>
                    </Modal.Dialog>
                </Modal.Container>
            </Modal.Backdrop>
        </Modal>
    );
}
