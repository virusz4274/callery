
'use client';

import type { Contact, CallRecording, Invoice } from '@/lib/types';
import { PlaceHolderImages } from '@/lib/placeholder-images';
import Image from 'next/image';
import { Avatar, AvatarFallback } from '@/components/ui/avatar';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { Badge } from '@/components/ui/badge';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { ClientFormattedDate } from '@/components/client-formatted-date';
import { Progress } from '@/components/ui/progress';
import { ArrowLeft } from 'lucide-react';
import Link from 'next/link';
import { Label } from '@/components/ui/label';

type UserDetailsPageProps = {
  user: Contact;
  recordings: CallRecording[];
  invoices: Invoice[];
  defaultTab?: string;
};

export function UserDetailsPage({ user, recordings, invoices, defaultTab }: UserDetailsPageProps) {
    const avatar = PlaceHolderImages.find(img => img.id === 'user' + (user.phoneNumber.slice(-1))) || PlaceHolderImages[0];
    
    const formatDuration = (seconds: number) => {
        const mins = Math.floor(seconds / 60);
        const secs = seconds % 60;
        return `${String(mins).padStart(2, '0')}:${String(secs).padStart(2, '0')}`;
    };

    return (
        <div className="space-y-6">
             <Link href="/admin" className="flex items-center gap-2 text-sm text-muted-foreground hover:text-foreground">
                <ArrowLeft className="h-4 w-4" />
                Back to User Management
            </Link>
            
            <Card>
                <CardHeader>
                     <div className="flex items-center gap-4">
                        <Avatar className="h-16 w-16">
                            {avatar && <Image src={avatar.imageUrl} alt={user.name} width={64} height={64} data-ai-hint={avatar.imageHint} className="rounded-full object-cover"/>}
                            <AvatarFallback>{user.name.charAt(0)}</AvatarFallback>
                        </Avatar>
                        <div>
                            <CardTitle className="text-3xl">{user.name}</CardTitle>
                            <CardDescription>{user.phoneNumber}</CardDescription>
                        </div>
                    </div>
                </CardHeader>
            </Card>

            <Tabs defaultValue={defaultTab || "info"} className="w-full">
                <TabsList className="h-auto flex-wrap justify-start">
                    <TabsTrigger value="info">User Information</TabsTrigger>
                    <TabsTrigger value="recordings">Recordings ({recordings.length})</TabsTrigger>
                    <TabsTrigger value="payment-history">Payment History</TabsTrigger>
                </TabsList>

                <TabsContent value="info">
                     <Card>
                        <CardHeader>
                            <CardTitle>Plan & Usage</CardTitle>
                        </CardHeader>
                        <CardContent className="space-y-6">
                            <div className="flex justify-between items-center">
                                <span className="font-semibold">Current Plan:</span>
                                <div>
                                    <Badge>{user.plan}</Badge>
                                </div>
                            </div>
                             <div>
                                <Label>Storage Usage ({user.storageUsed.toFixed(2)} / {user.storageAllocation} GB)</Label>
                                <Progress value={(user.storageUsed / user.storageAllocation) * 100} className="mt-1" />
                            </div>
                            <div>
                                <Label>Transcription Usage ({user.transcriptionUsed} / {user.transcriptionAllocation} min)</Label>
                                <Progress value={(user.transcriptionUsed / user.transcriptionAllocation) * 100} className="mt-1" />
                            </div>
                        </CardContent>
                    </Card>
                </TabsContent>
                
                <TabsContent value="recordings">
                    <Card>
                        <CardHeader>
                            <CardTitle>User Recordings</CardTitle>
                            <CardDescription>A list of all recordings associated with this user.</CardDescription>
                        </CardHeader>
                         <CardContent>
                             <div className="rounded-lg border">
                                <Table>
                                    <TableHeader>
                                    <TableRow>
                                        <TableHead>Date</TableHead>
                                        <TableHead>Duration</TableHead>
                                        <TableHead>Transcript Snippet</TableHead>
                                    </TableRow>
                                    </TableHeader>
                                    <TableBody>
                                    {recordings.map((rec) => (
                                        <TableRow key={rec.id}>
                                            <TableCell>
                                                <ClientFormattedDate date={rec.date} formatString="PPp" />
                                            </TableCell>
                                            <TableCell>{formatDuration(rec.duration)}</TableCell>
                                            <TableCell className="text-muted-foreground truncate max-w-sm">{rec.transcriptSnippet}</TableCell>
                                        </TableRow>
                                    ))}
                                    </TableBody>
                                </Table>
                            </div>
                         </CardContent>
                    </Card>
                </TabsContent>

                <TabsContent value="payment-history">
                    <Card>
                        <CardHeader>
                            <CardTitle>Payment History</CardTitle>
                            <CardDescription>A record of all invoices for this user.</CardDescription>
                        </CardHeader>
                        <CardContent>
                             <div className="rounded-lg border">
                                <Table>
                                    <TableHeader>
                                    <TableRow>
                                        <TableHead>Invoice ID</TableHead>
                                        <TableHead>Date</TableHead>
                                        <TableHead>Amount</TableHead>
                                        <TableHead className="text-right">Status</TableHead>
                                    </TableRow>
                                    </TableHeader>
                                    <TableBody>
                                    {invoices.map((invoice) => (
                                        <TableRow key={invoice.id}>
                                            <TableCell className="font-medium">{invoice.id}</TableCell>
                                            <TableCell>
                                                <ClientFormattedDate date={invoice.date} formatString="MMMM dd, yyyy" />
                                            </TableCell>
                                            <TableCell>${invoice.amount.toFixed(2)}</TableCell>
                                            <TableCell className="text-right">
                                                <Badge variant={invoice.status === 'Paid' ? 'secondary' : 'destructive'}>{invoice.status}</Badge>
                                            </TableCell>
                                        </TableRow>
                                    ))}
                                    </TableBody>
                                </Table>
                            </div>
                        </CardContent>
                    </Card>
                </TabsContent>
            </Tabs>
        </div>
    );
}
