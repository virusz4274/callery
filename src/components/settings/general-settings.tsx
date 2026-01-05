
'use client';
import React from 'react';
import { Card, Button, Select, Label, ListBox, Spinner } from '@heroui/react';
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
            <Card className="bg-card/70 border-default-200">
                <Card.Content className="space-y-4">
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
                <Card.Footer>
                    <Button onPress={onSave} isPending={isSaving} variant="primary">
                        {isSaving ? <Spinner color="current" size="sm" /> : "Save Preferences"}
                    </Button>
                </Card.Footer>
            </Card>
        </SettingsPage>
    );
}
