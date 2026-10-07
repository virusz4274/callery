'use client';
import { useRef, useState } from 'react';
import { Card, Button, Chip } from '@heroui/react';
import { Plus, Edit, Trash2 } from 'lucide-react';
import type { PlanResponse } from '@/lib/db/types';
import { deletePlan } from '@/app/actions/admin-plans';
import { PlanFormDialog } from './plan-form-dialog';
import { ConfirmActionDialog } from './confirm-action-dialog';
import { useToast } from '@/components/toast-provider';
import { useRouter } from 'next/navigation';
export function PlansList({ initialPlans }: { initialPlans: PlanResponse[] }) {
    const [isFormOpen, setFormOpen] = useState(false);
    const [editingPlan, setEditingPlan] = useState<PlanResponse | null>(null);
    const [deletingPlan, setDeletingPlan] = useState<PlanResponse | null>(null);
    const [pending, setPending] = useState(false);
    const [error, setError] = useState<string | null>(null);
    const busy = useRef(false);
    const router = useRouter();
    const { toast } = useToast();
    const create = () => { setEditingPlan(null); setFormOpen(true); };
    const remove = async () => {
        if (!deletingPlan || busy.current) return;
        busy.current = true; setPending(true); setError(null);
        try { await deletePlan(deletingPlan.id); toast({ title: 'Plan deleted', status: 'success' }); setDeletingPlan(null); router.refresh(); }
        catch (error) { setError(error instanceof Error ? error.message : 'Please try again.'); }
        finally { busy.current = false; setPending(false); }
    };
    return <div className="space-y-5">
        <div className="flex justify-end"><Button className="min-h-11" onPress={create}><Plus className="size-4" />Create plan</Button></div>
        {!initialPlans.length && <Card className="items-center gap-3 py-10 text-center"><h2 className="text-lg font-semibold">No plans yet</h2><p className="text-sm text-muted">Create a plan to define pricing and usage allowances.</p><Button variant="secondary" onPress={create} className="min-h-11">Create your first plan</Button></Card>}
        <div className="grid min-w-0 gap-4 sm:grid-cols-2 2xl:grid-cols-3">
            {initialPlans.map(plan => <Card key={plan.id} variant={plan.isDefault ? 'secondary' : 'default'} className="min-w-0 gap-4 p-5">
                <div className="flex flex-wrap items-start justify-between gap-3">
                    <div className="min-w-0 flex-1"><h2 className="break-words text-lg font-semibold">{plan.name}</h2><div className="mt-2 flex flex-wrap gap-2">{plan.isDefault && <Chip size="sm" color="accent" variant="soft">Default</Chip>}{!plan.isActive && <Chip size="sm" variant="soft">Inactive</Chip>}</div></div>
                    <div className="break-words text-right"><p className="text-xl font-semibold">{plan.price === 0 ? 'Free' : new Intl.NumberFormat('en-US', { style: 'currency', currency: plan.currency }).format(plan.price)}</p><p className="text-xs text-muted">{plan.interval === 'lifetime' ? 'One-time' : `/${plan.interval}`}</p></div>
                </div>
                <p className="break-words text-sm text-muted">{plan.description || 'No description'}</p>
                <dl className="space-y-2 text-sm"><div className="flex flex-wrap justify-between gap-2 border-b border-border pb-2"><dt>Storage</dt><dd>{Number((plan.limits.storage / 1024 ** 3).toFixed(2))} GB</dd></div><div className="flex flex-wrap justify-between gap-2 border-b border-border pb-2"><dt>Transcription</dt><dd>{Number((plan.limits.transcription / 60).toFixed(2))} min</dd></div></dl>
                <div className="mt-auto space-y-2"><div className="flex gap-2"><Button aria-label={`Edit ${plan.name}`} variant="secondary" className="min-h-11 flex-1" onPress={() => { setEditingPlan(plan); setFormOpen(true); }}><Edit className="size-4" />Edit</Button><Button aria-label={`Delete ${plan.name}`} aria-describedby={plan.isDefault ? `default-${plan.id}` : undefined} variant="danger-soft" isIconOnly className="size-11" isDisabled={plan.isDefault || pending} onPress={() => { setError(null); setDeletingPlan(plan); }}><Trash2 className="size-4" /></Button></div>{plan.isDefault && <p id={`default-${plan.id}`} className="text-xs text-muted">The default plan cannot be deleted.</p>}</div>
            </Card>)}
        </div>
        <PlanFormDialog isOpen={isFormOpen} onClose={() => setFormOpen(false)} planToEdit={editingPlan} />
        {deletingPlan && <ConfirmActionDialog title={`Delete ${deletingPlan.name}?`} description="Delete this pricing plan. Existing users assigned to this plan will not be updated." label="Delete plan" pending={pending} error={error} onConfirm={() => void remove()} onClose={() => setDeletingPlan(null)} />}
    </div>;
}
