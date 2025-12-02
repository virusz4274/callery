
'use client';

import React, { useState, useTransition, useEffect } from 'react';
import { Card, CardContent, CardDescription, CardFooter, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { ingestFiles } from '@/app/actions/ingest-files';
import { useToast } from '@/hooks/use-toast';
import { Loader2 } from 'lucide-react';
import { useRouter } from 'next/navigation';
import { GoogleIcon } from '@/components/icons/google-icon';
import { Label } from '@/components/ui/label';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Progress } from '@/components/ui/progress';
import { Switch } from '@/components/ui/switch';
import { useUser, useUserProfile, useFirestore } from '@/firebase';
import { doc, updateDoc } from 'firebase/firestore';
import { Skeleton } from '../ui/skeleton';

export function DataSettings() {
    const [isIngesting, startIngestTransition] = useTransition();
    const { toast } = useToast();
    const router = useRouter();
    const showAutoTranscribe = process.env.NEXT_PUBLIC_FEATURE_AUTO_TRANSCRIBE_ENABLED === 'true';

    const { user } = useUser();
    const { userProfile, isProfileLoading } = useUserProfile(user);
    const firestore = useFirestore();

    const [deletionPolicy, setDeletionPolicy] = useState('never');
    const [isSavingPolicy, setIsSavingPolicy] = useState(false);
    
    useEffect(() => {
        if (userProfile?.storageSettings?.deletionPolicy) {
            setDeletionPolicy(userProfile.storageSettings.deletionPolicy);
        }
    }, [userProfile]);

    const handleIngest = () => {
        startIngestTransition(async () => {
            const result = await ingestFiles();

            if (result.error) {
                toast({
                    variant: 'destructive',
                    title: 'Ingestion Error',
                    description: result.error,
                });
            } else if (result.processedCount > 0) {
                toast({
                    title: 'Ingestion Complete',
                    description: `${result.processedCount} new recordings have been processed and added.`,
                });
                router.refresh();
            } else {
                 toast({
                    title: 'No New Files',
                    description: `The 'injest' directory is empty. No new recordings to process.`,
                });
            }
        });
    }

    const handleSavePolicy = async () => {
        if (!user) return;
        setIsSavingPolicy(true);
        try {
            const userRef = doc(firestore, 'users', user.uid);
            await updateDoc(userRef, { 
                'storageSettings.deletionPolicy': deletionPolicy 
            });
            toast({
                title: 'Policy Saved',
                description: 'Your data retention policy has been updated.',
            });
        } catch (error: any) {
             toast({
                variant: 'destructive',
                title: 'Save Failed',
                description: error.message,
            });
        } finally {
            setIsSavingPolicy(false);
        }
    };
    
    const storagePercentage = userProfile ? (userProfile.storageUsed / userProfile.storageAllocation) * 100 : 0;

    if(isProfileLoading) {
        return (
            <div className="space-y-6">
                <Card>
                    <CardHeader>
                        <Skeleton className="h-6 w-1/4" />
                        <Skeleton className="h-4 w-1/2" />
                    </CardHeader>
                    <CardContent className="space-y-4">
                        <Skeleton className="h-16 w-full" />
                        <Skeleton className="h-24 w-full" />
                    </CardContent>
                </Card>
                 <Card>
                    <CardHeader>
                        <Skeleton className="h-6 w-1/4" />
                        <Skeleton className="h-4 w-1/2" />
                    </CardHeader>
                    <CardContent className="space-y-4">
                        <Skeleton className="h-10 w-full" />
                        <Skeleton className="h-10 w-full max-w-sm" />
                    </CardContent>
                     <CardFooter>
                        <Skeleton className="h-10 w-24" />
                    </CardFooter>
                </Card>
            </div>
        )
    }

    return (
        <div className="space-y-6">
           <Card>
            <CardHeader>
              <CardTitle>Data Sources</CardTitle>
              <CardDescription>
                Manage where your call data comes from. Connect your Google account or manually upload recordings.
              </CardDescription>
            </CardHeader>
            <CardContent className="space-y-4">
               <div className="flex items-center justify-between rounded-lg border p-4">
                    <div className="space-y-0.5">
                        <Label className="text-base">Sync Google Contacts</Label>
                        <p className="text-sm text-muted-foreground">
                            Automatically match phone numbers to your Google Contacts.
                        </p>
                    </div>
                    <Button variant="outline">
                        <GoogleIcon className="mr-2 h-4 w-4" />
                        Connect
                    </Button>
                </div>
                 <div className="rounded-lg border p-4">
                    <div className="space-y-1">
                        <Label className="text-base">Manual Data Ingestion</Label>
                         <p className="text-sm text-muted-foreground pb-2">
                           Place your recording files in the `/injest` directory and click the button below to process them.
                        </p>
                    </div>
                     <Button onClick={handleIngest} disabled={isIngesting} variant="outline">
                        {isIngesting ? (
                            <>
                            <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                            Processing...
                            </>
                        ) : (
                            'Process New Recordings'
                        )}
                        </Button>
                        {isIngesting && <p className="text-sm text-muted-foreground mt-2">Please wait, this may take a moment...</p>}
                </div>
            </CardContent>
          </Card>
          {showAutoTranscribe && (
            <Card>
                <CardHeader>
                <CardTitle>Data Processing</CardTitle>
                <CardDescription>
                    Manage how your recordings are transcribed and analyzed.
                </CardDescription>
                </CardHeader>
                <CardContent>
                <div className="flex items-center justify-between rounded-lg border p-4">
                    <div className="space-y-0.5">
                    <Label htmlFor="auto-transcribe" className="text-base">Auto-Transcribe New Recordings</Label>
                    <p className="text-sm text-muted-foreground">
                        Automatically generate a transcript when a new recording is ingested. This may incur costs.
                    </p>
                    </div>
                    <Switch id="auto-transcribe" disabled />
                </div>
                </CardContent>
                <CardFooter>
                    <Button disabled>Save Settings</Button>
                </CardFooter>
            </Card>
          )}
           <Card>
                <CardHeader>
                    <CardTitle>Storage Management</CardTitle>
                    <CardDescription>Manage your storage usage and data retention policies.</CardDescription>
                </CardHeader>
                <CardContent className="space-y-4">
                    <div>
                        <Label>Storage Usage</Label>
                         <p className="text-sm text-muted-foreground pb-2">You are currently using {userProfile?.storageUsed?.toFixed(2) || 0} GB of {userProfile?.storageAllocation || 0} GB.</p>
                        <Progress value={storagePercentage} className="w-full" />
                    </div>
                    <div className="grid w-full max-w-sm items-center gap-1.5 pt-2">
                        <Label htmlFor="deletion-policy">Automatic Deletion Policy</Label>
                         <p className="text-sm text-muted-foreground pb-1">Automatically delete old recordings to manage storage space.</p>
                        <Select value={deletionPolicy} onValueChange={setDeletionPolicy}>
                            <SelectTrigger id="deletion-policy">
                                <SelectValue placeholder="Select a policy" />
                            </SelectTrigger>
                            <SelectContent>
                                <SelectItem value="never">Never</SelectItem>
                                <SelectItem value="3m">3 Months</SelectItem>
                                <SelectItem value="6m">6 Months</SelectItem>
                                <SelectItem value="1y">1 Year</SelectItem>
                            </SelectContent>
                        </Select>
                    </div>
                </CardContent>
                 <CardFooter>
                    <Button onClick={handleSavePolicy} disabled={isSavingPolicy}>
                        {isSavingPolicy && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
                        Save Policy
                    </Button>
                </CardFooter>
            </Card>
        </div>
    );
}
