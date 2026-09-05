'use client';

import { useState, useTransition } from 'react';
import { Card, Button, Switch, Select, ListBox, Label } from '@heroui/react';
import { SystemSettingsResponse, PlanResponse } from '@/lib/db/types';
import { updateSystemSettings } from '@/app/actions/admin-settings';
import { useRouter } from 'next/navigation';

type SettingsFormProps = {
    settings: SystemSettingsResponse;
    plans: PlanResponse[];
};

export function SettingsForm({ settings, plans }: SettingsFormProps) {
    const router = useRouter();
    const [isPending, startTransition] = useTransition();

    const [allowSignups, setAllowSignups] = useState(settings.allowSignups);
    const [maintenanceMode, setMaintenanceMode] = useState(settings.maintenanceMode);
    const [defaultPlanId, setDefaultPlanId] = useState(settings.defaultPlanId || '');
    const [sonioxMultiplier, setSonioxMultiplier] = useState(
        settings.transcriptionMultipliers?.soniox ?? 1.0
    );
    const [elevenlabsMultiplier, setElevenlabsMultiplier] = useState(
        settings.transcriptionMultipliers?.elevenlabs ?? 6.0
    );

    const handleSave = () => {
        startTransition(async () => {
            try {
                await updateSystemSettings({
                    allowSignups,
                    maintenanceMode,
                    defaultPlanId: defaultPlanId || undefined,
                    transcriptionMultipliers: {
                        soniox: sonioxMultiplier,
                        elevenlabs: elevenlabsMultiplier,
                    },
                });
                alert('Settings updated successfully');
                router.refresh();
            } catch (error) {
                console.error('Failed to update settings:', error);
                alert('Failed to update settings');
            }
        });
    };

    return (
        <div className="max-w-3xl space-y-6">
            <Card className="space-y-6 rounded-[2rem] border border-default-200/80 p-6 shadow-[0_20px_54px_-44px_rgba(15,23,42,0.45)]">
                <div>
                    <h3 className="text-lg font-semibold mb-4">Access Control</h3>
                    <div className="flex flex-col gap-4">
                        <div className="flex justify-between items-center">
                            <div>
                                <p className="font-medium">Allow New Signups</p>
                                <p className="text-sm text-default-500">When disabled, new users cannot register.</p>
                            </div>
                            {/* Switch onChange apparently returns boolean directly based on lint error */}
                            <Switch isSelected={allowSignups} onChange={setAllowSignups}>
                                <Switch.Control>
                                    <Switch.Thumb />
                                </Switch.Control>
                            </Switch>
                        </div>

                        <hr className="border-default-200" />

                        <div className="flex justify-between items-center">
                            <div>
                                <p className="font-medium">Maintenance Mode</p>
                                <p className="text-sm text-default-500">
                                    When enabled, the application is accessible only to admins.
                                    <br /><span className="text-warning text-xs">Be careful with this setting.</span>
                                </p>
                            </div>
                            <Switch isSelected={maintenanceMode} onChange={setMaintenanceMode} className="text-warning">
                                <Switch.Control>
                                    <Switch.Thumb />
                                </Switch.Control>
                            </Switch>
                        </div>
                    </div>
                </div>

                <hr className="border-default-200" />

                <div>
                    <h3 className="text-lg font-semibold mb-4">Onboarding Defaults</h3>
                    <div className="grid gap-4 max-w-md">
                        <div className="flex flex-col gap-2">
                            <Label className="text-sm font-medium">Default Plan for New Users</Label>
                            <Select
                                selectedKey={defaultPlanId}
                                onSelectionChange={(key) => setDefaultPlanId(key as string)}
                                placeholder="Select a plan"
                            >
                                <Label>Default Plan</Label>
                                <Select.Trigger>
                                    <Select.Value />
                                    <Select.Indicator />
                                </Select.Trigger>
                                <Select.Popover>
                                    <ListBox>
                                        <ListBox.Item key="" id="" textValue="None">None</ListBox.Item>
                                        {plans.filter(p => p.isActive).map((plan) => (
                                            <ListBox.Item key={plan.id} id={plan.id} textValue={plan.name}>
                                                {plan.name} ({plan.price === 0 ? 'Free' : `$${plan.price}`})
                                            </ListBox.Item>
                                        ))}
                                    </ListBox>
                                </Select.Popover>
                            </Select>
                        </div>
                        <p className="text-xs text-default-500">
                            New users will automatically be assigned to this plan upon registration.
                        </p>
                    </div>
                </div>

                <hr className="border-default-200" />

                <div>
                    <h3 className="text-lg font-semibold mb-4">Transcription Billing</h3>
                    <p className="text-sm text-default-500 mb-4">
                        Set the cost multipliers for each transcription provider. A 10-minute file transcribed with a 6x multiplier will consume 60 minutes of quota.
                    </p>
                    <div className="grid gap-4 sm:grid-cols-2 max-w-md">
                        <div className="flex flex-col gap-2">
                            <Label className="text-sm font-medium">Soniox Multiplier</Label>
                            <input
                                type="number"
                                min={0.1}
                                step={0.1}
                                value={sonioxMultiplier}
                                onChange={(e) => setSonioxMultiplier(parseFloat(e.target.value) || 1.0)}
                                placeholder="1.0"
                                className="px-3 py-2 rounded-md border border-default-200 bg-default-100 text-sm focus:outline-none focus:ring-2 focus:ring-primary"
                            />
                        </div>
                        <div className="flex flex-col gap-2">
                            <Label className="text-sm font-medium">ElevenLabs Multiplier</Label>
                            <input
                                type="number"
                                min={0.1}
                                step={0.1}
                                value={elevenlabsMultiplier}
                                onChange={(e) => setElevenlabsMultiplier(parseFloat(e.target.value) || 6.0)}
                                placeholder="6.0"
                                className="px-3 py-2 rounded-md border border-default-200 bg-default-100 text-sm focus:outline-none focus:ring-2 focus:ring-primary"
                            />
                        </div>
                    </div>
                </div>

                <div className="flex justify-end pt-4">
                    <Button
                        onPress={handleSave}
                        variant="primary" className="rounded-full px-6 font-semibold"
                        isDisabled={isPending}
                    >
                        {isPending ? 'Saving...' : 'Save Changes'}
                    </Button>
                </div>
            </Card>
        </div>
    );
}
