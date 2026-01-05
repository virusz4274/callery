
"use client";

import React from 'react';
import type { Contact, CallRecording } from '@/lib/types';
import { Card } from '@heroui/react';
import { Users, Phone, HardDrive, BarChart } from 'lucide-react';
import { UserManagementTable } from '@/components/admin/user-management-table';

type AdminDashboardProps = {
    allUsers: Contact[];
    allRecordings: CallRecording[];
};

export function AdminDashboard({ allUsers, allRecordings }: AdminDashboardProps) {

    const totalStorageUsed = allUsers.reduce((acc, user) => acc + user.storageUsed, 0);
    const totalUsers = allUsers.length;
    const totalRecordings = allRecordings.length;
    const avgCallDuration = totalRecordings > 0 ? Math.round(allRecordings.reduce((acc, r) => acc + r.duration, 0) / totalRecordings) : 0;

    return (
        <div className="space-y-6">
            <div>
                <h1 className="text-3xl font-bold tracking-tight">Admin Dashboard</h1>
                <p className="text-default-500">System-wide overview and statistics.</p>
            </div>

            <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
                <Card>
                    <Card.Header className="flex flex-row items-center justify-between pb-2">
                        <h4 className="text-sm font-medium">Total Users</h4>
                        <Users className="h-4 w-4 text-default-500" />
                    </Card.Header>
                    <Card.Content>
                        <div className="text-2xl font-bold">{totalUsers}</div>
                        <p className="text-xs text-default-500">Active users in the system</p>
                    </Card.Content>
                </Card>
                <Card>
                    <Card.Header className="flex flex-row items-center justify-between pb-2">
                        <h4 className="text-sm font-medium">Total Recordings</h4>
                        <Phone className="h-4 w-4 text-default-500" />
                    </Card.Header>
                    <Card.Content>
                        <div className="text-2xl font-bold">{totalRecordings}</div>
                        <p className="text-xs text-default-500">Across all users</p>
                    </Card.Content>
                </Card>
                <Card>
                    <Card.Header className="flex flex-row items-center justify-between pb-2">
                        <h4 className="text-sm font-medium">Total Storage Used</h4>
                        <HardDrive className="h-4 w-4 text-default-500" />
                    </Card.Header>
                    <Card.Content>
                        <div className="text-2xl font-bold">{totalStorageUsed.toFixed(2)} GB</div>
                        <p className="text-xs text-default-500">Total cloud storage consumed</p>
                    </Card.Content>
                </Card>
                <Card>
                    <Card.Header className="flex flex-row items-center justify-between pb-2">
                        <h4 className="text-sm font-medium">Avg. Call Duration</h4>
                        <BarChart className="h-4 w-4 text-default-500" />
                    </Card.Header>
                    <Card.Content>
                        <div className="text-2xl font-bold">{Math.floor(avgCallDuration / 60)}m {avgCallDuration % 60}s</div>
                        <p className="text-xs text-default-500">Average across all recordings</p>
                    </Card.Content>
                </Card>
            </div>

            <UserManagementTable allUsers={allUsers} />
        </div>
    );
}
