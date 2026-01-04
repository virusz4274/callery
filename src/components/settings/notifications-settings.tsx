
'use client';
import React from 'react';
import { Card, CardContent, CardFooter } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Label } from '@/components/ui/label';
import { Switch } from '@/components/ui/switch';
import { RadioGroup, RadioGroupItem } from '@/components/ui/radio-group';
import { Loader2 } from 'lucide-react';
import { SettingsPage } from './settings-page';

type NotificationSettingsState = {
    activityDigest: 'off' | 'weekly' | 'monthly';
    ingestSuccess: boolean;
    ingestFail: boolean;
};

interface NotificationsSettingsProps {
    settings: NotificationSettingsState;
    onSettingsChange: (newSettings: NotificationSettingsState) => void;
    onSave: () => Promise<void>;
    isSaving: boolean;
}

export function NotificationsSettings({ settings, onSettingsChange, onSave, isSaving }: NotificationsSettingsProps) {
    return (
        <SettingsPage title="Email Notifications" description="Choose which email notifications you want to receive.">
            <Card>
                <CardContent className="space-y-4">
                    <div>
                        <Label className="text-base">Activity Digest</Label>
                        <p className="text-sm text-muted-foreground pb-2">Receive a summary of your call activity.</p>
                        <RadioGroup 
                            value={settings.activityDigest} 
                            onValueChange={(value: 'off' | 'weekly' | 'monthly') => onSettingsChange({ ...settings, activityDigest: value })}
                            className="flex space-x-4"
                        >
                            <div className="flex items-center space-x-2">
                                <RadioGroupItem value="off" id="r1" />
                                <Label htmlFor="r1">Off</Label>
                            </div>
                            <div className="flex items-center space-x-2">
                                <RadioGroupItem value="weekly" id="r2" />
                                <Label htmlFor="r2">Weekly</Label>
                            </div>
                            <div className="flex items-center space-x-2">
                                <RadioGroupItem value="monthly" id="r3" />
                                <Label htmlFor="r3">Monthly</Label>
                            </div>
                        </RadioGroup>
                    </div>
                    <div className="flex items-center justify-between rounded-lg border p-4">
                        <div className="space-y-0.5">
                        <Label htmlFor="ingest-success" className="text-base">Ingestion Success</Label>
                        <p className="text-sm text-muted-foreground">
                            Receive an email when file ingestion completes successfully.
                        </p>
                        </div>
                        <Switch 
                            id="ingest-success" 
                            checked={settings.ingestSuccess}
                            onCheckedChange={(checked) => onSettingsChange({ ...settings, ingestSuccess: checked })}
                        />
                    </div>
                    <div className="flex items-center justify-between rounded-lg border p-4">
                        <div className="space-y-0.5">
                        <Label htmlFor="ingest-fail" className="text-base">Ingestion Failure</Label>
                        <p className="text-sm text-muted-foreground">
                            Receive an email if any files fail to ingest.
                        </p>
                        </div>
                        <Switch 
                            id="ingest-fail" 
                            checked={settings.ingestFail}
                            onCheckedChange={(checked) => onSettingsChange({ ...settings, ingestFail: checked })}
                        />
                    </div>
                </CardContent>
                <CardFooter>
                    <Button onClick={onSave} disabled={isSaving}>
                        {isSaving && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
                        Save Notifications
                    </Button>
                </CardFooter>
            </Card>
        </SettingsPage>
    );
}
