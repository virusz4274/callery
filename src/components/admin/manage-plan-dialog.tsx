
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
import { Input } from '@/components/ui/input';
import { useToast } from '@/hooks/use-toast';

type ManagePlanDialogProps = {
  user: Contact;
  isOpen: boolean;
  onClose: () => void;
};

export function ManagePlanDialog({ user, isOpen, onClose }: ManagePlanDialogProps) {
  const [selectedPlan, setSelectedPlan] = useState(user.plan);
  const [storageAllocation, setStorageAllocation] = useState(user.storageAllocation.toString());
  const [transcriptionAllocation, setTranscriptionAllocation] = useState(user.transcriptionAllocation.toString());
  const { toast } = useToast();

  const handleSaveChanges = () => {
    // In a real app, you would make an API call to update the user's plan and allocations
    console.log(`Changing ${user.name}'s plan to ${selectedPlan}`);
    console.log(`Setting storage allocation to ${storageAllocation} GB`);
    console.log(`Setting transcription allocation to ${transcriptionAllocation} minutes`);
    
    toast({
      title: 'User Updated',
      description: `${user.name}'s plan and allocations have been successfully updated.`,
    });
    onClose();
  };

  return (
    <Dialog open={isOpen} onOpenChange={(open) => !open && onClose()}>
      <DialogContent className="sm:max-w-[480px]">
        <DialogHeader>
          <DialogTitle>Manage Plan for {user.name}</DialogTitle>
          <DialogDescription>
            Update the subscription plan and manually set resource allocations for this user.
          </DialogDescription>
        </DialogHeader>
        <div className="py-4 space-y-4">
            <div className="grid grid-cols-4 items-center gap-4">
              <Label htmlFor="plan-select" className="text-right">Plan</Label>
              <Select value={selectedPlan} onValueChange={(value: 'Free' | 'Pro') => setSelectedPlan(value)}>
                <SelectTrigger id="plan-select" className="col-span-3">
                  <SelectValue placeholder="Select a plan" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="Free">Free</SelectItem>
                  <SelectItem value="Pro">Pro</SelectItem>
                </SelectContent>
              </Select>
            </div>
             <div className="grid grid-cols-4 items-center gap-4">
              <Label htmlFor="storage-allocation" className="text-right">Storage (GB)</Label>
              <Input 
                id="storage-allocation" 
                type="number"
                value={storageAllocation}
                onChange={(e) => setStorageAllocation(e.target.value)}
                className="col-span-3" 
              />
            </div>
            <div className="grid grid-cols-4 items-center gap-4">
              <Label htmlFor="transcription-allocation" className="text-right">Transcription (min)</Label>
              <Input
                id="transcription-allocation"
                type="number"
                value={transcriptionAllocation}
                onChange={(e) => setTranscriptionAllocation(e.target.value)}
                className="col-span-3"
              />
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
