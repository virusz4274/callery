
'use client';

import React from 'react';
import { Card, CardContent, CardFooter } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Loader2 } from 'lucide-react';
import { GoogleIcon } from '@/components/icons/google-icon';
import { Label } from '@/components/ui/label';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Progress } from '@/components/ui/progress';
import { Switch } from '@/components/ui/switch';
import { GoogleConnectDialog } from './google-connect-dialog';
import { SettingsPage } from './settings-page';
import type { Contact } from '@/lib/types';

interface DataSettingsProps {
    userProfile: Contact | null;
    settings: { deletionPolicy: string };
    onSettingsChange: (newSettings: { deletionPolicy: string }) => void;
    onSave: () => Promise<void>;
    isSaving: boolean;
    onIngest: () => void;
    isIngesting: boolean;
    onConnectGoogle: () => void;
    isSyncing: boolean;
    showConnectDialog: boolean;
    onDialogConfirm: () => void;
    onOpenChangeDialog: (open: boolean) => void;
}

export function DataSettings({
    userProfile,
    settings,
    onSettingsChange,
    onSave,
    isSaving,
    onIngest,
    isIngesting,
    onConnectGoogle,
    isSyncing,
    showConnectDialog,
    onDialogConfirm,
    onOpenChangeDialog,
}: DataSettingsProps) {
    const showAutoTranscribe = process.env.NEXT_PUBLIC_FEATURE_AUTO_TRANSCRIBE_ENABLED === 'true';
    const storagePercentage = userProfile
        ? (userProfile.storageUsed / userProfile.storageAllocation) * 100
        : 0;

    return (
        <>
            <div className="space-y-6">
                <SettingsPage title="Data Sources" description="Manage where your call data comes from. Connect your Google account or manually upload recordings.">
                    <Card>
                        <CardContent className="space-y-4">
                            <div className="flex items-center justify-between rounded-lg border p-4">
                                <div className="space-y-0.5">
                                    <Label className="text-base">Sync Google Contacts</Label>
                                    <p className="text-sm text-muted-foreground">
                                        Automatically match names to phone numbers from your Google Contacts.
                                    </p>
                                </div>
                                <Button
                                    variant="outline"
                                    onClick={onConnectGoogle}
                                    disabled={isSyncing}
                                >
                                    {isSyncing ? (
                                        <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                                    ) : (
                                        <GoogleIcon className="mr-2 h-4 w-4" />
                                    )}
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
                                <Button
                                    onClick={onIngest}
                                    disabled={isIngesting}
                                    variant="outline"
                                >
                                    {isIngesting ? (
                                        <>
                                            <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                                            Processing...
                                        </>
                                    ) : (
                                        'Process New Recordings'
                                    )}
                                </Button>
                                {isIngesting && (
                                    <p className="text-sm text-muted-foreground mt-2">
                                        Please wait, this may take a moment...
                                    </p>
                                )}
                            </div>
                        </CardContent>
                    </Card>
                </SettingsPage>
                {showAutoTranscribe && (
                    <SettingsPage title="Data Processing" description="Manage how your recordings are transcribed and analyzed.">
                        <Card>
                            <CardContent>
                                <div className="flex items-center justify-between rounded-lg border p-4">
                                    <div className="space-y-0.5">
                                        <Label htmlFor="auto-transcribe" className="text-base">
                                            Auto-Transcribe New Recordings
                                        </Label>
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
                    </SettingsPage>
                )}
                <SettingsPage title="Storage Management" description="Manage your storage usage and data retention policies.">
                    <Card>
                        <CardContent className="space-y-4">
                            <div>
                                <Label>Storage Usage</Label>
                                <p className="text-sm text-muted-foreground pb-2">
                                    You are currently using {userProfile?.storageUsed?.toFixed(2) || 0} GB of {userProfile?.storageAllocation || 0} GB.
                                </p>
                                <Progress value={storagePercentage} className="w-full" />
                            </div>
                            <div className="grid w-full max-w-sm items-center gap-1.5 pt-2">
                                <Label htmlFor="deletion-policy">Automatic Deletion Policy</Label>
                                <p className="text-sm text-muted-foreground pb-1">
                                    Automatically delete old recordings to manage storage space.
                                </p>
                                <Select
                                    value={settings.deletionPolicy}
                                    onValueChange={(value) => onSettingsChange({ ...settings, deletionPolicy: value })}
                                >
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
                            <Button onClick={onSave} disabled={isSaving}>
                                {isSaving && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
                                Save Policy
                            </Button>
                        </CardFooter>
                    </Card>
                </SettingsPage>
            </div>
            {showConnectDialog && (
                <GoogleConnectDialog
                    onOpenChange={onOpenChangeDialog}
                    onConfirm={onDialogConfirm}
                />
            )}
        </>
    );
}
