
"use client";

import { useToast } from '@/components/toast-provider';

import React, { useState } from 'react';
import {
  Modal,
  Button,
  Select,
  Input,
  Label,
  ListBox
} from '@heroui/react';
import { PlanResponse } from '@/lib/db/types';
import type { User } from '@/lib/types';
import { updateContactPlan } from '@/app/actions/update-contact-plan';

type ManagePlanDialogProps = {
  user: User;
  isOpen: boolean;
  onClose: () => void;
  plans: PlanResponse[];
};

export function ManagePlanDialog({ user, isOpen, onClose, plans }: ManagePlanDialogProps) {
  const { toast } = useToast();
  const [selectedPlan, setSelectedPlan] = useState(user.plan);
  const [loading, setLoading] = useState(false);

  const handleSave = async () => {
    setLoading(true);
    try {
      await updateContactPlan(user.id, selectedPlan);
      onClose();
      // In a real app, you'd trigger a refresh or update UI state
      window.location.reload();
    } catch {
      toast({ title: 'Error', description: 'Failed to update plan', status: 'danger' });
    } finally {
      setLoading(false);
    }
  };

  // Find the selected plan object to display its limits
  const selectedPlanDetails = plans.find(p => p.name === selectedPlan);

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
          <Modal.Dialog>
            <Modal.CloseTrigger />
            <Modal.Header>
              <Modal.Heading>Manage Plan for {user.name}</Modal.Heading>
            </Modal.Header>
            <Modal.Body>
              <div className="space-y-4 py-4">
                <Select
                  placeholder="Select a plan"
                  selectedKey={selectedPlan}
                  onSelectionChange={(key) => setSelectedPlan(key as string)}
                >
                  <Label>Plan</Label>
                  <Select.Trigger>
                    <Select.Value />
                    <Select.Indicator />
                  </Select.Trigger>
                  <Select.Popover>
                    <ListBox>
                      {plans.map((plan) => (
                        <ListBox.Item key={plan.name} id={plan.name} textValue={plan.name}>
                          {plan.name} ({plan.price === 0 ? 'Free' : `$${plan.price}`})
                        </ListBox.Item>
                      ))}
                    </ListBox>
                  </Select.Popover>
                </Select>

                <div className="grid grid-cols-2 gap-4">
                  <div className="space-y-2">
                    <Label>Storage Allocation (GB)</Label>
                    <Input
                      type="number"
                      value={String(displayStorage)}
                      readOnly
                      disabled
                      className="bg-default-100"
                    />
                    <p className="text-xs text-default-400">Defined by Plan</p>
                  </div>
                  <div className="space-y-2">
                    <Label>Transcription (min)</Label>
                    <Input
                      type="number"
                      value={String(displayTranscription)}
                      readOnly
                      disabled
                      className="bg-default-100"
                    />
                    <p className="text-xs text-default-400">Defined by Plan</p>
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
