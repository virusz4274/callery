
'use client';

import React from 'react';
import { Card, Button, Select, Switch, Spinner, Label, ListBox, Separator } from '@heroui/react';
import { GoogleIcon } from '@/components/icons/google-icon';
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
                    <Card className="bg-card/70 border-default-200">
                        <Card.Content className="space-y-4">
                            <div className="flex items-center justify-between rounded-lg border p-4">
                                <div className="space-y-0.5">
                                    <h4 className="text-base font-medium">Sync Google Contacts</h4>
                                    <p className="text-sm text-default-500">
                                        Automatically match names to phone numbers from your Google Contacts.
                                    </p>
                                </div>
                                <Button
                                    variant="secondary"
                                    onPress={onConnectGoogle}
                                    isDisabled={isSyncing}
                                >
                                    {isSyncing ? (
                                        <Spinner size="sm" />
                                    ) : (
                                        <GoogleIcon className="mr-2 h-4 w-4" />
                                    )}
                                    Connect
                                </Button>
                            </div>
                            <div className="rounded-lg border p-4">
                                <div className="space-y-1 mb-4">
                                    <h4 className="text-base font-medium">Manual Data Ingestion</h4>
                                    <p className="text-sm text-default-500">
                                        Place your recording files in the `/injest` directory and click the button below to process them.
                                    </p>
                                </div>
                                <Button
                                    onPress={onIngest}
                                    isDisabled={isIngesting}
                                    variant="secondary"
                                >
                                    {isIngesting && <Spinner size="sm" className='mr-2' />}
                                    {isIngesting ? 'Processing...' : 'Process New Recordings'}
                                </Button>
                            </div>
                        </Card.Content>
                    </Card>
                </SettingsPage>
                {showAutoTranscribe && (
                    <SettingsPage title="Data Processing" description="Manage how your recordings are transcribed and analyzed.">
                        <Card className="bg-card/70 border-default-200">
                            <Card.Content>
                                <div className="flex items-center justify-between rounded-lg border p-4">
                                    <div className="space-y-0.5">
                                        <h4 className="text-base font-medium">Auto-Transcribe New Recordings</h4>
                                        <p className="text-sm text-default-500">
                                            Automatically generate a transcript when a new recording is ingested. This may incur costs.
                                        </p>
                                    </div>
                                    <Switch isDisabled aria-label="Auto-Transcribe">
                                        <Switch.Control>
                                            <Switch.Thumb />
                                        </Switch.Control>
                                    </Switch>
                                </div>
                            </Card.Content>
                            <Card.Footer>
                                <Button isDisabled>Save Settings</Button>
                            </Card.Footer>
                        </Card>
                    </SettingsPage>
                )}
                <SettingsPage title="Storage Management" description="Manage your storage usage and data retention policies.">
                    <Card className="bg-card/70 border-default-200">
                        <Card.Content className="space-y-6">
                            <div>
                                <h4 className="font-medium mb-2">Storage Usage</h4>
                                <p className="text-sm text-default-500 mb-2">
                                    You are currently using {((userProfile?.storageUsed || 0) / (1024 * 1024 * 1024)).toFixed(2)} GB of {((userProfile?.storageAllocation || 0) / (1024 * 1024 * 1024)).toFixed(0)} GB.
                                </p>
                                {/* Custom Progress Bar */}
                                <div className="h-2 w-full bg-default-100 rounded-full overflow-hidden">
                                    <div
                                        className={`h-full ${storagePercentage > 90 ? "bg-danger" : "bg-primary"}`}
                                        style={{ width: `${Math.min(storagePercentage, 100)}%` }}
                                    />
                                </div>
                            </div>
                            <div className="w-full max-w-sm">
                                <Select
                                    placeholder="Select a policy"
                                    selectedKey={settings.deletionPolicy}
                                    onSelectionChange={(key) => {
                                        if (key) {
                                            onSettingsChange({ ...settings, deletionPolicy: key as string });
                                        }
                                    }}
                                >
                                    <Label>Automatic Deletion Policy</Label>
                                    <Select.Trigger>
                                        <Select.Value />
                                        <Select.Indicator />
                                    </Select.Trigger>
                                    <Select.Popover>
                                        <ListBox>
                                            <ListBox.Item key="never" id="never" textValue="Never">Never</ListBox.Item>
                                            <ListBox.Item key="3m" id="3m" textValue="3 Months">3 Months</ListBox.Item>
                                            <ListBox.Item key="6m" id="6m" textValue="6 Months">6 Months</ListBox.Item>
                                            <ListBox.Item key="1y" id="1y" textValue="1 Year">1 Year</ListBox.Item>
                                        </ListBox>
                                    </Select.Popover>
                                </Select>
                                <p className="text-xs text-default-500 mt-1">Automatically delete old recordings to manage storage space.</p>
                            </div>
                        </Card.Content>
                        <Card.Footer>
                            <Button onPress={onSave} isPending={isSaving} variant="primary">
                                {isSaving ? <Spinner color="current" size="sm" /> : "Save Policy"}
                            </Button>
                        </Card.Footer>
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
