'use client';

import { useEffect, useState } from 'react';
import { Button, Spinner } from '@heroui/react';
import { GoogleConnectDialog } from './google-connect-dialog';
import { SettingsSection } from './settings-section';
import type { User } from '@/lib/types';
import type { ExportJobResponse } from '@/lib/db/types';
import { getAvailableProviders, type AvailableProvider } from '@/app/actions/transcription-providers';

import { GoogleConnectCard } from './data-settings/GoogleConnectCard';
import { TranscriptionSettingsCard } from './data-settings/TranscriptionSettingsCard';
import { UsageStorageCard } from './data-settings/UsageStorageCard';
import { ExportDataCard } from './data-settings/ExportDataCard';
import { useTeamPolicy } from '@/hooks/use-team-policy';

interface DataSettingsProps {
    mode: 'sources' | 'processing' | 'retention' | 'export';
    userProfile: User | null;
    settings: {
        deletionPolicy: string;
        transcriptionSettings: { autoTranscribe: boolean; defaultProvider?: User['transcriptionSettings']['defaultProvider'] };
    };
    onSettingsChange: (newSettings: {
        deletionPolicy: string;
        transcriptionSettings: { autoTranscribe: boolean; defaultProvider?: User['transcriptionSettings']['defaultProvider'] };
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
    const team = useTeamPolicy();

    // Fetch available transcription providers
    const [providers, setProviders] = useState<AvailableProvider[]>([]);
    useEffect(() => {
        getAvailableProviders().then(setProviders).catch(console.error);
    }, []);

    return (
        <>
            <div className="space-y-6">
                {mode === 'sources' && (
                <SettingsSection title="Sources">
                    <GoogleConnectCard
                        googleSync={userProfile?.googleSync}
                        isSyncing={isSyncing}
                        isDisconnecting={isDisconnecting}
                        onConnect={onConnectGoogle}
                        onDisconnect={onDisconnectGoogle}
                    />
                </SettingsSection>
                )}

                {team && (mode === 'processing' || mode === 'retention') && <SettingsSection title={mode === 'processing' ? 'Company processing policy' : 'Company retention policy'}>
                    <p className="text-sm text-muted">These settings are managed by the administrator of {team.companyName}.</p>
                    <p>{mode === 'processing' ? `Transcription: ${team.transcriptionMode}${team.transcriptionMode !== 'off' ? ` (${team.transcriptionProvider})` : ''}` : `Recordings are kept ${team.retentionPolicy === 'never' ? 'until the administrator deletes them' : `for ${team.retentionPolicy === '3m' ? 'three months' : team.retentionPolicy === '6m' ? 'six months' : 'one year'}`}.`}</p>
                </SettingsSection>}
                {!team && mode === 'processing' && (
                <SettingsSection title="Processing">
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
                </SettingsSection>
                )}

                {!team && mode === 'retention' && (
                <SettingsSection title="Retention">
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
                </SettingsSection>
                )}

                {mode === 'export' && (
                <SettingsSection title="Export">
                    <ExportDataCard
                        exportJob={exportJob}
                        isExportStarting={isExportStarting}
                        onStartExport={onStartExport}
                    />
                </SettingsSection>
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
