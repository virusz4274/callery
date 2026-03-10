import React from 'react';
import { Card, Chip } from '@heroui/react';
import { ClientFormattedDate } from '@/components/client-formatted-date';
import type { User } from '@/lib/types';
import { SimpleProgress } from './simple-progress';

type UserInfoPanelProps = {
    user: User;
};

export function UserInfoPanel({ user }: UserInfoPanelProps) {
    return (
        <Card>
            <Card.Header>
                <h3 className="text-xl font-bold">Plan & Usage</h3>
            </Card.Header>
            <Card.Content className="space-y-6">
                <div className="flex justify-between items-center">
                    <span className="font-semibold">Current Plan:</span>
                    <div>
                        <Chip>{user.plan}</Chip>
                    </div>
                </div>
                <div className="flex justify-between items-center border-b border-default-100 pb-4">
                    <span className="font-semibold text-small">Last Logged In:</span>
                    <span className="text-small text-default-500">
                        {user.lastLoginAt ? <ClientFormattedDate date={user.lastLoginAt} formatString="PPp" /> : 'Never'}
                    </span>
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
