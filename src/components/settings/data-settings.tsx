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
    mode: 'sources' | 'processing' | 'retention' | 'export';
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
    onDisconnectGoogle: () => void;
    isSyncing: boolean;
    isDisconnecting: boolean;
    showConnectDialog: boolean;
    onDialogConfirm: () => void;
    onOpenChangeDialog: (open: boolean) => void;
    exportJob: ExportJobResponse | null;
    isExportStarting: boolean;
    onStartExport: () => void;
}

export function DataSettings({
    mode,
    userProfile,
    settings,
    onSettingsChange,
    onSave,
    isSaving,
    onConnectGoogle,
    onDisconnectGoogle,
    isSyncing,
    isDisconnecting,
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
                {mode === 'sources' && (
                <SettingsPage title="Sources" description="Connect or review the services that supply contacts and incoming data.">
                    <GoogleConnectCard
                        googleSync={userProfile?.googleSync}
                        isSyncing={isSyncing}
                        isDisconnecting={isDisconnecting}
                        onConnect={onConnectGoogle}
                        onDisconnect={onDisconnectGoogle}
                    />
                </SettingsPage>
                )}

                {mode === 'processing' && (
                <SettingsPage title="Processing" description="Choose how new recordings are transcribed and which provider runs automated jobs.">
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
                )}

                {mode === 'retention' && (
                <SettingsPage title="Retention" description="Track storage and transcription usage, then tune how aggressively old recordings are removed.">
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
                )}

                {mode === 'export' && (
                <SettingsPage title="Export" description="Create a portable archive of recordings, transcripts, metadata, and the offline viewer.">
                    <ExportDataCard
                        exportJob={exportJob}
                        isExportStarting={isExportStarting}
                        onStartExport={onStartExport}
                    />
                </SettingsPage>
                )}
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
