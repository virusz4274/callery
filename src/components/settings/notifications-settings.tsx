
'use client';

import React from 'react';
import { Card, Button, Switch, RadioGroup, Radio, Spinner, Label } from '@heroui/react';
import { SettingsPage } from './settings-page';

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
        <SettingsPage title="Notifications" description="Manage your email notifications and alerts.">
            <Card className="bg-card/70 border-default-200">
                <Card.Content className="space-y-6">
                    <RadioGroup
                        value={settings.activityDigest}
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

                    <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4 rounded-lg border p-4">
                        <div className="space-y-0.5">
                            <h4 className="text-base font-medium">Data Ingestion Success</h4>
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
                    <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4 rounded-lg border p-4">
                        <div className="space-y-0.5">
                            <h4 className="text-base font-medium">Data Ingestion Failed</h4>
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
                <Card.Footer>
                    <Button onPress={onSave} isPending={isSaving} variant="primary">
                        {isSaving ? <Spinner color="current" size="sm" /> : "Save Notifications"}
                    </Button>
                </Card.Footer>
            </Card>
        </SettingsPage>
    );
}
