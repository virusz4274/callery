
"use client";

import React, { useState } from 'react';
import type { Contact } from '@/lib/types';
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
  DialogFooter,
} from '@/components/ui/dialog';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import { Button } from '@/components/ui/button';
import { Label } from '@/components/ui/label';
import { useToast } from '@/hooks/use-toast';

type ManagePlanDialogProps = {
  user: Contact;
  isOpen: boolean;
  onClose: () => void;
};

export function ManagePlanDialog({ user, isOpen, onClose }: ManagePlanDialogProps) {
  const [selectedPlan, setSelectedPlan] = useState(user.plan);
  const { toast } = useToast();

  const handleSaveChanges = () => {
    // In a real app, you would make an API call to update the user's plan
    console.log(`Changing ${user.name}'s plan to ${selectedPlan}`);
    
    toast({
      title: 'Plan Updated',
      description: `${user.name}'s plan has been successfully changed to ${selectedPlan}.`,
    });
    onClose();
  };

  return (
    <Dialog open={isOpen} onOpenChange={(open) => !open && onClose()}>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>Manage Plan for {user.name}</DialogTitle>
          <DialogDescription>
            Select a new subscription plan for this user. The change will take effect immediately.
          </DialogDescription>
        </DialogHeader>
        <div className="py-4">
          <div className="grid gap-4">
            <div className="grid gap-2">
              <Label htmlFor="plan-select">Subscription Plan</Label>
              <Select value={selectedPlan} onValueChange={(value: 'Free' | 'Pro') => setSelectedPlan(value)}>
                <SelectTrigger id="plan-select">
                  <SelectValue placeholder="Select a plan" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="Free">Free</SelectItem>
                  <SelectItem value="Pro">Pro</SelectItem>
                </SelectContent>
              </Select>
            </div>
          </div>
        </div>
        <DialogFooter>
          <Button variant="outline" onClick={onClose}>
            Cancel
          </Button>
          <Button onClick={handleSaveChanges}>
            Save Changes
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
