'use client';

import { Button, Card, Label, Radio, RadioGroup, Switch } from '@heroui/react';
import { SettingsSection } from './settings-section';
import { PushNotificationToggle } from '@/components/notifications/push-notification-toggle';

interface NotificationsSettingsProps {
    settings: { activityDigest: 'off' | 'weekly' | 'monthly'; ingestSuccess: boolean; ingestFail: boolean };
    onSettingsChange: (settings: NotificationsSettingsProps['settings']) => void;
    onSave: () => Promise<void>;
    isSaving: boolean;
}

export function NotificationsSettings({ settings, onSettingsChange, onSave, isSaving }: NotificationsSettingsProps) {
    return (
        <div className="space-y-6">
            <SettingsSection title="Browser notifications">
                <PushNotificationToggle />
            </SettingsSection>
            <SettingsSection title="Email notifications">
                <Card className="gap-0 rounded-xl border border-border bg-surface p-0 shadow-none">
                    <Card.Content className="space-y-5 p-4 md:p-5">
                        <RadioGroup value={settings.activityDigest} aria-label="Activity digest" isDisabled={isSaving}
                            onChange={(value) => onSettingsChange({ ...settings, activityDigest: value as 'off' | 'weekly' | 'monthly' })}>
                            <Label>Activity digest</Label>
                            {(['off', 'weekly', 'monthly'] as const).map((value) => <Radio key={value} value={value} className="min-h-11">
                                <Radio.Content className="min-h-11">
                                    <Radio.Control><Radio.Indicator /></Radio.Control>
                                    <Label>{value.charAt(0).toUpperCase() + value.slice(1)}</Label>
                                </Radio.Content>
                            </Radio>)}
                        </RadioGroup>
                        <div className="flex min-h-11 items-center justify-between gap-4 border-t border-border pt-4">
                            <span className="text-sm font-medium">Data processed successfully</span>
                            <Switch className="min-h-11 shrink-0" aria-label="Email when data is processed successfully" isSelected={settings.ingestSuccess} isDisabled={isSaving}
                                onChange={(checked) => onSettingsChange({ ...settings, ingestSuccess: checked })}>
                                <Switch.Content className="min-h-11 min-w-11 justify-center"><Switch.Control><Switch.Thumb /></Switch.Control></Switch.Content>
                            </Switch>
                        </div>
                        <div className="flex min-h-11 items-center justify-between gap-4">
                            <span className="text-sm font-medium">Data processing failed</span>
                            <Switch className="min-h-11 shrink-0" aria-label="Email when data processing fails" isSelected={settings.ingestFail} isDisabled={isSaving}
                                onChange={(checked) => onSettingsChange({ ...settings, ingestFail: checked })}>
                                <Switch.Content className="min-h-11 min-w-11 justify-center"><Switch.Control><Switch.Thumb /></Switch.Control></Switch.Content>
                            </Switch>
                        </div>
                    </Card.Content>
                    <Card.Footer className="justify-end border-t border-border p-4">
                        <Button onPress={onSave} isPending={isSaving} variant="primary" className="min-h-11 rounded-lg">Save preferences</Button>
                    </Card.Footer>
                </Card>
            </SettingsSection>
        </div>
    );
}
