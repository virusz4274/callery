'use client';

import React, { useState } from 'react';
import { Card, Button, Chip, Spinner } from '@heroui/react';
import { Plus, Edit, Trash2 } from 'lucide-react';
import { PlanResponse } from '@/lib/db/types';
import { deletePlan } from '@/app/actions/admin-plans';
import { PlanFormDialog } from '@/components/admin/plan-form-dialog';
import { useRouter } from 'next/navigation';

type PlansListProps = {
    initialPlans: PlanResponse[];
};

export function PlansList({ initialPlans }: PlansListProps) {

    const [isFormOpen, setIsFormOpen] = useState(false);
    const [editingPlan, setEditingPlan] = useState<PlanResponse | null>(null);
    const [isDeleting, setIsDeleting] = useState<string | null>(null);
    const router = useRouter();

    const handleCreate = () => {
        setEditingPlan(null);
        setIsFormOpen(true);
    };

    const handleEdit = (plan: PlanResponse) => {
        setEditingPlan(plan);
        setIsFormOpen(true);
    };

    const handleDelete = async (id: string) => {
        if (!confirm('Are you sure you want to delete this plan? This will NOT update existing users on this plan.')) {
            return;
        }
        setIsDeleting(id);
        await deletePlan(id);
        router.refresh();
        setIsDeleting(null);
    };

    const formatCurrency = (amount: number, currency: string) => {
        return new Intl.NumberFormat('en-US', { style: 'currency', currency }).format(amount);
    };

    return (
        <div className="space-y-6">
            <div className="flex justify-between items-center">
                <div>
                    <h1 className="text-2xl font-bold">Pricing Plans</h1>
                    <p className="text-default-500">Manage subscription tiers and limits.</p>
                </div>
                <Button
                    onPress={handleCreate}
                    className="gap-2 bg-primary text-white"
                >
                    <Plus className="h-4 w-4" />
                    Create Plan
                </Button>
            </div>

            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
                {initialPlans.map((plan) => (
                    <Card key={plan.id} className={`p-6 border-2 ${plan.isDefault ? 'border-primary' : 'border-transparent'}`}>
                        <div className="flex justify-between items-start mb-4">
                            <div>
                                <h3 className="text-xl font-bold">{plan.name}</h3>
                                {plan.isDefault && (
                                    <Chip size="sm" className="mt-1 bg-primary text-white">Default</Chip>
                                )}
                                {!plan.isActive && (
                                    <Chip size="sm" className="mt-1 ml-2 bg-default-200">Inactive</Chip>
                                )}
                            </div>
                            <div className="text-right">
                                <div className="text-2xl font-bold">
                                    {plan.price === 0 ? 'Free' : formatCurrency(plan.price, plan.currency)}
                                </div>
                                <div className="text-xs text-default-500">/{plan.interval}</div>
                            </div>
                        </div>

                        <p className="text-default-500 text-sm mb-6 min-h-[40px]">
                            {plan.description || 'No description'}
                        </p>

                        <div className="space-y-2 mb-6 text-sm">
                            <div className="flex justify-between border-b border-default-100 pb-2">
                                <span>Storage</span>
                                <span className="font-semibold">{(plan.limits.storage / (1024 ** 3)).toFixed(0)} GB</span>
                            </div>
                            <div className="flex justify-between border-b border-default-100 pb-2">
                                <span>Transcription</span>
                                <span className="font-semibold">{(plan.limits.transcription / 60).toFixed(0)} Mins</span>
                            </div>
                        </div>

                        <div className="flex gap-2 mt-auto pt-4">
                            <Button
                                size="sm"
                                variant="ghost"
                                onPress={() => handleEdit(plan)}
                                className="flex-1 gap-2"
                            >
                                <Edit className="h-4 w-4" />
                                Edit
                            </Button>
                            <Button
                                size="sm"
                                variant="ghost"
                                isDisabled={plan.isDefault || isDeleting === plan.id}
                                onPress={() => handleDelete(plan.id)}
                                isIconOnly
                                className="text-danger"
                            >
                                {isDeleting === plan.id ? <Spinner size="sm" /> : <Trash2 className="h-4 w-4" />}
                            </Button>
                        </div>
                    </Card>
                ))}
            </div>

            <PlanFormDialog
                isOpen={isFormOpen}
                onClose={() => setIsFormOpen(false)}
                planToEdit={editingPlan}
            />
        </div>
    );
}
