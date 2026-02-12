'use client';

import React, { useEffect, useState } from 'react';
import { Button, Spinner } from '@heroui/react';
import { GoogleConnectDialog } from './google-connect-dialog';
import { SettingsPage } from './settings-page';
import type { User } from '@/lib/types';
import type { ExportJobResponse } from '@/lib/db/types';
import { getAvailableProviders, type AvailableProvider } from '@/app/actions/transcription-providers';

import { GoogleConnectCard } from './data-settings/GoogleConnectCard';
import { TranscriptionSettingsCard } from './data-settings/TranscriptionSettingsCard';
import { UsageStorageCard } from './data-settings/UsageStorageCard';
import { ExportDataCard } from './data-settings/ExportDataCard';

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

    return (
        <>
            <div className="space-y-6">
                <SettingsPage title="Data Sources" description="Manage where your call data comes from. Connect your Google account or manually upload recordings.">
                    <GoogleConnectCard isSyncing={isSyncing} onConnect={onConnectGoogle} />
                </SettingsPage>

                <SettingsPage title="Data Processing" description="Manage how your recordings are transcribed and analyzed.">
                    <TranscriptionSettingsCard
                        autoTranscribe={settings.transcriptionSettings.autoTranscribe}
                        defaultProvider={settings.transcriptionSettings.defaultProvider}
                        providers={providers}
                        onChange={(newSettings) => {
                            onSettingsChange({
                                ...settings,
                                transcriptionSettings: newSettings
                            });
                        }}
                    />
                    <div className="mt-4 flex justify-end">
                        <Button onPress={onSave} isPending={isSaving} variant="primary">
                            {isSaving ? <Spinner color="current" size="sm" /> : "Save Settings"}
                        </Button>
                    </div>
                </SettingsPage>

                <SettingsPage title="Usage & Storage" description="View your data limits and manage retention policies.">
                    <UsageStorageCard
                        userProfile={userProfile}
                        deletionPolicy={settings.deletionPolicy}
                        onPolicyChange={(policy) => {
                            onSettingsChange({ ...settings, deletionPolicy: policy });
                        }}
                    />
                    <div className="mt-4 flex justify-end">
                        <Button onPress={onSave} isPending={isSaving} variant="primary">
                            {isSaving ? <Spinner color="current" size="sm" /> : "Save Policy"}
                        </Button>
                    </div>
                </SettingsPage>

                <SettingsPage title="Export Data" description="Download all your recordings and transcripts. Exports include a standalone offline viewer.">
                    <ExportDataCard
                        exportJob={exportJob}
                        isExportStarting={isExportStarting}
                        onStartExport={onStartExport}
                    />
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
