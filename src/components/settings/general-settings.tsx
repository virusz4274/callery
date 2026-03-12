'use client';
import React from 'react';
import { Button, Card, Chip, Label, ListBox, Select, Spinner, Surface } from '@heroui/react';
import { Clock3, Globe2 } from 'lucide-react';
import { SettingsPage } from './settings-page';

const timezones = [
    { value: 'Etc/GMT+12', label: '(GMT-12:00) International Date Line West' },
    { value: 'Pacific/Midway', label: '(GMT-11:00) Midway Island, Samoa' },
    { value: 'Pacific/Honolulu', label: '(GMT-10:00) Hawaii' },
    { value: 'US/Alaska', label: '(GMT-09:00) Alaska' },
    { value: 'America/Los_Angeles', label: '(GMT-08:00) Pacific Time (US & Canada)' },
    { value: 'America/Tijuana', label: '(GMT-08:00) Tijuana, Baja California' },
    { value: 'America/Denver', label: '(GMT-07:00) Mountain Time (US & Canada)' },
    { value: 'America/Phoenix', label: '(GMT-07:00) Arizona' },
    { value: 'America/Chicago', label: '(GMT-06:00) Central Time (US & Canada)' },
    { value: 'America/New_York', label: '(GMT-05:00) Eastern Time (US & Canada)' },
    { value: 'America/Caracas', label: '(GMT-04:30) Caracas' },
    { value: 'America/Halifax', label: '(GMT-04:00) Atlantic Time (Canada)' },
    { value: 'America/Sao_Paulo', label: '(GMT-03:00) Brasilia' },
    { value: 'Atlantic/South_Georgia', label: '(GMT-02:00) Mid-Atlantic' },
    { value: 'Atlantic/Azores', label: '(GMT-01:00) Azores' },
    { value: 'Europe/London', label: '(GMT+00:00) London, Lisbon, Dublin' },
    { value: 'Europe/Berlin', label: '(GMT+01:00) Amsterdam, Berlin, Rome, Paris' },
    { value: 'Europe/Helsinki', label: '(GMT+02:00) Helsinki, Kyiv, Riga, Sofia' },
    { value: 'Asia/Istanbul', label: '(GMT+03:00) Istanbul, Moscow, St. Petersburg' },
    { value: 'Asia/Dubai', label: '(GMT+04:00) Abu Dhabi, Muscat' },
    { value: 'Asia/Kolkata', label: '(GMT+05:30) Chennai, Kolkata, Mumbai, New Delhi' },
    { value: 'Asia/Bangkok', label: '(GMT+07:00) Bangkok, Hanoi, Jakarta' },
    { value: 'Asia/Tokyo', label: '(GMT+09:00) Osaka, Sapporo, Tokyo' },
    { value: 'Australia/Sydney', label: '(GMT+10:00) Sydney, Melbourne' },
    { value: 'Pacific/Auckland', label: '(GMT+12:00) Auckland, Wellington' },
];

interface GeneralSettingsProps {
    settings: { timezone: string };
    onSettingsChange: (newSettings: { timezone: string }) => void;
    onSave: () => Promise<void>;
    isSaving: boolean;
}

export function GeneralSettings({ settings, onSettingsChange, onSave, isSaving }: GeneralSettingsProps) {
    return (
        <SettingsPage title="Localization" description="Set your preferred language and timezone for date and time display.">
            <Card className="rounded-[1.6rem] border border-default-200/80 bg-background/90 shadow-[0_20px_54px_-42px_rgba(15,23,42,0.4)]">
                <Card.Content className="space-y-5 p-5 md:p-6">
                    <div className="flex flex-wrap items-center gap-2">
                        <Chip variant="soft" color="accent">
                            Workspace defaults
                        </Chip>
                        <Chip variant="soft" color="default">
                            Current timezone: {settings.timezone || 'Not set'}
                        </Chip>
                    </div>

                    <div className="grid gap-3 md:grid-cols-2">
                        <Surface variant="secondary" className="rounded-[1.2rem] border border-default-200/80 p-4">
                            <div className="flex items-start gap-3">
                                <div className="rounded-2xl bg-accent/10 p-2.5 text-accent">
                                    <Clock3 className="h-4 w-4" />
                                </div>
                                <div>
                                    <div className="font-semibold text-foreground">Timezone controls timestamps</div>
                                    <p className="mt-1 text-sm leading-6 text-default-500">
                                        Recording dates, exports, and activity views become easier to reason about when the workspace matches your real operating timezone.
                                    </p>
                                </div>
                            </div>
                        </Surface>
                        <Surface variant="secondary" className="rounded-[1.2rem] border border-default-200/80 p-4">
                            <div className="flex items-start gap-3">
                                <div className="rounded-2xl bg-default-100 p-2.5 text-default-500">
                                    <Globe2 className="h-4 w-4" />
                                </div>
                                <div>
                                    <div className="font-semibold text-foreground">Good default for teams</div>
                                    <p className="mt-1 text-sm leading-6 text-default-500">
                                        If you mostly work in one region, keep that local timezone here even if you travel.
                                    </p>
                                </div>
                            </div>
                        </Surface>
                    </div>

                    <Select
                        placeholder="Select a timezone"
                        selectedKey={settings.timezone}
                        onSelectionChange={(key) => {
                            // key is Key (string | number)
                            if (key) {
                                onSettingsChange({ ...settings, timezone: key as string });
                            }
                        }}
                    >
                        <Label>Timezone</Label>
                        <Select.Trigger>
                            <Select.Value />
                            <Select.Indicator />
                        </Select.Trigger>
                        <Select.Popover>
                            <ListBox>
                                {timezones.map(tz => (
                                    <ListBox.Item key={tz.value} id={tz.value} textValue={tz.label}>
                                        {tz.label}
                                    </ListBox.Item>
                                ))}
                            </ListBox>
                        </Select.Popover>
                    </Select>
                </Card.Content>
                <Card.Footer className="justify-end border-t border-default-100/80 px-5 py-4 md:px-6">
                    <Button onPress={onSave} isPending={isSaving} variant="primary" className="rounded-full px-5 font-semibold">
                        {isSaving ? <Spinner color="current" size="sm" /> : "Save Preferences"}
                    </Button>
                </Card.Footer>
            </Card>
        </SettingsPage>
    );
}
