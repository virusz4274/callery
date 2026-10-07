
"use client";

import { useToast } from '@/components/toast-provider';

import { useRef, useState } from 'react';
import {
  Modal,
  Button,
  Select,
  Label,
  ListBox,
  Surface,
} from '@heroui/react';
import { CreditCard, ShieldCheck } from 'lucide-react';
import { PlanResponse } from '@/lib/db/types';
import type { User } from '@/lib/types';
import { updateContactPlan } from '@/app/actions/update-contact-plan';
import { useRouter } from 'next/navigation';

type ManagePlanDialogProps = {
  user: User;
  isOpen: boolean;
  onClose: () => void;
  plans: PlanResponse[];
};

export function ManagePlanDialog({ user, isOpen, onClose, plans }: ManagePlanDialogProps) {
  const router = useRouter();
  const { toast } = useToast();
  const [selectedPlanKey, setSelectedPlanKey] = useState(user.planKey);
  const [loading, setLoading] = useState(false);
  const busy = useRef(false);
  const [error, setError] = useState<string | null>(null);

  const handleSave = async () => {
    if (busy.current) return;
    busy.current = true; setLoading(true); setError(null);
    try {
      const result = await updateContactPlan(user.id, selectedPlanKey);
      if (!result.success) throw new Error(result.message || 'Unable to assign plan.');
      // Refresh to show updated plan in table
      router.refresh();
      toast({ title: 'Plan updated', status: 'success' });
      onClose();
    } catch (error) {
      setError(error instanceof Error ? error.message : 'Please try again.');
      toast({ title: 'Error', description: 'Failed to update plan', status: 'danger' });
    } finally {
      busy.current = false; setLoading(false);
    }
  };

  // Find the selected plan object to display its limits
  const selectedPlanDetails = plans.find((plan) => plan.key === selectedPlanKey);

  // Display values (default to user's current if plan not found/selected)
  // Convert bytes to GB and seconds to minutes for display
  const displayStorage = selectedPlanDetails
    ? Number((selectedPlanDetails.limits.storage / 1024 ** 3).toFixed(2))
    : Number((user.storageAllocation / 1024 ** 3).toFixed(2));

  const displayTranscription = selectedPlanDetails
    ? Number((selectedPlanDetails.limits.transcription / 60).toFixed(2))
    : Number((user.transcriptionAllocation / 60).toFixed(2));

  return (
    <Modal.Backdrop isOpen={isOpen} onOpenChange={(open) => !open && !busy.current && onClose()} isDismissable={!loading}>
        <Modal.Container size="lg" scroll="inside">
          <Modal.Dialog className="w-full max-w-xl p-0">
            <Modal.CloseTrigger className="size-11" isDisabled={loading} aria-label="Close plan assignment" />
            <Modal.Header className="border-b border-border px-5 py-4 pr-16">
              <Modal.Heading className="text-lg font-semibold text-foreground">Manage plan</Modal.Heading>
            </Modal.Header>
            <Modal.Body className="px-5 py-4">
              <div className="space-y-5">
                <p className="break-words font-medium text-foreground">{user.name || user.email}</p>
                <Select
                  placeholder="Select a plan"
                  selectedKey={selectedPlanKey}
                  onSelectionChange={(key) => setSelectedPlanKey(key as string)}
                >
                  <Label>Plan</Label>
                  <Select.Trigger className="min-h-11">
                    <Select.Value />
                    <Select.Indicator />
                  </Select.Trigger>
                  <Select.Popover>
                    <ListBox>
                      {plans.map((plan) => (
                        <ListBox.Item key={plan.key} id={plan.key} textValue={plan.name}>
                          {plan.name} ({plan.price === 0 ? 'Free' : `$${plan.price}`})
                        </ListBox.Item>
                      ))}
                    </ListBox>
                  </Select.Popover>
                </Select>

                <div className="grid gap-3 md:grid-cols-2">
                  <Surface variant="secondary" className="p-4">
                    <div className="flex items-start gap-3">
                      <div className="rounded-2xl bg-accent/10 p-2.5 text-accent">
                        <CreditCard className="h-4 w-4" />
                      </div>
                      <div>
                        <div className="text-xs font-semibold uppercase text-muted">Storage allocation</div>
                        <div className="mt-2 text-2xl font-bold text-foreground">{displayStorage} GB</div>
                        <p className="mt-1 text-sm text-muted">Applied automatically from the selected plan.</p>
                      </div>
                    </div>
                  </Surface>
                  <Surface variant="secondary" className="p-4">
                    <div className="flex items-start gap-3">
                      <div className="rounded-2xl bg-success/10 p-2.5 text-success">
                        <ShieldCheck className="h-4 w-4" />
                      </div>
                      <div>
                        <div className="text-xs font-semibold uppercase text-muted">Transcription quota</div>
                        <div className="mt-2 text-2xl font-bold text-foreground">{displayTranscription} min</div>
                        <p className="mt-1 text-sm text-muted">Plan-defined allowance before custom overrides.</p>
                      </div>
                    </div>
                  </Surface>
                </div>
                {error && <p role="alert" className="text-sm text-danger">{error} Your selection is retained; try saving again.</p>}
              </div>
            </Modal.Body>
            <Modal.Footer className="flex-wrap gap-2 border-t border-border px-5 py-4">
              <Button variant="secondary" className="h-auto min-h-11 min-w-0 flex-1 whitespace-normal py-2" isDisabled={loading} onPress={onClose}>Cancel</Button>
              <Button variant="primary" className="h-auto min-h-11 min-w-0 flex-1 whitespace-normal px-4 py-2" onPress={handleSave} isPending={loading}>
                Save Changes
              </Button>
            </Modal.Footer>
          </Modal.Dialog>
        </Modal.Container>
      </Modal.Backdrop>
  );
}
