import { Card, Chip, Surface } from '@heroui/react';
import { ClientFormattedDate } from '@/components/client-formatted-date';
import type { User } from '@/lib/types';
import { SimpleProgress } from './simple-progress';

type UserInfoPanelProps = {
    user: User;
};

export function UserInfoPanel({ user }: UserInfoPanelProps) {
    return (
        <Card className="rounded-[2rem] border border-default-200/80 bg-background/95 shadow-[0_20px_54px_-44px_rgba(15,23,42,0.45)]">
            <Card.Header className="border-b border-default-100/70 px-6 py-5">
                <div>
                    <h3 className="text-xl font-semibold tracking-[-0.03em] text-foreground">Plan and usage</h3>
                    <p className="mt-1 text-sm text-default-500">Subscription assignment, recent access, and quota utilization.</p>
                </div>
            </Card.Header>
            <Card.Content className="space-y-6 p-6">
                <div className="grid gap-3 md:grid-cols-2">
                    <Surface variant="secondary" className="rounded-xl border border-default-200/80 p-4">
                        <div className="text-xs font-semibold uppercase tracking-[0.24em] text-default-400">Current plan</div>
                        <div className="mt-2">
                            <Chip>{user.planName}</Chip>
                        </div>
                    </Surface>
                    <Surface variant="secondary" className="rounded-xl border border-default-200/80 p-4">
                        <div className="text-xs font-semibold uppercase tracking-[0.24em] text-default-400">Last login</div>
                        <div className="mt-2 text-sm text-default-600">
                            {user.lastLoginAt ? <ClientFormattedDate date={user.lastLoginAt} formatString="PPp" /> : 'Never'}
                        </div>
                    </Surface>
                </div>
                <div className="flex justify-between items-center">
                    <span className="font-semibold">Current plan:</span>
                    <div>
                        <Chip>{user.planName}</Chip>
                    </div>
                </div>
                <div>
                    <div className="flex justify-between mb-1">
                        <span className="text-small">Storage Usage</span>
                        <span className="text-small text-default-500">
                            {user.storageUsed.toFixed(2)} / {user.storageAllocation} GB
                        </span>
                    </div>
                    <SimpleProgress value={(user.storageUsed / user.storageAllocation) * 100} />
                </div>
                <div>
                    <div className="flex justify-between mb-1">
                        <span className="text-small">Transcription Usage</span>
                        <span className="text-small text-default-500">
                            {(user.transcriptionUsed / 60).toFixed(1)} / {(user.transcriptionAllocation / 60).toFixed(0)} min
                        </span>
                    </div>
                    <SimpleProgress value={(user.transcriptionUsed / user.transcriptionAllocation) * 100} />
                </div>
            </Card.Content>
        </Card>
    );
}
