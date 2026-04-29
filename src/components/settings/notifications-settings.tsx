'use client';

import React from 'react';
import { Button, Card, Chip, Label, Radio, RadioGroup, Spinner, Surface, Switch } from '@heroui/react';
import { BellRing, CircleCheck, TriangleAlert } from 'lucide-react';
import { SettingsSection } from './settings-section';

interface NotificationsSettingsProps {
    settings: {
        activityDigest: 'off' | 'weekly' | 'monthly';
        ingestSuccess: boolean;
        ingestFail: boolean;
    };
    onSettingsChange: (newSettings: {
        activityDigest: 'off' | 'weekly' | 'monthly';
        ingestSuccess: boolean;
        ingestFail: boolean;
    }) => void;
    onSave: () => Promise<void>;
    isSaving: boolean;
}

export function NotificationsSettings({ settings, onSettingsChange, onSave, isSaving }: NotificationsSettingsProps) {
    return (
        <SettingsSection title="Notifications" description="Manage your email notifications and alerts.">
            <Card className="rounded-[1.6rem] border border-default-200/80 bg-background/90 shadow-[0_20px_54px_-42px_rgba(15,23,42,0.4)]">
                <Card.Content className="space-y-6 p-5 md:p-6">
                    <div className="flex flex-wrap items-center gap-2">
                        <Chip variant="soft" color="accent">
                            Email preferences
                        </Chip>
                        <Chip variant="soft" color="default">
                            Digest: {settings.activityDigest}
                        </Chip>
                    </div>

                    <Surface variant="secondary" className="rounded-[1.2rem] border border-default-200/80 p-4">
                        <div className="flex items-start gap-3">
                            <div className="rounded-2xl bg-accent/10 p-2.5 text-accent">
                                <BellRing className="h-4 w-4" />
                            </div>
                            <div>
                                <div className="font-semibold text-foreground">Choose signal over noise</div>
                                <p className="mt-1 text-sm leading-6 text-default-500">
                                    Use digests for routine updates and reserve immediate alerts for success or failure events that matter operationally.
                                </p>
                            </div>
                        </div>
                    </Surface>

                    <RadioGroup
                        defaultValue={settings.activityDigest}
                        onChange={(value) => onSettingsChange({ ...settings, activityDigest: value as 'off' | 'weekly' | 'monthly' })}
                    >
                        <Label>Activity Digest</Label>
                        <Radio value="off">
                            <Radio.Control><Radio.Indicator /></Radio.Control>
                            <Radio.Content><Label>Off</Label></Radio.Content>
                        </Radio>
                        <Radio value="weekly">
                            <Radio.Control><Radio.Indicator /></Radio.Control>
                            <Radio.Content><Label>Weekly</Label></Radio.Content>
                        </Radio>
                        <Radio value="monthly">
                            <Radio.Control><Radio.Indicator /></Radio.Control>
                            <Radio.Content><Label>Monthly</Label></Radio.Content>
                        </Radio>
                    </RadioGroup>

                    <div className="flex flex-col gap-4 rounded-[1.2rem] border border-default-200/80 bg-default-50/60 p-4 sm:flex-row sm:items-center sm:justify-between">
                        <div className="space-y-0.5">
                            <div className="flex items-center gap-2 text-base font-medium text-foreground">
                                <CircleCheck className="h-4 w-4 text-success" />
                                Data ingestion success
                            </div>
                            <p className="text-sm text-default-500">
                                Receive an email when new data is successfully processed.
                            </p>
                        </div>
                        <Switch
                            isSelected={settings.ingestSuccess}
                            onChange={(checked) => onSettingsChange({ ...settings, ingestSuccess: checked })}
                        >
                            <Switch.Control>
                                <Switch.Thumb />
                            </Switch.Control>
                        </Switch>
                    </div>
                    <div className="flex flex-col gap-4 rounded-[1.2rem] border border-default-200/80 bg-default-50/60 p-4 sm:flex-row sm:items-center sm:justify-between">
                        <div className="space-y-0.5">
                            <div className="flex items-center gap-2 text-base font-medium text-foreground">
                                <TriangleAlert className="h-4 w-4 text-warning" />
                                Data ingestion failed
                            </div>
                            <p className="text-sm text-default-500">
                                Receive an alert if data processing fails.
                            </p>
                        </div>
                        <Switch
                            isSelected={settings.ingestFail}
                            onChange={(checked) => onSettingsChange({ ...settings, ingestFail: checked })}
                        >
                            <Switch.Control>
                                <Switch.Thumb />
                            </Switch.Control>
                        </Switch>
                    </div>
                </Card.Content>
                <Card.Footer className="justify-end border-t border-default-100/80 px-5 py-4 md:px-6">
                    <Button onPress={onSave} isPending={isSaving} variant="primary" className="rounded-full px-5 font-semibold">
                        {isSaving ? <Spinner color="current" size="sm" /> : "Save Notifications"}
                    </Button>
                </Card.Footer>
            </Card>
        </SettingsSection>
    );
}
