"use client";

import { useState } from 'react';
import { UserResponse } from '@/lib/db/types';
import {
    Modal,
    Button,
    Chip,
    Input,
    Label,
    Description,
    Surface,
} from '@heroui/react';
import { HardDrive, Waves } from 'lucide-react';
import { updateUserUsage } from '@/app/actions/admin';
import { useToast } from '@/components/toast-provider';
import { useRouter } from 'next/navigation';

type EditUsageDialogProps = {
    user: UserResponse;
    isOpen: boolean;
    onClose: () => void;
};

export function EditUsageDialog({ user, isOpen, onClose }: EditUsageDialogProps) {
    const [loading, setLoading] = useState(false);
    const { toast } = useToast();
    const router = useRouter();

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
            toast({ title: 'Usage updated', description: 'The account usage counters were saved.', status: 'success' });
            router.refresh();
            onClose();
        } catch (error) {
            console.error('Failed to update usage:', error);
            toast({ title: 'Update failed', description: 'Failed to update usage counters.', status: 'danger' });
        } finally {
            setLoading(false);
        }
    };

    return (
        <Modal isOpen={isOpen} onOpenChange={(open) => !open && onClose()}>
            <Modal.Backdrop className="bg-background/80 backdrop-blur-sm">
                <Modal.Container>
                    <Modal.Dialog className="w-full max-w-xl rounded-[1.75rem] border border-default-200/80 bg-background p-0 shadow-[0_30px_80px_-48px_rgba(15,23,42,0.55)]">
                        <Modal.Header className="border-b border-default-100/80 px-6 py-5">
                            <div className="space-y-2">
                                <div className="flex flex-wrap items-center gap-2">
                                    <Chip variant="soft" color="accent">Usage forgiveness</Chip>
                                    <Chip variant="soft" color="default">{user.name}</Chip>
                                </div>
                                <Modal.Heading className="text-2xl font-bold tracking-[-0.03em] text-foreground">
                                    Edit usage
                                </Modal.Heading>
                                <p className="text-sm leading-6 text-default-500">
                                    Manually adjust usage counters when you need to credit back failed uploads, testing activity, or support remediation.
                                </p>
                            </div>
                        </Modal.Header>

                        <form onSubmit={handleSubmit} className="flex flex-col gap-6 px-6 py-5">
                            <div className="grid gap-3 md:grid-cols-2">
                                <Surface variant="secondary" className="rounded-[1.25rem] border border-default-200/80 p-4">
                                    <div className="flex items-start gap-3">
                                        <div className="rounded-2xl bg-accent/10 p-2.5 text-accent">
                                            <HardDrive className="h-4 w-4" />
                                        </div>
                                        <div>
                                            <div className="font-semibold text-foreground">Storage usage</div>
                                            <p className="mt-1 text-sm leading-6 text-default-500">
                                                Adjust the bytes already consumed when uploads were removed or written off.
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
                                            <div className="font-semibold text-foreground">Transcription usage</div>
                                            <p className="mt-1 text-sm leading-6 text-default-500">
                                                Credit back consumed transcription seconds for failed processing or test data.
                                            </p>
                                        </div>
                                    </div>
                                </Surface>
                            </div>

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

                            <div className="mt-2 flex justify-end gap-2 border-t border-default-100/80 pt-4">
                                <Button variant="ghost" className="rounded-full" onPress={onClose} isDisabled={loading}>
                                    Cancel
                                </Button>
                                <Button type="submit" variant="primary" className="rounded-full px-5 font-semibold" isPending={loading}>
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
