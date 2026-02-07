
'use client';

import React, { useEffect, useState } from 'react';
import { Card, Button, Select, Switch, Spinner, Label, ListBox } from '@heroui/react';
import { GoogleIcon } from '@/components/icons/google-icon';
import { GoogleConnectDialog } from './google-connect-dialog';
import { SettingsPage } from './settings-page';
import type { User } from '@/lib/types';
import type { ExportJobResponse } from '@/lib/db/types';
import { Download, FileArchive, Loader2, Archive } from 'lucide-react';
import { getAvailableProviders, type AvailableProvider } from '@/app/actions/transcription-providers';

interface DataSettingsProps {
    userProfile: User | null;
    settings: {
        deletionPolicy: string;
        transcriptionSettings: { autoTranscribe: boolean; defaultProvider?: 'soniox' | 'elevenlabs' };
    };
    onSettingsChange: (newSettings: {
        deletionPolicy: string;
        transcriptionSettings: { autoTranscribe: boolean; defaultProvider?: 'soniox' | 'elevenlabs' };
    }) => void;
    onSave: () => Promise<void>;
    isSaving: boolean;
    onConnectGoogle: () => void;
    isSyncing: boolean;
    showConnectDialog: boolean;
    onDialogConfirm: () => void;
    onOpenChangeDialog: (open: boolean) => void;
    exportJob: ExportJobResponse | null;
    isExportStarting: boolean;
    onStartExport: () => void;
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
    exportJob,
    isExportStarting,
    onStartExport,
}: DataSettingsProps) {

    // Fetch available transcription providers
    const [providers, setProviders] = useState<AvailableProvider[]>([]);
    useEffect(() => {
        getAvailableProviders().then(setProviders).catch(console.error);
    }, []);

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

                            {settings.transcriptionSettings.autoTranscribe && (
                                <div className="flex flex-col sm:flex-row sm:items-start sm:justify-between gap-4 rounded-lg border p-4 bg-default-50/50">
                                    <div className="space-y-1">
                                        <h4 className="text-base font-medium">Transcription Model</h4>
                                        <p className="text-sm text-default-500 max-w-md">
                                            Choose the AI model used for transcription. Higher quality models may cost more.
                                        </p>
                                    </div>
                                    <div className="w-full sm:w-64">
                                        <Select
                                            aria-label="Transcription Provider"
                                            placeholder="Select a provider"
                                            selectedKey={settings.transcriptionSettings.defaultProvider || 'soniox'}
                                            onSelectionChange={(key) => {
                                                if (key) {
                                                    onSettingsChange({
                                                        ...settings,
                                                        transcriptionSettings: {
                                                            ...settings.transcriptionSettings,
                                                            defaultProvider: key as 'soniox' | 'elevenlabs'
                                                        }
                                                    });
                                                }
                                            }}
                                        >
                                            <Select.Trigger>
                                                <Select.Value />
                                                <Select.Indicator />
                                            </Select.Trigger>
                                            <Select.Popover>
                                                <ListBox>
                                                    {providers.map((provider) => (
                                                        <ListBox.Item key={provider.id} id={provider.id} textValue={provider.name}>
                                                            <div className="flex flex-col">
                                                                <span>{provider.name}</span>
                                                                <span className="text-xs text-default-400">
                                                                    {provider.description} &middot; {provider.multiplier}x Cost
                                                                </span>
                                                            </div>
                                                        </ListBox.Item>
                                                    ))}
                                                </ListBox>
                                            </Select.Popover>
                                        </Select>
                                    </div>
                                </div>
                            )}


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

                <SettingsPage title="Export Data" description="Download all your recordings and transcripts. Exports include a standalone offline viewer.">
                    <Card className="bg-card/70 border-default-200">
                        <Card.Content className="space-y-4">
                            <div className="flex flex-col gap-4 p-4 border rounded-lg bg-default-50/50">
                                <div className="flex items-start gap-3">
                                    <div className="p-2 bg-primary/10 rounded-lg text-primary">
                                        <Archive className="w-5 h-5" />
                                    </div>
                                    <div className="space-y-1">
                                        <h4 className="font-medium">Full Data Export</h4>
                                        <p className="text-sm text-default-500">
                                            Create a downloadable archive of all your data. Audio files are organized by contact and date.
                                            Includes a <b>premium offline viewer</b> to browse your history without an internet connection.
                                        </p>
                                    </div>
                                </div>

                                {exportJob && (
                                    <div className="mt-2 p-3 bg-default-100 rounded-lg space-y-3">
                                        <div className="flex justify-between text-sm">
                                            <span className="font-medium capitalize text-default-700">Status: {exportJob.status}</span>
                                            <span className="text-default-500">{new Date(exportJob.createdAt).toLocaleDateString()}</span>
                                        </div>

                                        {exportJob.status === 'processing' && (
                                            <div className="space-y-1">
                                                <div className="h-2 w-full bg-default-200 rounded-full overflow-hidden">
                                                    <div
                                                        className="h-full bg-primary transition-all duration-500 animate-pulse"
                                                        style={{ width: `${Math.max(5, exportJob.progress)}%` }}
                                                    />
                                                </div>
                                                <p className="text-xs text-default-500 text-right">{exportJob.progress}% processed</p>
                                            </div>
                                        )}

                                        {exportJob.status === 'failed' && (
                                            <p className="text-sm text-danger bg-danger/10 p-2 rounded">
                                                Error: {exportJob.error || 'Export failed'}
                                            </p>
                                        )}

                                        {exportJob.status === 'completed' && exportJob.parts && (
                                            <div className="space-y-2 pt-2 border-t border-default-200">
                                                <p className="text-sm font-medium">Download Links (Expire in 7 days):</p>
                                                <div className="grid gap-2 sm:grid-cols-2">
                                                    {exportJob.parts.map((part, i) => (
                                                        <a key={i} href={part.url} target="_blank" rel="noopener noreferrer" className="block">
                                                            <Button
                                                                size="sm"
                                                                variant="outline"
                                                                className="w-full flex items-center justify-center gap-2"
                                                            >
                                                                <Download className="w-4 h-4" />
                                                                Download Part {i + 1}
                                                            </Button>
                                                        </a>
                                                    ))}
                                                </div>
                                                <p className="text-xs text-default-400 mt-2">
                                                    Tip: Extract all parts into the same folder.
                                                </p>
                                            </div>
                                        )}
                                    </div>
                                )}
                            </div>
                        </Card.Content>
                        <Card.Footer className="justify-between">
                            <p className="text-xs text-default-400">
                                Exports may take a while for large libraries. You will be notified via email.
                            </p>
                            <Button
                                onPress={onStartExport}
                                isDisabled={isExportStarting || exportJob?.status === 'pending' || exportJob?.status === 'processing'}
                                variant="primary"
                            >
                                {isExportStarting ? (
                                    <div className="flex items-center gap-2">
                                        <Spinner size="sm" color="current" />
                                        <span>Starting...</span>
                                    </div>
                                ) : (
                                    exportJob?.status === 'processing' ? 'Processing...' : 'Start New Export'
                                )}
                            </Button>
                        </Card.Footer>
                    </Card>
                </SettingsPage>
            </div >
            {showConnectDialog && (
                <GoogleConnectDialog
                    onOpenChange={onOpenChangeDialog}
                    onConfirm={onDialogConfirm}
                />
            )
            }
        </>
    );
}

