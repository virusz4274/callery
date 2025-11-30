
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
        <h1 className="text-3xl font-bold">Settings</h1>
        <p className="text-muted-foreground">Manage your account and application settings.</p>
      </div>
      <Tabs defaultValue="profile" className="w-full">
        <TabsList>
          <TabsTrigger value="profile">Profile</TabsTrigger>
          <TabsTrigger value="general">General</TabsTrigger>
          <TabsTrigger value="data">Data Management</TabsTrigger>
          <TabsTrigger value="notifications">Notifications</TabsTrigger>
        </TabsList>
        <TabsContent value="profile" className="space-y-6">
            <Card>
                <CardHeader>
                    <CardTitle>Profile Information</CardTitle>
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
                    <CardTitle>Password Management</CardTitle>
                    <CardDescription>Change your account password.</CardDescription>
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
        <TabsContent value="general">
             <Card>
                <CardHeader>
                    <CardTitle>Localization</CardTitle>
                    <CardDescription>Set your preferred timezone for date and time display.</CardDescription>
                </CardHeader>
                <CardContent>
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
              <CardTitle>Contact Syncing</CardTitle>
              <CardDescription>
                Connect your Google Account to automatically sync your contacts.
              </CardDescription>
            </CardHeader>
            <CardContent>
              <Button>
                <GoogleIcon className="mr-2 h-4 w-4" />
                Connect with Google
              </Button>
            </CardContent>
          </Card>
          <Card>
            <CardHeader>
              <CardTitle>Manual Data Ingestion</CardTitle>
              <CardDescription>
                Place your recording files in the `/injest` directory at the root of the project and click the button below to process them.
              </CardDescription>
            </CardHeader>
            <CardContent>
              <div className="flex items-center gap-4">
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
                {isIngesting && <p className="text-sm text-muted-foreground">Please wait, this may take a moment...</p>}
              </div>
            </CardContent>
          </Card>
          <Card>
            <CardHeader>
              <CardTitle>Transcription Settings</CardTitle>
              <CardDescription>
                Manage how your recordings are transcribed.
              </CardDescription>
            </CardHeader>
            <CardContent>
              <div className="flex items-center justify-between rounded-lg border p-4">
                <div className="space-y-0.5">
                  <Label htmlFor="auto-transcribe" className="text-base">Auto-Transcribe New Recordings</Label>
                  <p className="text-sm text-muted-foreground">
                    Automatically generate a transcript when a new recording is ingested.
                  </p>
                </div>
                <Switch id="auto-transcribe" defaultChecked/>
              </div>
            </CardContent>
             <CardFooter>
                <Button>Save Settings</Button>
            </CardFooter>
          </Card>
           <Card>
                <CardHeader>
                    <CardTitle>Storage Usage</CardTitle>
                    <CardDescription>You are currently using 4.2 GB of 15 GB.</CardDescription>
                </CardHeader>
                <CardContent>
                    <Progress value={(4.2 / 15) * 100} className="w-full" />
                </CardContent>
            </Card>
           <Card>
                <CardHeader>
                    <CardTitle>Automatic Deletion Policy</CardTitle>
                    <CardDescription>Automatically delete old recordings to manage storage space.</CardDescription>
                </CardHeader>
                <CardContent>
                    <div className="grid w-full max-w-sm items-center gap-1.5">
                        <Label htmlFor="deletion-policy">Delete recordings older than</Label>
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
                    <CardTitle>Activity Digest</CardTitle>
                    <CardDescription>Receive a summary of your call activity.</CardDescription>
                </CardHeader>
                <CardContent>
                    <RadioGroup defaultValue="off">
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
                </CardContent>
                 <CardFooter>
                    <Button>Save Preferences</Button>
                </CardFooter>
            </Card>
             <Card>
                <CardHeader>
                    <CardTitle>Data Ingestion Alerts</CardTitle>
                    <CardDescription>Get notified about the status of manual data ingestion.</CardDescription>
                </CardHeader>
                <CardContent className="space-y-4">
                     <div className="flex items-center justify-between rounded-lg border p-4">
                        <div className="space-y-0.5">
                        <Label htmlFor="ingest-success" className="text-base">Notify on success</Label>
                        <p className="text-sm text-muted-foreground">
                            Receive an email when file ingestion completes successfully.
                        </p>
                        </div>
                        <Switch id="ingest-success" />
                    </div>
                    <div className="flex items-center justify-between rounded-lg border p-4">
                        <div className="space-y-0.5">
                        <Label htmlFor="ingest-fail" className="text-base">Notify on failure</Label>
                        <p className="text-sm text-muted-foreground">
                            Receive an email if any files fail to ingest.
                        </p>
                        </div>
                        <Switch id="ingest-fail" defaultChecked/>
                    </div>
                </CardContent>
                 <CardFooter>
                    <Button>Save Preferences</Button>
                </CardFooter>
            </Card>
        </TabsContent>
      </Tabs>
    </div>
  );
}
