
"use client";

import React from 'react';
import type { Contact, CallRecording } from '@/lib/types';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { Users, Phone, HardDrive, Clock, BarChart } from 'lucide-react';
import { ClientFormattedDate } from '../client-formatted-date';
import { Avatar, AvatarFallback } from '../ui/avatar';
import { PlaceHolderImages } from '@/lib/placeholder-images';
import Image from 'next/image';

type AdminDashboardProps = {
    allUsers: Contact[];
    allRecordings: CallRecording[];
};

export function AdminDashboard({ allUsers, allRecordings }: AdminDashboardProps) {

    const totalStorageUsed = 12.8; // GB, mock data
    const totalUsers = allUsers.length;
    const totalRecordings = allRecordings.length;
    const avgCallDuration = totalRecordings > 0 ? Math.round(allRecordings.reduce((acc, r) => acc + r.duration, 0) / totalRecordings) : 0;
    
    const recentRecordings = allRecordings.slice(0, 5);

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
                        <div className="text-2xl font-bold">{totalStorageUsed} GB</div>
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
            
            <div className="grid gap-6 lg:grid-cols-2">
                <Card>
                    <CardHeader>
                        <CardTitle>Recent Recordings</CardTitle>
                        <CardDescription>A live feed of the most recent recordings from all users.</CardDescription>
                    </CardHeader>
                    <CardContent>
                       <div className="rounded-lg border">
                          <Table>
                            <TableHeader>
                              <TableRow>
                                <TableHead>Contact</TableHead>
                                <TableHead>Date</TableHead>
                                <TableHead className="text-right">Duration</TableHead>
                              </TableRow>
                            </TableHeader>
                            <TableBody>
                              {recentRecordings.map(rec => (
                                <TableRow key={rec.id}>
                                  <TableCell>
                                    <div className="font-medium">{rec.contactName || 'Unknown'}</div>
                                    <div className="text-sm text-muted-foreground">{rec.phoneNumber}</div>
                                  </TableCell>
                                  <TableCell>
                                    <ClientFormattedDate date={rec.date} formatString="PPp" />
                                  </TableCell>
                                  <TableCell className="text-right">{Math.floor(rec.duration / 60)}m {rec.duration % 60}s</TableCell>
                                </TableRow>
                              ))}
                            </TableBody>
                          </Table>
                        </div>
                    </CardContent>
                </Card>
                <Card>
                    <CardHeader>
                        <CardTitle>Users</CardTitle>
                        <CardDescription>A list of all registered users in the system.</CardDescription>
                    </CardHeader>
                    <CardContent>
                        <div className="space-y-4">
                            {allUsers.map(user => {
                                const avatar = PlaceHolderImages[allUsers.findIndex(c => c.phoneNumber === user.phoneNumber) % PlaceHolderImages.length];
                                return (
                                    <div key={user.phoneNumber} className="flex items-center justify-between">
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
                                    </div>
                                )
                            })}
                        </div>
                    </CardContent>
                </Card>
            </div>
        </div>
    );
}
