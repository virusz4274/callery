
"use client";

import React from 'react';
import type { Contact, CallRecording } from '@/lib/types';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Users, Phone, HardDrive, BarChart, MoreVertical, Mic } from 'lucide-react';
import { Avatar, AvatarFallback } from '../ui/avatar';
import { PlaceHolderImages } from '@/lib/placeholder-images';
import Image from 'next/image';
import { Button } from '../ui/button';
import { DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuTrigger } from '../ui/dropdown-menu';
import { Badge } from '../ui/badge';

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
            
            <Card>
                <CardHeader>
                    <CardTitle>User Management</CardTitle>
                    <CardDescription>A list of all registered users in the system.</CardDescription>
                </CardHeader>
                <CardContent>
                    <div className="space-y-4">
                        {allUsers.map(user => {
                            const avatar = PlaceHolderImages[allUsers.findIndex(c => c.phoneNumber === user.phoneNumber) % PlaceHolderImages.length];
                            return (
                                <div key={user.phoneNumber} className="flex items-center justify-between p-2 rounded-lg hover:bg-muted/50">
                                    <div className="flex items-center gap-4">
                                        <Avatar>
                                                {avatar && <Image src={avatar.imageUrl} alt={user.name} width={40} height={40} data-ai-hint={avatar.imageHint} className="rounded-full object-cover"/>}
                                                <AvatarFallback>{user.name.charAt(0)}</AvatarFallback>
                                        </Avatar>
                                        <div>
                                            <p className="font-semibold">{user.name}</p>
                                            <p className="text-sm text-muted-foreground">{user.phoneNumber}</p>
                                        </div>
                                    </div>
                                     <div className="hidden sm:flex items-center gap-6 text-sm">
                                        <div>
                                            <p className="font-medium text-right">{user.plan}</p>
                                            <p className="text-muted-foreground text-right">Plan</p>
                                        </div>
                                        <div>
                                            <p className="font-medium text-right">{user.storageUsed.toFixed(2)} GB</p>
                                            <p className="text-muted-foreground text-right">Storage</p>
                                        </div>
                                        <div>
                                            <p className="font-medium text-right">{user.transcriptionUsed} min</p>
                                            <p className="text-muted-foreground text-right">Transcription</p>
                                        </div>
                                     </div>
                                    <DropdownMenu>
                                        <DropdownMenuTrigger asChild>
                                            <Button variant="ghost" size="icon">
                                                <MoreVertical className="h-4 w-4" />
                                                <span className="sr-only">Actions</span>
                                            </Button>
                                        </DropdownMenuTrigger>
                                        <DropdownMenuContent align="end">
                                            <DropdownMenuItem>View Details</DropdownMenuItem>
                                            <DropdownMenuItem>Manage Plan</DropdownMenuItem>
                                            <DropdownMenuItem className="text-destructive focus:text-destructive">Disable User</DropdownMenuItem>
                                        </DropdownMenuContent>
                                    </DropdownMenu>
                                </div>
                            )
                        })}
                    </div>
                </CardContent>
            </Card>
        </div>
    );
}
