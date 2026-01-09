'use client';

import React, { useState, useEffect } from 'react';
import {
    Modal,
    Button,
    Input,
    Checkbox,
    Label // Using Label as per manage-plan-dialog
    // Removed Select/SelectItem as they seem complex/unavailable
} from '@heroui/react';
import { PlanResponse } from '@/lib/db/types';
import { createPlan, updatePlan } from '@/app/actions/admin-plans';
import { useRouter } from 'next/navigation';

type PlanFormDialogProps = {
    isOpen: boolean;
    onClose: () => void;
    planToEdit?: PlanResponse | null;
};

export function PlanFormDialog({ isOpen, onClose, planToEdit }: PlanFormDialogProps) {
    const router = useRouter();
    const [isPending, setIsPending] = useState(false);

    // Form State
    const [name, setName] = useState('');
    const [description, setDescription] = useState('');
    const [stripePriceId, setStripePriceId] = useState('');
    const [price, setPrice] = useState('0');
    const [interval, setInterval] = useState<'monthly' | 'yearly' | 'lifetime'>('monthly');
    const [storageGB, setStorageGB] = useState('5');
    const [transcriptionMinutes, setTranscriptionMinutes] = useState('60');
    const [featuresInput, setFeaturesInput] = useState('');
    const [isDefault, setIsDefault] = useState(false);
    const [isActive, setIsActive] = useState(true);

    useEffect(() => {
        if (planToEdit) {
            setName(planToEdit.name);
            setDescription(planToEdit.description || '');
            setStripePriceId(planToEdit.stripePriceId || '');
            setPrice(planToEdit.price.toString());
            setInterval(planToEdit.interval);
            setStorageGB((planToEdit.limits.storage / (1024 * 1024 * 1024)).toString());
            setTranscriptionMinutes((planToEdit.limits.transcription / 60).toString());
            setFeaturesInput(planToEdit.features.join('\n'));
            setIsDefault(planToEdit.isDefault);
            setIsActive(planToEdit.isActive);
        } else {
            // Reset for create
            setName('');
            setDescription('');
            setStripePriceId('');
            setPrice('0');
            setInterval('monthly');
            setStorageGB('5');
            setTranscriptionMinutes('60');
            setFeaturesInput('');
            setIsDefault(false);
            setIsActive(true);
        }
    }, [planToEdit, isOpen]);

    const handleSubmit = async () => {
        setIsPending(true);
        try {
            const planData = {
                name,
                description,
                stripePriceId,
                price: parseFloat(price),
                currency: 'USD',
                interval,
                limits: {
                    storage: parseFloat(storageGB) * 1024 * 1024 * 1024,
                    transcription: parseFloat(transcriptionMinutes) * 60
                },
                features: featuresInput.split('\n').filter(f => f.trim()),
                isDefault,
                isActive
            };

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
        <Modal isOpen={isOpen} onOpenChange={(open) => !open && onClose()}>
            <Button className="hidden" aria-hidden="true" />
            <Modal.Backdrop>
                <Modal.Container>
                    <Modal.Dialog>
                        <Modal.Header>
                            <h2 className="text-lg font-bold">{planToEdit ? 'Edit Plan' : 'Create New Plan'}</h2>
                        </Modal.Header>
                        <Modal.Body>
                            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                                <div className="flex flex-col gap-2">
                                    <Label>Plan Name</Label>
                                    <Input
                                        placeholder="e.g. Enterprise"
                                        value={name}
                                        onChange={(e) => setName(e.target.value)}
                                    />
                                </div>

                                <div className="flex flex-col gap-2">
                                    <Label>Stripe Price ID</Label>
                                    <Input
                                        placeholder="price_H5ggY..."
                                        value={stripePriceId}
                                        onChange={(e) => setStripePriceId(e.target.value)}
                                    />
                                </div>

                                <div className="flex flex-col gap-2">
                                    <Label>Price (USD)</Label>
                                    <Input
                                        type="number"
                                        placeholder="0.00"
                                        value={price}
                                        onChange={(e) => setPrice(e.target.value)}
                                    />
                                </div>

                                <div className="md:col-span-2 flex flex-col gap-2">
                                    <Label>Description</Label>
                                    <Input
                                        placeholder="Short description for the pricing table"
                                        value={description}
                                        onChange={(e) => setDescription(e.target.value)}
                                    />
                                </div>

                                <div className="flex flex-col gap-2">
                                    <Label>Billing Interval</Label>
                                    {/* Using native select for simplicity */}
                                    <select
                                        className="h-10 w-full rounded-md border border-default-200 bg-default-50 px-3 text-sm focus:outline-none focus:ring-2 focus:ring-primary"
                                        value={interval}
                                        onChange={(e) => setInterval(e.target.value as 'monthly' | 'yearly' | 'lifetime')}
                                    >
                                        <option value="monthly">Monthly</option>
                                        <option value="yearly">Yearly</option>
                                        <option value="lifetime">Lifetime</option>
                                    </select>
                                </div>

                                <div className="flex flex-col gap-2">
                                    <Label>Status & Visibility</Label>
                                    <div className="flex flex-col gap-2">
                                        <Checkbox isSelected={isActive} onChange={() => setIsActive(!isActive)}>
                                            Active (Visible)
                                        </Checkbox>
                                        <Checkbox isSelected={isDefault} onChange={() => setIsDefault(!isDefault)}>
                                            Default Plan for New Users
                                        </Checkbox>
                                    </div>
                                </div>

                                <div className="md:col-span-2 divider my-2 font-bold text-sm">Limits</div>

                                <div className="flex flex-col gap-2">
                                    <Label>Storage (GB)</Label>
                                    <Input
                                        type="number"
                                        value={storageGB}
                                        onChange={(e) => setStorageGB(e.target.value)}
                                    />
                                </div>

                                <div className="flex flex-col gap-2">
                                    <Label>Transcription (Min)</Label>
                                    <Input
                                        type="number"
                                        value={transcriptionMinutes}
                                        onChange={(e) => setTranscriptionMinutes(e.target.value)}
                                    />
                                </div>

                                <div className="md:col-span-2 flex flex-col gap-2">
                                    <Label>Features (One per line)</Label>
                                    <textarea
                                        className="w-full p-2 rounded-lg border border-default-200 bg-default-50 text-sm focus:outline-none focus:ring-2 focus:ring-primary"
                                        rows={4}
                                        placeholder="Feature 1&#10;Feature 2&#10;Feature 3"
                                        value={featuresInput}
                                        onChange={(e) => setFeaturesInput(e.target.value)}
                                    />
                                </div>
                            </div>
                        </Modal.Body>
                        <Modal.Footer>
                            <Button variant="ghost" onPress={onClose} isDisabled={isPending}>
                                Cancel
                            </Button>
                            <Button variant="primary" onPress={handleSubmit} isDisabled={isPending} className="ml-2">
                                {isPending ? 'Saving...' : (planToEdit ? 'Update Plan' : 'Create Plan')}
                            </Button>
                        </Modal.Footer>
                    </Modal.Dialog>
                </Modal.Container>
            </Modal.Backdrop>
        </Modal>
    );
}
