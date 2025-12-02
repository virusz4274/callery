
'use client';
import React, { useState, useEffect } from 'react';
import { Card, CardContent, CardDescription, CardFooter, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Label } from '@/components/ui/label';
import { Switch } from '@/components/ui/switch';
import { RadioGroup, RadioGroupItem } from '@/components/ui/radio-group';
import { useUser, useUserProfile, useFirestore } from '@/firebase';
import { doc, updateDoc } from 'firebase/firestore';
import { useToast } from '@/hooks/use-toast';
import { Loader2 } from 'lucide-react';
import { Skeleton } from '../ui/skeleton';

type NotificationSettingsState = {
    activityDigest: 'off' | 'weekly' | 'monthly';
    ingestSuccess: boolean;
    ingestFail: boolean;
};

export function NotificationsSettings() {
    const { user } = useUser();
    const { userProfile, isProfileLoading } = useUserProfile(user);
    const firestore = useFirestore();
    const { toast } = useToast();

    const [settings, setSettings] = useState<NotificationSettingsState>({
        activityDigest: 'weekly',
        ingestSuccess: true,
        ingestFail: true,
    });
    const [isSaving, setIsSaving] = useState(false);

    useEffect(() => {
        if (userProfile?.notificationSettings) {
            setSettings(userProfile.notificationSettings);
        }
    }, [userProfile]);

    const handleSave = async () => {
        if (!user) return;
        setIsSaving(true);
        try {
            const userRef = doc(firestore, 'users', user.uid);
            await updateDoc(userRef, { notificationSettings: settings });
            toast({
                title: 'Notifications Saved',
                description: 'Your notification preferences have been updated.',
            });
        } catch (error: any) {
            toast({
                variant: 'destructive',
                title: 'Save Failed',
                description: error.message,
            });
        } finally {
            setIsSaving(false);
        }
    };
    
    if (isProfileLoading) {
        return (
             <Card>
                <CardHeader>
                    <Skeleton className="h-6 w-1/4" />
                    <Skeleton className="h-4 w-1/2" />
                </CardHeader>
                <CardContent className="space-y-4">
                    <Skeleton className="h-16 w-full" />
                    <Skeleton className="h-16 w-full" />
                </CardContent>
                <CardFooter>
                    <Skeleton className="h-10 w-24" />
                </CardFooter>
            </Card>
        )
    }

    return (
        <Card>
            <CardHeader>
                <CardTitle>Email Notifications</CardTitle>
                <CardDescription>Choose which email notifications you want to receive.</CardDescription>
            </CardHeader>
            <CardContent className="space-y-4">
                <div>
                    <Label className="text-base">Activity Digest</Label>
                    <p className="text-sm text-muted-foreground pb-2">Receive a summary of your call activity.</p>
                    <RadioGroup 
                        value={settings.activityDigest} 
                        onValueChange={(value: 'off' | 'weekly' | 'monthly') => setSettings(s => ({...s, activityDigest: value}))}
                        className="flex space-x-4"
                    >
                        <div className="flex items-center space-x-2">
                            <RadioGroupItem value="off" id="r1" />
                            <Label htmlFor="r1">Off</Label>
                        </div>
                        <div className="flex items-center space-x-2">
                            <RadioGroupItem value="weekly" id="r2" />
                            <Label htmlFor="r2">Weekly</Label>
                        </div>
                        <div className="flex items-center space-x-2">
                            <RadioGroupItem value="monthly" id="r3" />
                            <Label htmlFor="r3">Monthly</Label>
                        </div>
                    </RadioGroup>
                </div>
                <div className="flex items-center justify-between rounded-lg border p-4">
                    <div className="space-y-0.5">
                    <Label htmlFor="ingest-success" className="text-base">Ingestion Success</Label>
                    <p className="text-sm text-muted-foreground">
                        Receive an email when file ingestion completes successfully.
                    </p>
                    </div>
                    <Switch 
                        id="ingest-success" 
                        checked={settings.ingestSuccess}
                        onCheckedChange={(checked) => setSettings(s => ({...s, ingestSuccess: checked}))}
                    />
                </div>
                <div className="flex items-center justify-between rounded-lg border p-4">
                    <div className="space-y-0.5">
                    <Label htmlFor="ingest-fail" className="text-base">Ingestion Failure</Label>
                    <p className="text-sm text-muted-foreground">
                        Receive an email if any files fail to ingest.
                    </p>
                    </div>
                    <Switch 
                        id="ingest-fail" 
                        checked={settings.ingestFail}
                        onCheckedChange={(checked) => setSettings(s => ({...s, ingestFail: checked}))}
                    />
                </div>
            </CardContent>
            <CardFooter>
                <Button onClick={handleSave} disabled={isSaving}>
                    {isSaving && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
                    Save Notifications
                </Button>
            </CardFooter>
        </Card>
    );
}
