"use client";

import { useState } from 'react';
import { UserResponse } from '@/lib/db/types';
import {
    Modal,
    Button,
    Input,
    Label,
    Description
} from '@heroui/react';
import { updateUserUsage } from '@/app/actions/admin';

type EditUsageDialogProps = {
    user: UserResponse;
    isOpen: boolean;
    onClose: () => void;
};

export function EditUsageDialog({ user, isOpen, onClose }: EditUsageDialogProps) {
    const [loading, setLoading] = useState(false);

    // Initial values
    const [storageBytes, setStorageBytes] = useState(user.storageUsed.toString());
    const [transcriptionSeconds, setTranscriptionSeconds] = useState(user.transcriptionUsed.toString());

    // Helper display values
    const storageGB = (Number(storageBytes) / (1024 * 1024 * 1024)).toFixed(4);
    const transcriptionMinutes = (Number(transcriptionSeconds) / 60).toFixed(2);

    const handleSubmit = async (e: React.FormEvent) => {
        e.preventDefault();
        setLoading(true);
        try {
            await updateUserUsage(user.id, {
                storageUsed: Number(storageBytes),
                transcriptionUsed: Number(transcriptionSeconds)
            });
            onClose();
        } catch (error) {
            console.error('Failed to update usage:', error);
            alert('Failed to update usage');
        } finally {
            setLoading(false);
        }
    };

    return (
        <Modal isOpen={isOpen} onOpenChange={onClose}>
            <Modal.Backdrop className="bg-background/80 backdrop-blur-sm">
                <Modal.Container>
                    <Modal.Dialog className="w-full max-w-md bg-card p-6 rounded-xl shadow-xl border border-default-200">
                        <Modal.Header>
                            <Modal.Heading className="text-xl font-bold">Edit Usage (Forgiveness)</Modal.Heading>
                            <p className="text-sm text-default-500">
                                Manually adjust usage counters. Use this to credit back usage for failed uploads or tests.
                            </p>
                        </Modal.Header>

                        <form onSubmit={handleSubmit} className="flex flex-col gap-6 mt-4">
                            {/* Storage Input */}
                            <div className="flex flex-col gap-2">
                                <Label>Storage Used (Bytes)</Label>
                                <Input
                                    type="number"
                                    value={storageBytes}
                                    onChange={(e) => setStorageBytes(e.target.value)}
                                    placeholder="Bytes"
                                />
                                <Description className="text-xs text-default-500">
                                    ≈ {storageGB} GB
                                </Description>
                            </div>

                            {/* Transcription Input */}
                            <div className="flex flex-col gap-2">
                                <Label>Transcription Used (Seconds)</Label>
                                <Input
                                    type="number"
                                    value={transcriptionSeconds}
                                    onChange={(e) => setTranscriptionSeconds(e.target.value)}
                                    placeholder="Seconds"
                                />
                                <Description className="text-xs text-default-500">
                                    ≈ {transcriptionMinutes} Minutes
                                </Description>
                            </div>

                            <div className="flex justify-end gap-2 mt-2">
                                <Button variant="ghost" onPress={onClose} isDisabled={loading}>
                                    Cancel
                                </Button>
                                <Button type="submit" variant="primary" isPending={loading}>
                                    Update Usage
                                </Button>
                            </div>
                        </form>
                    </Modal.Dialog>
                </Modal.Container>
            </Modal.Backdrop>
        </Modal>
    );
}
