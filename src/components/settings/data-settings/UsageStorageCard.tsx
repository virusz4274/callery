import { Card, Label, ListBox, Select } from '@heroui/react';
import { Database, FileAudio2, ShieldEllipsis } from 'lucide-react';
import type { User } from '@/lib/types';

interface UsageStorageProps {
    userProfile: User | null;
    deletionPolicy: string;
    onPolicyChange: (policy: string) => void;
}

function UsageMeter({ label, value, description, percent, icon: Icon }: {
    label: string;
    value: string;
    description: string;
    percent: number;
    icon: typeof FileAudio2;
}) {
    const tone = percent > 90 ? 'bg-danger' : 'bg-primary';

    return (
        <div className="rounded-xl border border-default-200/80 bg-background p-4">
            <div className="flex items-start gap-3">
                <div className="flex h-12 w-12 shrink-0 items-center justify-center rounded-2xl bg-primary/10 text-primary">
                    <Icon className="h-5 w-5" />
                </div>
                <div className="w-full space-y-3">
                    <div className="space-y-1">
                        <p className="text-sm font-semibold text-foreground">{label}</p>
                        <p className="text-sm text-default-500">{description}</p>
                    </div>
                    <div className="flex items-end justify-between gap-3">
                        <p className="text-lg font-semibold tracking-[-0.03em] text-foreground">{value}</p>
                        <p className="text-xs font-medium uppercase tracking-[0.16em] text-default-400">{Math.min(percent, 100).toFixed(0)}% used</p>
                    </div>
                    <div className="h-2.5 overflow-hidden rounded-full bg-default-100">
                        <div className={`h-full rounded-full transition-all duration-500 ${tone}`} style={{ width: `${Math.min(percent, 100)}%` }} />
                    </div>
                </div>
            </div>
        </div>
    );
}

export function UsageStorageCard({
    userProfile,
    deletionPolicy,
    onPolicyChange,
}: UsageStorageProps) {
    const storageUsed = userProfile?.storageUsed || 0;
    const storageAllocation = userProfile?.storageAllocation || 1;
    const storagePercentage = (storageUsed / storageAllocation) * 100;

    const transcriptionUsedSeconds = userProfile?.transcriptionUsed || 0;
    const transcriptionUsedMinutes = transcriptionUsedSeconds / 60;
    const transcriptionAllocationSeconds = userProfile?.transcriptionAllocation || 3600;
    const transcriptionAllocationMinutes = transcriptionAllocationSeconds / 60;
    const transcriptionPercentage = (transcriptionUsedMinutes / transcriptionAllocationMinutes) * 100;

    return (
        <Card className="rounded-2xl border border-border bg-surface shadow-none">
            <Card.Content className="space-y-5 p-5 sm:p-6">

                <div className="grid gap-4 lg:grid-cols-2">
                    <UsageMeter
                        label="Transcription usage"
                        value={`${transcriptionUsedMinutes.toFixed(1)} min / ${transcriptionAllocationMinutes} min`}
                        description="Minutes used this billing cycle."
                        percent={transcriptionPercentage}
                        icon={FileAudio2}
                    />
                    <UsageMeter
                        label="Storage usage"
                        value={`${(storageUsed / (1024 * 1024 * 1024)).toFixed(2)} GB / ${(storageAllocation / (1024 * 1024 * 1024)).toFixed(0)} GB`}
                        description="Cloud storage used across your archive."
                        percent={storagePercentage}
                        icon={Database}
                    />
                </div>

                <div className="rounded-xl border border-default-200/80 bg-default-50/70 p-4 sm:p-5">
                    <div className="flex flex-col gap-4 lg:flex-row lg:items-start lg:justify-between">
                        <div className="flex items-start gap-3">
                            <div className="flex h-12 w-12 shrink-0 items-center justify-center rounded-2xl bg-primary/10 text-primary">
                                <ShieldEllipsis className="h-5 w-5" />
                            </div>
                            <div className="space-y-1">
                                <p className="text-base font-semibold text-foreground">Automatic deletion policy</p>
                                <p className="max-w-2xl text-sm leading-6 text-default-500">
                                    Auto-delete older recordings after a set period.
                                </p>
                            </div>
                        </div>
                        <div className="w-full lg:w-64">
                            <Label className="mb-2 text-sm font-medium">Retention window</Label>
                            <Select
                                aria-label="Automatic deletion policy"
                                placeholder="Select a policy"
                                selectedKey={deletionPolicy}
                                onSelectionChange={(key) => {
                                    if (key) {
                                        onPolicyChange(key as string);
                                    }
                                }}
                            >
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
                        </div>
                    </div>
                </div>
            </Card.Content>
        </Card>
    );
}
