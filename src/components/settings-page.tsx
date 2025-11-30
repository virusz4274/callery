
'use client';

import React, { useState, useTransition } from 'react';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { Button } from '@/components/ui/button';
import { ingestFiles } from '@/app/actions/ingest-files';
import { useToast } from '@/hooks/use-toast';
import { Loader2 } from 'lucide-react';
import { useRouter } from 'next/navigation';

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
        <p className="text-muted-foreground">Manage your application settings and data sources.</p>
      </div>
      <Tabs defaultValue="general" className="w-full">
        <TabsList>
          <TabsTrigger value="general">General</TabsTrigger>
          <TabsTrigger value="data">Data Management</TabsTrigger>
        </TabsList>
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
        <TabsContent value="data">
          <Card>
            <CardHeader>
              <CardTitle>Data Ingestion</CardTitle>
              <CardDescription>
                Manage your call recording data. Place your recording files in the `/injest` directory at the root of the project and click the button below to process them.
              </CardDescription>
            </CardHeader>
            <CardContent>
              <div className="flex items-center gap-4">
                <Button onClick={handleIngest} disabled={isIngesting}>
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
