import { Card, Chip, Surface } from '@heroui/react';
import { ClientFormattedDate } from '@/components/client-formatted-date';
import type { User } from '@/lib/types';
import { quotaPercent } from '@/lib/admin-validation';
import { SimpleProgress } from './simple-progress';

type UserInfoPanelProps = {
    user: User;
    teamMode?: boolean;
};

export function UserInfoPanel({ user, teamMode = false }: UserInfoPanelProps) {
    if (teamMode) return <Card className="space-y-3 p-6"><h3 className="text-xl font-semibold">Employee usage</h3>
        <p>{(user.storageUsed / 1024 ** 3).toFixed(2)} GB audio stored · {user.totalRecordings} recordings</p>
        <p className="text-sm text-muted">Usage is informational. Removing access keeps the company archive.</p>
        <p className="text-sm text-muted">Last login: {user.lastLoginAt ? <ClientFormattedDate date={user.lastLoginAt} formatString="PPp" /> : 'Never'}</p>
    </Card>;
    return (
        <Card>
            <Card.Header className="border-b border-border px-6 py-5">
                <div>
                    <h3 className="text-xl font-semibold text-foreground">Plan and usage</h3>
                    <p className="mt-1 text-sm text-muted">Subscription assignment, recent access, and quota utilization.</p>
                </div>
            </Card.Header>
            <Card.Content className="space-y-6 p-6">
                <div className="grid gap-3 md:grid-cols-2">
                    <Surface variant="secondary" className="p-4">
                        <div className="text-xs font-semibold uppercase text-muted">Current plan</div>
                        <div className="mt-2">
                            <Chip>{user.planName}</Chip>
                        </div>
                    </Surface>
                    <Surface variant="secondary" className="p-4">
                        <div className="text-xs font-semibold uppercase text-muted">Last login</div>
                        <div className="mt-2 text-sm text-muted">
                            {user.lastLoginAt ? <ClientFormattedDate date={user.lastLoginAt} formatString="PPp" /> : 'Never'}
                        </div>
                    </Surface>
                </div>
                <div>
                    <div className="mb-1 flex flex-wrap justify-between gap-2">
                        <span className="text-small">Storage Usage</span>
                        <span className="text-small text-muted">
                            {(user.storageUsed / 1024 ** 3).toFixed(2)} / {(user.storageAllocation / 1024 ** 3).toFixed(2)} GB
                        </span>
                    </div>
                    <SimpleProgress label="Storage usage" value={quotaPercent(user.storageUsed, user.storageAllocation)} />
                </div>
                <div>
                    <div className="mb-1 flex flex-wrap justify-between gap-2">
                        <span className="text-small">Transcription Usage</span>
                        <span className="text-small text-muted">
                            {(user.transcriptionUsed / 60).toFixed(1)} / {Number((user.transcriptionAllocation / 60).toFixed(2))} min
                        </span>
                    </div>
                    <SimpleProgress label="Transcription usage" value={quotaPercent(user.transcriptionUsed, user.transcriptionAllocation)} />
                </div>
            </Card.Content>
        </Card>
    );
}
