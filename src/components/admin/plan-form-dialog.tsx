'use client';

import React, { useState, useEffect } from 'react';
import {
    Modal,
    Button,
    Input,
    Checkbox,
    Label,
    Select,
    ListBox,
    TextArea
} from '@heroui/react';
import { PlanResponse } from '@/lib/db/types';
import { createPlan, updatePlan } from '@/app/actions/admin-plans';
import { useRouter } from 'next/navigation';

type PlanFormDialogProps = {
    isOpen: boolean;
    onClose: () => void;
    planToEdit?: PlanResponse | null;
};

const INTERVALS = [
    { value: 'monthly', label: 'Monthly' },
    { value: 'yearly', label: 'Yearly' },
    { value: 'lifetime', label: 'Lifetime' },
];

export function PlanFormDialog({ isOpen, onClose, planToEdit }: PlanFormDialogProps) {
    const router = useRouter();
    const [isPending, setIsPending] = useState(false);

    // Form State
    const [name, setName] = useState('');
    const [description, setDescription] = useState('');
    const [stripePriceId, setStripePriceId] = useState('');
    const [stripeStoragePriceId, setStripeStoragePriceId] = useState('');
    const [stripeTranscriptionPriceId, setStripeTranscriptionPriceId] = useState('');
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
            setStripeStoragePriceId(planToEdit.stripeStoragePriceId || '');
            setStripeTranscriptionPriceId(planToEdit.stripeTranscriptionPriceId || '');
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
            setStripeStoragePriceId('');
            setStripeTranscriptionPriceId('');
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
                stripeStoragePriceId,
                stripeTranscriptionPriceId,
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
            <Modal.Backdrop className="bg-background/80 backdrop-blur-sm">
                <Modal.Container>
                    <Modal.Dialog className="w-full max-w-2xl bg-card p-6 rounded-xl shadow-xl border border-default-200">
                        <Modal.Header>
                            <h2 className="text-xl font-bold">{planToEdit ? 'Edit Plan' : 'Create New Plan'}</h2>
                        </Modal.Header>
                        <Modal.Body>
                            <div className="grid grid-cols-1 md:grid-cols-2 gap-5 py-4">
                                <div className="flex flex-col gap-2">
                                    <Label className="text-sm font-medium">Plan Name</Label>
                                    <Input
                                        placeholder="e.g. Enterprise"
                                        value={name}
                                        onChange={(e) => setName(e.target.value)}
                                        className="w-full"
                                    />
                                </div>

                                <div className="flex flex-col gap-2">
                                    <Label className="text-sm font-medium">Stripe Price ID (Base)</Label>
                                    <Input
                                        placeholder="price_H5ggY..."
                                        value={stripePriceId}
                                        onChange={(e) => setStripePriceId(e.target.value)}
                                        className="w-full"
                                    />
                                </div>

                                <div className="flex flex-col gap-2">
                                    <Label className="text-sm font-medium">Stripe Storage Price ID (Metered)</Label>
                                    <Input
                                        placeholder="price_..."
                                        value={stripeStoragePriceId}
                                        onChange={(e) => setStripeStoragePriceId(e.target.value)}
                                        className="w-full"
                                    />
                                </div>

                                <div className="flex flex-col gap-2">
                                    <Label className="text-sm font-medium">Stripe Transcription Price ID (Metered)</Label>
                                    <Input
                                        placeholder="price_..."
                                        value={stripeTranscriptionPriceId}
                                        onChange={(e) => setStripeTranscriptionPriceId(e.target.value)}
                                        className="w-full"
                                    />
                                </div>

                                <div className="flex flex-col gap-2">
                                    <Label className="text-sm font-medium">Price (USD)</Label>
                                    <Input
                                        type="number"
                                        placeholder="0.00"
                                        value={price}
                                        onChange={(e) => setPrice(e.target.value)}
                                        className="w-full"
                                    />
                                </div>

                                <div className="md:col-span-2 flex flex-col gap-2">
                                    <Label className="text-sm font-medium">Description</Label>
                                    <Input
                                        placeholder="Short description for the pricing table"
                                        value={description}
                                        onChange={(e) => setDescription(e.target.value)}
                                        className="w-full"
                                    />
                                </div>

                                <div className="flex flex-col gap-2">
                                    <Label className="text-sm font-medium">Billing Interval</Label>
                                    <Select
                                        selectedKey={interval}
                                        onSelectionChange={(key) => setInterval(key as 'monthly' | 'yearly' | 'lifetime')}
                                    >
                                        <Select.Trigger className="w-full">
                                            <Select.Value />
                                            <Select.Indicator />
                                        </Select.Trigger>
                                        <Select.Popover>
                                            <ListBox>
                                                {INTERVALS.map((item) => (
                                                    <ListBox.Item key={item.value} id={item.value} textValue={item.label}>
                                                        {item.label}
                                                    </ListBox.Item>
                                                ))}
                                            </ListBox>
                                        </Select.Popover>
                                    </Select>
                                </div>

                                <div className="flex flex-col gap-2">
                                    <Label className="text-sm font-medium">Status & Visibility</Label>
                                    <div className="flex flex-col gap-2 pt-2">
                                        <Checkbox isSelected={isActive} onChange={() => setIsActive(!isActive)}>
                                            Active (Visible)
                                        </Checkbox>
                                        <Checkbox isSelected={isDefault} onChange={() => setIsDefault(!isDefault)}>
                                            Default Plan for New Users
                                        </Checkbox>
                                    </div>
                                </div>

                                <div className="md:col-span-2 flex items-center gap-2 mt-4 font-bold text-sm text-default-500">
                                    <div className="h-px flex-1 bg-default-200"></div>
                                    <span>Limits</span>
                                    <div className="h-px flex-1 bg-default-200"></div>
                                </div>

                                <div className="flex flex-col gap-2">
                                    <Label className="text-sm font-medium">Storage (GB)</Label>
                                    <Input
                                        type="number"
                                        value={storageGB}
                                        onChange={(e) => setStorageGB(e.target.value)}
                                        className="w-full"
                                    />
                                </div>

                                <div className="flex flex-col gap-2">
                                    <Label className="text-sm font-medium">Transcription (Min)</Label>
                                    <Input
                                        type="number"
                                        value={transcriptionMinutes}
                                        onChange={(e) => setTranscriptionMinutes(e.target.value)}
                                        className="w-full"
                                    />
                                </div>

                                <div className="md:col-span-2 flex flex-col gap-2">
                                    <Label className="text-sm font-medium">Features (One per line)</Label>
                                    <TextArea
                                        placeholder="Feature 1&#10;Feature 2&#10;Feature 3"
                                        value={featuresInput}
                                        onChange={(e) => setFeaturesInput(e.target.value)}
                                        className="w-full"
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
