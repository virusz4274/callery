
'use client';

import React from 'react';
import { Card, Button, Select, Switch, Spinner, Label, ListBox } from '@heroui/react';
import { GoogleIcon } from '@/components/icons/google-icon';
import { GoogleConnectDialog } from './google-connect-dialog';
import { SettingsPage } from './settings-page';
import type { User } from '@/lib/types';

interface DataSettingsProps {
    userProfile: User | null;
    settings: {
        deletionPolicy: string;
        transcriptionSettings: { autoTranscribe: boolean };
    };
    onSettingsChange: (newSettings: {
        deletionPolicy: string;
        transcriptionSettings: { autoTranscribe: boolean };
    }) => void;
    onSave: () => Promise<void>;
    isSaving: boolean;
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
    onConnectGoogle,
    isSyncing,
    showConnectDialog,
    onDialogConfirm,
    onOpenChangeDialog,
}: DataSettingsProps) {


    const storageUsed = userProfile?.storageUsed || 0;
    const storageAllocation = userProfile?.storageAllocation || 1; // Prevent div by zero
    const storagePercentage = (storageUsed / storageAllocation) * 100;

    // Unit Conversion: Used is in seconds, Allocation is in minutes.
    // We convert everything to minutes for display and percentage calculation.
    const transcriptionUsedSeconds = userProfile?.transcriptionUsed || 0;
    const transcriptionUsedMinutes = transcriptionUsedSeconds / 60;
    const transcriptionAllocationSeconds = userProfile?.transcriptionAllocation || 3600; // Default 60 mins (3600s)
    const transcriptionAllocationMinutes = transcriptionAllocationSeconds / 60;

    // Prevent division by zero and cap at 100% just for visual bar (though value can exceed)
    const transcriptionPercentage = (transcriptionUsedMinutes / transcriptionAllocationMinutes) * 100;

    return (
        <>
            <div className="space-y-6">
                <SettingsPage title="Data Sources" description="Manage where your call data comes from. Connect your Google account or manually upload recordings.">
                    <Card className="bg-card/70 border-default-200">
                        <Card.Content className="space-y-4">
                            <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4 rounded-lg border p-4">
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
                                    className="w-full sm:w-auto"
                                >
                                    {isSyncing ? (
                                        <Spinner size="sm" />
                                    ) : (
                                        <GoogleIcon className="mr-2 h-4 w-4" />
                                    )}
                                    Connect
                                </Button>
                            </div>

                        </Card.Content>
                    </Card>
                </SettingsPage>

                <SettingsPage title="Data Processing" description="Manage how your recordings are transcribed and analyzed.">
                    <Card className="bg-card/70 border-default-200">
                        <Card.Content className="space-y-6">
                            <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4 rounded-lg border p-4">
                                <div className="space-y-0.5">
                                    <h4 className="text-base font-medium">Auto-Transcribe New Recordings</h4>
                                    <p className="text-sm text-default-500">
                                        Automatically generate a transcript when a new recording is ingested. This counts toward your monthly quota.
                                    </p>
                                </div>
                                <Switch
                                    isSelected={settings.transcriptionSettings.autoTranscribe}
                                    onChange={(isSelected) => {
                                        onSettingsChange({
                                            ...settings,
                                            transcriptionSettings: { ...settings.transcriptionSettings, autoTranscribe: isSelected }
                                        });
                                    }}
                                    aria-label="Auto-Transcribe"
                                >
                                    <Switch.Control>
                                        <Switch.Thumb />
                                    </Switch.Control>
                                </Switch>
                            </div>


                        </Card.Content>
                        <Card.Footer>
                            <Button onPress={onSave} isPending={isSaving} variant="primary">
                                {isSaving ? <Spinner color="current" size="sm" /> : "Save Settings"}
                            </Button>
                        </Card.Footer>
                    </Card>
                </SettingsPage>

                <SettingsPage title="Usage & Storage" description="View your data limits and manage retention policies.">
                    <Card className="bg-card/70 border-default-200">
                        <Card.Content className="space-y-6">
                            {/* Transcription Usage */}
                            <div>
                                <h4 className="font-medium mb-2">Transcription Usage</h4>
                                <p className="text-sm text-default-500 mb-2">
                                    You have used {transcriptionUsedMinutes.toFixed(1)} minutes of {transcriptionAllocationMinutes} minutes.
                                </p>
                                {/* Custom Progress Bar */}
                                <div className="h-2 w-full bg-default-100 rounded-full overflow-hidden">
                                    <div
                                        className={`h-full transition-all duration-500 ${transcriptionPercentage > 90 ? "bg-danger" : "bg-primary"}`}
                                        style={{ width: `${Math.min(transcriptionPercentage, 100)}%` }}
                                    />
                                </div>
                            </div>

                            <div>
                                <h4 className="font-medium mb-2">Storage Usage</h4>
                                <p className="text-sm text-default-500 mb-2">
                                    You are currently using {((storageUsed) / (1024 * 1024 * 1024)).toFixed(2)} GB of {((storageAllocation) / (1024 * 1024 * 1024)).toFixed(0)} GB.
                                </p>
                                {/* Custom Progress Bar */}
                                <div className="h-2 w-full bg-default-100 rounded-full overflow-hidden">
                                    <div
                                        className={`h-full transition-all duration-500 ${storagePercentage > 90 ? "bg-danger" : "bg-primary"}`}
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

