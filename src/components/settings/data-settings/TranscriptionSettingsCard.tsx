import { Card, Switch, Select, ListBox } from '@heroui/react';
import type { AvailableProvider } from '@/app/actions/transcription-providers';

interface TranscriptionSettingsProps {
    autoTranscribe: boolean;
    defaultProvider?: 'soniox' | 'elevenlabs';
    providers: AvailableProvider[];
    onChange: (settings: { autoTranscribe: boolean; defaultProvider?: 'soniox' | 'elevenlabs' }) => void;
}

export function TranscriptionSettingsCard({
    autoTranscribe,
    defaultProvider,
    providers,
    onChange
}: TranscriptionSettingsProps) {
    return (
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
                        isSelected={autoTranscribe}
                        onChange={(isSelected) => {
                            onChange({
                                autoTranscribe: isSelected,
                                defaultProvider
                            });
                        }}
                        aria-label="Auto-Transcribe"
                    >
                        <Switch.Control>
                            <Switch.Thumb />
                        </Switch.Control>
                    </Switch>
                </div>

                {autoTranscribe && (
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
                                selectedKey={defaultProvider || 'soniox'}
                                onSelectionChange={(key) => {
                                    if (key) {
                                        onChange({
                                            autoTranscribe,
                                            defaultProvider: key as 'soniox' | 'elevenlabs'
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
            {/* Note: Save button is handled by parent to save all settings at once */}
        </Card>
    );
}
