
'use client';

import React, { useState, useTransition } from 'react';
import { Card, CardContent, CardDescription, CardFooter, CardHeader, CardTitle } from '@/components/ui/card';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { Button } from '@/components/ui/button';
import { ingestFiles } from '@/app/actions/ingest-files';
import { useToast } from '@/hooks/use-toast';
import { Loader2 } from 'lucide-react';
import { useRouter } from 'next/navigation';
import { GoogleIcon } from '@/components/icons/google-icon';
import { Label } from '@/components/ui/label';
import { Input } from '@/components/ui/input';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Progress } from './ui/progress';
import { Switch } from './ui/switch';
import { RadioGroup, RadioGroupItem } from './ui/radio-group';

const timezones = [
  { value: 'Etc/GMT+12', label: '(GMT-12:00) International Date Line West' },
  { value: 'Pacific/Midway', label: '(GMT-11:00) Midway Island, Samoa' },
  { value: 'Pacific/Honolulu', label: '(GMT-10:00) Hawaii' },
  { value: 'US/Alaska', label: '(GMT-09:00) Alaska' },
  { value: 'America/Los_Angeles', label: '(GMT-08:00) Pacific Time (US & Canada)' },
  { value: 'America/Tijuana', label: '(GMT-08:00) Tijuana, Baja California' },
  { value: 'America/Denver', label: '(GMT-07:00) Mountain Time (US & Canada)' },
  { value: 'America/Phoenix', label: '(GMT-07:00) Arizona' },
  { value: 'America/Chicago', label: '(GMT-06:00) Central Time (US & Canada)' },
  { value: 'America/New_York', label: '(GMT-05:00) Eastern Time (US & Canada)' },
  { value: 'America/Caracas', label: '(GMT-04:30) Caracas' },
  { value: 'America/Halifax', label: '(GMT-04:00) Atlantic Time (Canada)' },
  { value: 'America/Sao_Paulo', label: '(GMT-03:00) Brasilia' },
  { value: 'Atlantic/South_Georgia', label: '(GMT-02:00) Mid-Atlantic' },
  { value: 'Atlantic/Azores', label: '(GMT-01:00) Azores' },
  { value: 'Europe/London', label: '(GMT+00:00) London, Lisbon, Dublin' },
  { value: 'Europe/Berlin', label: '(GMT+01:00) Amsterdam, Berlin, Rome, Paris' },
  { value: 'Europe/Helsinki', label: '(GMT+02:00) Helsinki, Kyiv, Riga, Sofia' },
  { value: 'Asia/Istanbul', label: '(GMT+03:00) Istanbul, Moscow, St. Petersburg' },
  { value: 'Asia/Dubai', label: '(GMT+04:00) Abu Dhabi, Muscat' },
  { value: 'Asia/Kolkata', label: '(GMT+05:30) Chennai, Kolkata, Mumbai, New Delhi' },
  { value: 'Asia/Bangkok', label: '(GMT+07:00) Bangkok, Hanoi, Jakarta' },
  { value: 'Asia/Tokyo', label: '(GMT+09:00) Osaka, Sapporo, Tokyo' },
  { value: 'Australia/Sydney', label: '(GMT+10:00) Sydney, Melbourne' },
  { value: 'Pacific/Auckland', label: '(GMT+12:00) Auckland, Wellington' },
];


export function SettingsPage() {
    const [isIngesting, startIngestTransition] = useTransition();
    const { toast } = useToast();
    const router = useRouter();

    const showAutoTranscribe = process.env.NEXT_PUBLIC_FEATURE_AUTO_TRANSCRIBE_ENABLED === 'true';
    const showBilling = process.env.NEXT_PUBLIC_FEATURE_BILLING_ENABLED === 'true';

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

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-3xl font-bold tracking-tight">Settings</h1>
        <p className="text-muted-foreground">Manage your account, data, and application preferences.</p>
      </div>
      <Tabs defaultValue="profile" className="w-full">
        <TabsList>
          <TabsTrigger value="profile">Profile</TabsTrigger>
          <TabsTrigger value="general">General</TabsTrigger>
          <TabsTrigger value="data">Data</TabsTrigger>
          <TabsTrigger value="notifications">Notifications</TabsTrigger>
          {showBilling && <TabsTrigger value="billing">Billing</TabsTrigger>}
        </TabsList>
        <TabsContent value="profile" className="space-y-6">
            <Card>
                <CardHeader>
                    <CardTitle>Profile</CardTitle>
                    <CardDescription>Update your personal information.</CardDescription>
                </CardHeader>
                <CardContent className="space-y-4">
                    <div className="space-y-2">
                        <Label htmlFor="name">Name</Label>
                        <Input id="name" defaultValue="Your Name" />
                    </div>
                    <div className="space-y-2">
                        <Label htmlFor="email">Email</Label>
                        <Input id="email" type="email" readOnly defaultValue="user@example.com" className="bg-muted/50 cursor-not-allowed"/>
                    </div>
                </CardContent>
                <CardFooter>
                    <Button>Save Profile</Button>
                </CardFooter>
            </Card>
             <Card>
                <CardHeader>
                    <CardTitle>Password</CardTitle>
                    <CardDescription>Change your account password. For security, you will be logged out after a successful password change.</CardDescription>
                </CardHeader>
                <CardContent className="space-y-4">
                    <div className="space-y-2">
                        <Label htmlFor="new-password">New Password</Label>
                        <Input id="new-password" type="password" placeholder="Enter a new password" />
                    </div>
                    <div className="space-y-2">
                        <Label htmlFor="confirm-password">Confirm New Password</Label>
                        <Input id="confirm-password" type="password" placeholder="Confirm your new password" />
                    </div>
                </CardContent>
                <CardFooter>
                    <Button>Change Password</Button>
                </CardFooter>
            </Card>
        </TabsContent>
        <TabsContent value="general" className="space-y-6">
             <Card>
                <CardHeader>
                    <CardTitle>Localization</CardTitle>
                    <CardDescription>Set your preferred language and timezone for date and time display.</CardDescription>
                </CardHeader>
                <CardContent className="space-y-4">
                    <div className="grid w-full max-w-sm items-center gap-1.5">
                        <Label htmlFor="timezone">Timezone</Label>
                        <Select>
                            <SelectTrigger id="timezone">
                                <SelectValue placeholder="Select a timezone" />
                            </SelectTrigger>
                            <SelectContent>
                                {timezones.map(tz => (
                                    <SelectItem key={tz.value} value={tz.value}>
                                        {tz.label}
                                    </SelectItem>
                                ))}
                            </SelectContent>
                        </Select>
                    </div>
                </CardContent>
                 <CardFooter>
                    <Button>Save Preferences</Button>
                </CardFooter>
            </Card>
        </TabsContent>
        <TabsContent value="data" className="space-y-6">
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
                         <p className="text-sm text-muted-foreground pb-2">You are currently using 4.2 GB of 15 GB.</p>
                        <Progress value={(4.2 / 15) * 100} className="w-full" />
                    </div>
                    <div className="grid w-full max-w-sm items-center gap-1.5 pt-2">
                        <Label htmlFor="deletion-policy">Automatic Deletion Policy</Label>
                         <p className="text-sm text-muted-foreground pb-1">Automatically delete old recordings to manage storage space.</p>
                        <Select defaultValue="never">
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
                    <Button>Save Policy</Button>
                </CardFooter>
            </Card>
        </TabsContent>
        <TabsContent value="notifications" className="space-y-6">
            <Card>
                <CardHeader>
                    <CardTitle>Email Notifications</CardTitle>
                    <CardDescription>Choose which email notifications you want to receive.</CardDescription>
                </CardHeader>
                <CardContent className="space-y-4">
                    <div>
                        <Label className="text-base">Activity Digest</Label>
                        <p className="text-sm text-muted-foreground pb-2">Receive a summary of your call activity.</p>
                        <RadioGroup defaultValue="weekly" className="flex space-x-4">
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
                        <Switch id="ingest-success" defaultChecked/>
                    </div>
                    <div className="flex items-center justify-between rounded-lg border p-4">
                        <div className="space-y-0.5">
                        <Label htmlFor="ingest-fail" className="text-base">Ingestion Failure</Label>
                        <p className="text-sm text-muted-foreground">
                            Receive an email if any files fail to ingest.
                        </p>
                        </div>
                        <Switch id="ingest-fail" defaultChecked/>
                    </div>
                </CardContent>
                 <CardFooter>
                    <Button>Save Notifications</Button>
                </CardFooter>
            </Card>
        </TabsContent>
        {showBilling && (
            <TabsContent value="billing">
                <Card>
                    <CardHeader>
                        <CardTitle>Billing & Subscription</CardTitle>
                        <CardDescription>Manage your subscription, view payment history, and download invoices.</CardDescription>
                    </CardHeader>
                    <CardContent className="flex flex-col items-center justify-center text-center p-12 border-2 border-dashed rounded-lg">
                        <p className="text-lg font-medium">Pro Plan</p>
                        <p className="text-muted-foreground">You are currently on the Pro plan.</p>
                        <Button variant="outline" className="mt-4" disabled>Manage Subscription</Button>
                    </CardContent>
                </Card>
            </TabsContent>
        )}
      </Tabs>
    </div>
  );
}
