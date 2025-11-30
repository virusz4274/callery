
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
        </TabsList>
        <TabsContent value="profile">
            <Card>
                <CardHeader>
                    <CardTitle>Profile Settings</CardTitle>
                    <CardDescription>Update your personal information.</CardDescription>
                </CardHeader>
                <CardContent className="space-y-4">
                    <div className="space-y-2">
                        <Label htmlFor="name">Name</Label>
                        <Input id="name" defaultValue="Your Name" />
                    </div>
                    <div className="space-y-2">
                        <Label htmlFor="password">Password</Label>
                        <Input id="password" type="password" placeholder="Enter a new password" />
                    </div>
                </CardContent>
                <CardFooter>
                    <Button>Save Changes</Button>
                </CardFooter>
            </Card>
        </TabsContent>
        <TabsContent value="general">
            <Card>
                <CardHeader>
                    <CardTitle>General Settings</CardTitle>
                    <CardDescription>Configure general application preferences.</CardDescription>
                </CardHeader>
                <CardContent>
                    <p>General settings will be available here.</p>
                </CardContent>
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
        </TabsContent>
      </Tabs>
    </div>
  );
}
