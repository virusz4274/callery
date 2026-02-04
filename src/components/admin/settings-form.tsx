'use client';

import React, { useState, useTransition } from 'react';
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

    const handleSave = () => {
        startTransition(async () => {
            try {
                await updateSystemSettings({
                    allowSignups,
                    maintenanceMode,
                    // eslint-disable-next-line @typescript-eslint/no-explicit-any
                    defaultPlanId: (defaultPlanId || undefined) as any
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
        <div className="space-y-6 max-w-3xl">
            <div>
                <h1 className="text-2xl font-bold">Global System Settings</h1>
                <p className="text-default-500">Configure application-wide defaults and availability.</p>
            </div>

            <Card className="p-6 space-y-6">
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

                <div className="flex justify-end pt-4">
                    <Button
                        onPress={handleSave}
                        className="bg-primary text-white"
                        isDisabled={isPending}
                    >
                        {isPending ? 'Saving...' : 'Save Changes'}
                    </Button>
                </div>
            </Card>
        </div>
    );
}
