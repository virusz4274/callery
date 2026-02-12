import { Card, Select, Label, ListBox } from '@heroui/react';
import type { User } from '@/lib/types';

interface UsageStorageProps {
    userProfile: User | null;
    deletionPolicy: string;
    onPolicyChange: (policy: string) => void;
}

export function UsageStorageCard({
    userProfile,
    deletionPolicy,
    onPolicyChange
}: UsageStorageProps) {
    const storageUsed = userProfile?.storageUsed || 0;
    const storageAllocation = userProfile?.storageAllocation || 1; // Prevent div by zero
    const storagePercentage = (storageUsed / storageAllocation) * 100;

    // Unit Conversion: Used is in seconds, Allocation is in minutes.
    const transcriptionUsedSeconds = userProfile?.transcriptionUsed || 0;
    const transcriptionUsedMinutes = transcriptionUsedSeconds / 60;
    const transcriptionAllocationSeconds = userProfile?.transcriptionAllocation || 3600; // Default 60 mins (3600s)
    const transcriptionAllocationMinutes = transcriptionAllocationSeconds / 60;

    const transcriptionPercentage = (transcriptionUsedMinutes / transcriptionAllocationMinutes) * 100;

    return (
        <Card className="bg-card/70 border-default-200">
            <Card.Content className="space-y-6">
                {/* Transcription Usage */}
                <div>
                    <h4 className="font-medium mb-2">Transcription Usage</h4>
                    <p className="text-sm text-default-500 mb-2">
                        You have used {transcriptionUsedMinutes.toFixed(1)} minutes of {transcriptionAllocationMinutes} minutes.
                    </p>
                    {/* Custom Progress Bar */}
                    <div className="h-2 w-full bg-default-100 rounded-full overflow-hidden">
                        <div
                            className={`h-full transition-all duration-500 ${transcriptionPercentage > 90 ? "bg-danger" : "bg-primary"}`}
                            style={{ width: `${Math.min(transcriptionPercentage, 100)}%` }}
                        />
                    </div>
                </div>

                <div>
                    <h4 className="font-medium mb-2">Storage Usage</h4>
                    <p className="text-sm text-default-500 mb-2">
                        You are currently using {((storageUsed) / (1024 * 1024 * 1024)).toFixed(2)} GB of {((storageAllocation) / (1024 * 1024 * 1024)).toFixed(0)} GB.
                    </p>
                    {/* Custom Progress Bar */}
                    <div className="h-2 w-full bg-default-100 rounded-full overflow-hidden">
                        <div
                            className={`h-full transition-all duration-500 ${storagePercentage > 90 ? "bg-danger" : "bg-primary"}`}
                            style={{ width: `${Math.min(storagePercentage, 100)}%` }}
                        />
                    </div>
                </div>
                <div className="w-full max-w-sm">
                    <Select
                        placeholder="Select a policy"
                        selectedKey={deletionPolicy}
                        onSelectionChange={(key) => {
                            if (key) {
                                onPolicyChange(key as string);
                            }
                        }}
                    >
                        <Label>Automatic Deletion Policy</Label>
                        <Select.Trigger>
                            <Select.Value />
                            <Select.Indicator />
                        </Select.Trigger>
                        <Select.Popover>
                            <ListBox>
                                <ListBox.Item key="never" id="never" textValue="Never">Never</ListBox.Item>
                                <ListBox.Item key="3m" id="3m" textValue="3 Months">3 Months</ListBox.Item>
                                <ListBox.Item key="6m" id="6m" textValue="6 Months">6 Months</ListBox.Item>
                                <ListBox.Item key="1y" id="1y" textValue="1 Year">1 Year</ListBox.Item>
                            </ListBox>
                        </Select.Popover>
                    </Select>
                    <p className="text-xs text-default-500 mt-1">Automatically delete old recordings to manage storage space.</p>
                </div>
            </Card.Content>
            {/* Save handled by parent */}
        </Card>
    );
}
