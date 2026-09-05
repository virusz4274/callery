
"use client";

import { useToast } from '@/components/toast-provider';

import { useState } from 'react';
import {
  Modal,
  Button,
  Chip,
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

  const handleSave = async () => {
    setLoading(true);
    try {
      await updateContactPlan(user.id, selectedPlanKey);
      // Refresh to show updated plan in table
      router.refresh();
      toast({ title: 'Success', description: 'Plan updated successfully', status: 'success' });
      onClose();
    } catch {
      toast({ title: 'Error', description: 'Failed to update plan', status: 'danger' });
    } finally {
      setLoading(false);
    }
  };

  // Find the selected plan object to display its limits
  const selectedPlanDetails = plans.find((plan) => plan.key === selectedPlanKey);

  // Display values (default to user's current if plan not found/selected)
  // Convert bytes to GB and seconds to minutes for display
  const displayStorage = selectedPlanDetails
    ? Math.floor(selectedPlanDetails.limits.storage / (1024 * 1024 * 1024))
    : Math.floor(user.storageAllocation / (1024 * 1024 * 1024));

  const displayTranscription = selectedPlanDetails
    ? Math.floor(selectedPlanDetails.limits.transcription / 60)
    : Math.floor(user.transcriptionAllocation / 60);

  return (
    <Modal isOpen={isOpen} onOpenChange={(open) => !open && onClose()}>
      <Button className="hidden" aria-hidden="true" />
      <Modal.Backdrop>
        <Modal.Container>
          <Modal.Dialog className="w-full max-w-xl rounded-[2rem] border border-default-200/80 bg-background p-0 shadow-[0_30px_80px_-48px_rgba(15,23,42,0.55)]">
            <Modal.CloseTrigger />
            <Modal.Header className="border-b border-default-100/80 px-6 py-5">
              <div className="space-y-2">
                <div className="flex flex-wrap items-center gap-2">
                  <Chip variant="soft" color="accent">Plan assignment</Chip>
                  <Chip variant="soft" color="default">{user.name}</Chip>
                </div>
                <Modal.Heading className="text-2xl font-bold tracking-[-0.03em] text-foreground">
                  Manage plan
                </Modal.Heading>
                <p className="text-sm leading-6 text-default-500">
                  Choose the subscription tier for this user and preview the default limits that come with it.
                </p>
              </div>
            </Modal.Header>
            <Modal.Body className="px-6 py-5">
              <div className="space-y-5">
                <Select
                  placeholder="Select a plan"
                  selectedKey={selectedPlanKey}
                  onSelectionChange={(key) => setSelectedPlanKey(key as string)}
                >
                  <Label>Plan</Label>
                  <Select.Trigger>
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
                  <Surface variant="secondary" className="rounded-xl border border-default-200/80 p-4">
                    <div className="flex items-start gap-3">
                      <div className="rounded-2xl bg-accent/10 p-2.5 text-accent">
                        <CreditCard className="h-4 w-4" />
                      </div>
                      <div>
                        <div className="text-xs font-semibold uppercase tracking-[0.24em] text-default-400">Storage allocation</div>
                        <div className="mt-2 text-2xl font-bold text-foreground">{displayStorage} GB</div>
                        <p className="mt-1 text-sm text-default-500">Applied automatically from the selected plan.</p>
                      </div>
                    </div>
                  </Surface>
                  <Surface variant="secondary" className="rounded-xl border border-default-200/80 p-4">
                    <div className="flex items-start gap-3">
                      <div className="rounded-2xl bg-success/10 p-2.5 text-success">
                        <ShieldCheck className="h-4 w-4" />
                      </div>
                      <div>
                        <div className="text-xs font-semibold uppercase tracking-[0.24em] text-default-400">Transcription quota</div>
                        <div className="mt-2 text-2xl font-bold text-foreground">{displayTranscription} min</div>
                        <p className="mt-1 text-sm text-default-500">Plan-defined allowance before custom overrides.</p>
                      </div>
                    </div>
                  </Surface>
                </div>
              </div>
            </Modal.Body>
            <Modal.Footer className="border-t border-default-100/80 px-6 py-4">
              <Button variant="ghost" className="rounded-full" onPress={onClose}>Cancel</Button>
              <Button variant="primary" className="rounded-full px-6 font-semibold" onPress={handleSave} isPending={loading}>
                Save Changes
              </Button>
            </Modal.Footer>
          </Modal.Dialog>
        </Modal.Container>
      </Modal.Backdrop>
    </Modal>
  );
}
