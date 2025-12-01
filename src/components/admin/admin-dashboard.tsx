
"use client";

import React from 'react';
import type { Contact, CallRecording } from '@/lib/types';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Users, Phone, HardDrive, BarChart } from 'lucide-react';
import { UserManagementTable } from './user-management-table';

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
                <p className="text-muted-foreground">System-wide overview and statistics.</p>
            </div>
            
            <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
                 <Card>
                    <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
                        <CardTitle className="text-sm font-medium">Total Users</CardTitle>
                        <Users className="h-4 w-4 text-muted-foreground" />
                    </CardHeader>
                    <CardContent>
                        <div className="text-2xl font-bold">{totalUsers}</div>
                        <p className="text-xs text-muted-foreground">Active users in the system</p>
                    </CardContent>
                </Card>
                <Card>
                    <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
                        <CardTitle className="text-sm font-medium">Total Recordings</CardTitle>
                        <Phone className="h-4 w-4 text-muted-foreground" />
                    </CardHeader>
                    <CardContent>
                        <div className="text-2xl font-bold">{totalRecordings}</div>
                        <p className="text-xs text-muted-foreground">Across all users</p>
                    </CardContent>
                </Card>
                <Card>
                    <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
                        <CardTitle className="text-sm font-medium">Total Storage Used</CardTitle>
                        <HardDrive className="h-4 w-4 text-muted-foreground" />
                    </CardHeader>
                    <CardContent>
                        <div className="text-2xl font-bold">{totalStorageUsed.toFixed(2)} GB</div>
                        <p className="text-xs text-muted-foreground">Total cloud storage consumed</p>
                    </CardContent>
                </Card>
                 <Card>
                    <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
                        <CardTitle className="text-sm font-medium">Avg. Call Duration</CardTitle>
                        <BarChart className="h-4 w-4 text-muted-foreground" />
                    </CardHeader>
                    <CardContent>
                        <div className="text-2xl font-bold">{Math.floor(avgCallDuration / 60)}m {avgCallDuration % 60}s</div>
                        <p className="text-xs text-muted-foreground">Average across all recordings</p>
                    </CardContent>
                </Card>
            </div>
            
            <UserManagementTable allUsers={allUsers} />
        </div>
    );
}
