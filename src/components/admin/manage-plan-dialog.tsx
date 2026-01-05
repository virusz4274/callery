
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
import type { Contact } from '@/lib/types';
import { updateContactPlan } from '@/app/actions/update-contact-plan';

type ManagePlanDialogProps = {
  user: Contact;
  isOpen: boolean;
  onClose: () => void;
};

const PLANS = [
  { value: 'Free', label: 'Free' },
  { value: 'Pro', label: 'Pro' },
  { value: 'Business', label: 'Business' },
  { value: 'Enterprise', label: 'Enterprise' },
];

export function ManagePlanDialog({ user, isOpen, onClose }: ManagePlanDialogProps) {
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
    } catch (error) {
      toast({ title: 'Error', description: 'Failed to update plan', status: 'danger' });
    } finally {
      setLoading(false);
    }
  };

  return (
    <Modal isOpen={isOpen} onOpenChange={(open) => !open && onClose()}>
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
                  onSelectionChange={(key) => setSelectedPlan(key as any)}
                >
                  <Label>Plan</Label>
                  <Select.Trigger>
                    <Select.Value />
                    <Select.Indicator />
                  </Select.Trigger>
                  <Select.Popover>
                    <ListBox>
                      {PLANS.map((plan) => (
                        <ListBox.Item key={plan.value} id={plan.value} textValue={plan.label}>
                          {plan.label}
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
                      defaultValue={String(user.storageAllocation)}
                      readOnly
                      disabled
                      className="bg-default-100"
                    />
                  </div>
                  <div className="space-y-2">
                    <Label>Transcription (min)</Label>
                    <Input
                      type="number"
                      defaultValue={String(user.transcriptionAllocation)}
                      readOnly
                      disabled
                      className="bg-default-100"
                    />
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
