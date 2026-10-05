import { Card, Chip, ListBox, Select, Switch } from '@heroui/react';
import { AudioLines } from 'lucide-react';
import type { AvailableProvider } from '@/app/actions/transcription-providers';
import type { TranscriptionProvider } from '@/lib/config';

interface TranscriptionSettingsProps {
    autoTranscribe: boolean;
    defaultProvider?: TranscriptionProvider;
    providers: AvailableProvider[];
    onChange: (settings: { autoTranscribe: boolean; defaultProvider?: TranscriptionProvider }) => void;
}

export function TranscriptionSettingsCard({
    autoTranscribe,
    defaultProvider,
    providers,
    onChange
}: TranscriptionSettingsProps) {
    return (
        <Card className="rounded-[2rem] border border-default-200/80 bg-background/95 shadow-[0_20px_54px_-44px_rgba(15,23,42,0.45)]">
            <Card.Content className="space-y-5 p-5 sm:p-6">
                <div className="flex flex-wrap items-center gap-2">
                    <Chip size="sm" variant="soft" color="accent">AI processing</Chip>
                    <Chip size="sm" variant="soft" color={autoTranscribe ? 'success' : 'default'}>
                        {autoTranscribe ? 'Automatic' : 'Manual'}
                    </Chip>
                </div>

                <div className="rounded-xl border border-default-200/80 bg-default-50/70 p-4 sm:p-5">
                    <div className="flex flex-col gap-4 lg:flex-row lg:items-center lg:justify-between">
                        <div className="flex items-start gap-4">
                            <div className="flex h-12 w-12 shrink-0 items-center justify-center rounded-2xl bg-primary/10 text-primary">
                                <AudioLines className="h-5 w-5" />
                            </div>
                            <div className="space-y-2">
                                <h4 className="text-lg font-semibold tracking-[-0.03em] text-foreground">Auto-transcribe new recordings</h4>
                                <p className="max-w-2xl text-sm leading-6 text-default-500">
                                    Turn this on to generate transcripts as new calls arrive. This uses your monthly transcription allowance.
                                </p>
                            </div>
                        </div>
                        <Switch
                            isSelected={autoTranscribe}
                            onChange={(isSelected) => {
                                onChange({
                                    autoTranscribe: isSelected,
                                    defaultProvider,
                                });
                            }}
                            aria-label="Auto-Transcribe"
                        >
                            <Switch.Control>
                                <Switch.Thumb />
                            </Switch.Control>
                        </Switch>
                    </div>
                </div>

                {autoTranscribe && (
                    <div className="rounded-xl border border-default-200/80 bg-background p-4 sm:p-5">
                        <div className="flex flex-col gap-4 lg:flex-row lg:items-start lg:justify-between">
                            <div className="space-y-2">
                                <h4 className="text-base font-semibold text-foreground">Transcription provider</h4>
                                <p className="max-w-2xl text-sm leading-6 text-default-500">
                                    Balance speed, quality, and cost for default transcription jobs. These settings apply to future automated work.
                                </p>
                            </div>
                            <div className="w-full lg:w-72">
                                <Select
                                    aria-label="Default transcription provider"
                                    placeholder="Select a provider"
                                    selectedKey={defaultProvider || providers[0]?.id}
                                    onSelectionChange={(key) => {
                                        if (key) {
                                            onChange({
                                                autoTranscribe,
                                                defaultProvider: key as TranscriptionProvider,
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
                                                            {provider.description} · {provider.multiplier}x cost
                                                        </span>
                                                    </div>
                                                </ListBox.Item>
                                            ))}
                                        </ListBox>
                                    </Select.Popover>
                                </Select>
                            </div>
                        </div>
                    </div>
                )}
            </Card.Content>
        </Card>
    );
}
