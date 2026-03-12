"use client";

import React, { useState } from 'react';
import {
    Modal,
    Button,
    Chip,
    Input,
    Label,
    Surface,
} from '@heroui/react';
import { HardDrive, Waves } from 'lucide-react';
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
            <Modal.Backdrop className="bg-background/80 backdrop-blur-sm">
                <Modal.Container>
                    <Modal.Dialog className="w-full max-w-xl rounded-[1.75rem] border border-default-200/80 bg-background p-0 shadow-[0_30px_80px_-48px_rgba(15,23,42,0.55)]">
                        <Modal.CloseTrigger />
                        <Modal.Header className="border-b border-default-100/80 px-6 py-5">
                            <div className="space-y-2">
                                <div className="flex flex-wrap items-center gap-2">
                                    <Chip variant="soft" color="accent">Custom limits</Chip>
                                    <Chip variant="soft" color="default">{user.name}</Chip>
                                </div>
                                <Modal.Heading className="text-2xl font-bold tracking-[-0.03em] text-foreground">
                                    Edit limits
                                </Modal.Heading>
                                <p className="text-sm leading-6 text-default-500">
                                    Override the plan-provided allocations for this user. These values persist until the plan changes again.
                                </p>
                            </div>
                        </Modal.Header>
                        <Modal.Body className="px-6 py-5">
                            <div className="space-y-5">
                                <div className="grid gap-3 md:grid-cols-2">
                                    <Surface variant="secondary" className="rounded-[1.25rem] border border-default-200/80 p-4">
                                        <div className="flex items-start gap-3">
                                            <div className="rounded-2xl bg-accent/10 p-2.5 text-accent">
                                                <HardDrive className="h-4 w-4" />
                                            </div>
                                            <div>
                                                <div className="font-semibold text-foreground">Storage cap</div>
                                                <p className="mt-1 text-sm leading-6 text-default-500">
                                                    Set the maximum storage this user can consume before further uploads are blocked.
                                                </p>
                                            </div>
                                        </div>
                                    </Surface>
                                    <Surface variant="secondary" className="rounded-[1.25rem] border border-default-200/80 p-4">
                                        <div className="flex items-start gap-3">
                                            <div className="rounded-2xl bg-success/10 p-2.5 text-success">
                                                <Waves className="h-4 w-4" />
                                            </div>
                                            <div>
                                                <div className="font-semibold text-foreground">Transcription cap</div>
                                                <p className="mt-1 text-sm leading-6 text-default-500">
                                                    Adjust the usable transcription budget independently from the assigned plan.
                                                </p>
                                            </div>
                                        </div>
                                    </Surface>
                                </div>

                                <div className="grid grid-cols-2 gap-4">
                                    <div className="space-y-2">
                                        <Label htmlFor="storage" className="text-sm font-medium">Storage Allocation (GB)</Label>
                                        <Input
                                            id="storage"
                                            type="number"
                                            min="0"
                                            value={storageGB}
                                            onChange={(e) => setStorageGB(e.target.value)}
                                            className="w-full"
                                        />
                                    </div>
                                    <div className="space-y-2">
                                        <Label htmlFor="transcription" className="text-sm font-medium">Transcription (Minutes)</Label>
                                        <Input
                                            id="transcription"
                                            type="number"
                                            min="0"
                                            value={transcriptionMin}
                                            onChange={(e) => setTranscriptionMin(e.target.value)}
                                            className="w-full"
                                        />
                                    </div>
                                </div>
                            </div>
                        </Modal.Body>
                        <Modal.Footer className="border-t border-default-100/80 px-6 py-4">
                            <Button variant="ghost" className="rounded-full" onPress={onClose}>Cancel</Button>
                            <Button variant="primary" className="rounded-full px-5 font-semibold" onPress={handleSave} isPending={loading}>
                                Save Changes
                            </Button>
                        </Modal.Footer>
                    </Modal.Dialog>
                </Modal.Container>
            </Modal.Backdrop>
        </Modal>
    );
}
