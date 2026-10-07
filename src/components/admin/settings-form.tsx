'use client';

import { useRef, useState } from 'react';
import { Card, Button, Input, Switch, Select, ListBox, Label } from '@heroui/react';
import { SystemSettingsResponse, PlanResponse } from '@/lib/db/types';
import { updateSystemSettings } from '@/app/actions/admin-settings';
import { useRouter } from 'next/navigation';
import { numericInput, validationFailure, type AdminFieldErrors } from '@/lib/admin-validation';
import { focusInvalid } from './admin-form-errors';
import { useToast } from '@/components/toast-provider';
import { TranscriptionMultipliersSchema, type TranscriptionMultipliers } from '@/lib/transcription-multipliers';

const multiplierFields = [
    { id: 'soniox', label: 'Soniox Multiplier' },
    { id: 'elevenlabs', label: 'ElevenLabs Multiplier' },
    { id: 'gemini', label: 'Gemini Multiplier' },
    { id: 'openai_compat', label: 'Compatible server Multiplier' },
] as const;

type SettingsFormProps = {
    settings: SystemSettingsResponse & { transcriptionMultipliers: TranscriptionMultipliers };
    plans: PlanResponse[];
};

export function SettingsForm({ settings, plans }: SettingsFormProps) {
    const router = useRouter();
    const [isPending, setPending] = useState(false);
    const [errors, setErrors] = useState<AdminFieldErrors>({});
    const [saveError, setSaveError] = useState<string | null>(null);
    const busy = useRef(false);
    const form = useRef<HTMLFormElement>(null);
    const { toast } = useToast();

    const [allowSignups, setAllowSignups] = useState(settings.allowSignups);
    const [maintenanceMode, setMaintenanceMode] = useState(settings.maintenanceMode);
    const [defaultPlanId, setDefaultPlanId] = useState(settings.defaultPlanId);
    const [multipliers, setMultipliers] = useState<Record<keyof TranscriptionMultipliers, string>>(() => ({
        soniox: String(settings.transcriptionMultipliers.soniox),
        elevenlabs: String(settings.transcriptionMultipliers.elevenlabs),
        gemini: String(settings.transcriptionMultipliers.gemini),
        openai_compat: String(settings.transcriptionMultipliers.openai_compat),
    }));
    const parsedMultipliers = TranscriptionMultipliersSchema.safeParse(
        Object.fromEntries(multiplierFields.map(({ id }) => [id, numericInput(multipliers[id])]))
    );

    const handleSave = async (event: React.FormEvent) => {
        event.preventDefault();
        if (busy.current) return;
        if (!parsedMultipliers.success) { setErrors(validationFailure(parsedMultipliers.error).fieldErrors); focusInvalid(form.current); return; }
        if (!defaultPlanId) { setErrors({ defaultPlanId: 'Choose a default plan.' }); focusInvalid(form.current); return; }
        busy.current = true; setPending(true); setErrors({}); setSaveError(null);
        try {
            const result = await updateSystemSettings({ allowSignups, maintenanceMode, defaultPlanId, transcriptionMultipliers: parsedMultipliers.data });
            if (result?.fieldErrors) { setErrors(result.fieldErrors); focusInvalid(form.current); return; }
            toast({ title: 'Settings updated', status: 'success' }); router.refresh();
        } catch (error) { setSaveError(error instanceof Error ? error.message : 'Please try again.'); }
        finally { busy.current = false; setPending(false); }
    };

    return (
        <form ref={form} onSubmit={handleSave} noValidate className="max-w-3xl space-y-6">
            <Card className="space-y-6 p-6">
                <div>
                    <h3 className="text-lg font-semibold mb-4">Access Control</h3>
                    <div className="flex flex-col gap-4">
                        <div className="flex items-center justify-between gap-4">
                            <div>
                                <p className="font-medium">Allow New Signups</p>
                                <p id="signups-help" className="text-sm text-muted">When disabled, new users cannot register.</p>
                            </div>
                            <Switch aria-label="Allow new signups" aria-describedby="signups-help" isSelected={allowSignups} onChange={setAllowSignups}>
                                <Switch.Content className="min-h-11 min-w-11 justify-center">
                                    <Switch.Control>
                                        <Switch.Thumb />
                                    </Switch.Control>
                                </Switch.Content>
                            </Switch>
                        </div>

                        <hr className="border-border" />

                        <div className="flex items-center justify-between gap-4">
                            <div>
                                <p className="font-medium">Maintenance Mode</p>
                                <p id="maintenance-help" className="text-sm text-muted">
                                    When enabled, the application is accessible only to admins.
                                    <br /><span className="text-warning text-xs">Be careful with this setting.</span>
                                </p>
                            </div>
                            <Switch aria-label="Maintenance mode" aria-describedby="maintenance-help" isSelected={maintenanceMode} onChange={setMaintenanceMode} className="text-warning">
                                <Switch.Content className="min-h-11 min-w-11 justify-center">
                                    <Switch.Control>
                                        <Switch.Thumb />
                                    </Switch.Control>
                                </Switch.Content>
                            </Switch>
                        </div>
                    </div>
                </div>

                <hr className="border-border" />

                <div>
                    <h3 className="text-lg font-semibold mb-4">Onboarding Defaults</h3>
                    <div className="grid gap-4 w-full">
                        <div className="flex flex-col gap-2">
                            <Select
                                aria-invalid={!!errors.defaultPlanId}
                                aria-describedby={`default-plan-help${errors.defaultPlanId ? ' defaultPlanId-error' : ''}${plans.find(plan => plan.id === defaultPlanId)?.isActive === false ? ' inactive-plan-help' : ''}`}
                                selectedKey={defaultPlanId}
                                onSelectionChange={(key) => setDefaultPlanId(key as string)}
                                placeholder="Select a plan"
                            >
                                <Label>Default Plan</Label>
                                <Select.Trigger className="min-h-11">
                                    <Select.Value />
                                    <Select.Indicator />
                                </Select.Trigger>
                                <Select.Popover>
                                    <ListBox>
                                        {plans.filter(p => p.isActive || p.id === defaultPlanId).map((plan) => (
                                            <ListBox.Item key={plan.id} id={plan.id} textValue={plan.name}>
                                                {plan.name}{!plan.isActive ? ' (Inactive)' : ''}
                                            </ListBox.Item>
                                        ))}
                                    </ListBox>
                                </Select.Popover>
                            </Select>
                            {errors.defaultPlanId && <p id="defaultPlanId-error" role="alert" className="text-sm text-danger">{errors.defaultPlanId}</p>}
                            {plans.find(plan => plan.id === defaultPlanId)?.isActive === false && <p id="inactive-plan-help" className="text-sm text-muted">The assigned plan is inactive. Choose an active plan to change the onboarding default.</p>}
                        </div>
                        <p id="default-plan-help" className="text-xs text-muted">
                            New users will automatically be assigned to this plan upon registration.
                        </p>
                    </div>
                </div>

                <hr className="border-border" />

                <div>
                    <h3 className="text-lg font-semibold mb-4">Transcription Billing</h3>
                    <p className="text-sm text-muted mb-4">
                        Set the cost multipliers for each transcription provider. A 10-minute file transcribed with a 6x multiplier will consume 60 minutes of quota.
                    </p>
                    <div className="grid gap-4 sm:grid-cols-2 w-full">
                        {multiplierFields.map(({ id, label }) => {
                            const invalid = !!errors[id];
                            const inputId = `multiplier-${id}`;
                            return (
                                <div key={id} className="flex flex-col gap-2">
                                    <Label htmlFor={inputId} className="text-sm font-medium">{label}</Label>
                                    <Input
                                        id={inputId}
                                        type="number"
                                        min={0}
                                        step="any"
                                        value={multipliers[id]}
                                        onChange={(e) => setMultipliers(previous => ({ ...previous, [id]: e.target.value }))}
                                        aria-invalid={invalid}
                                        aria-describedby={invalid ? `${inputId}-error` : undefined}
                                        className="min-h-11 min-w-0 flex-1"
                                    />
                                    {invalid ? <p id={`${inputId}-error`} role="alert" className="text-sm text-danger">{errors[id]}</p> : null}
                                </div>
                            );
                        })}
                    </div>
                </div>

                {saveError && <p role="alert" className="text-sm text-danger">{saveError} Your changes are retained; try saving again.</p>}
                <div className="flex justify-end pt-4">
                    <Button
                        type="submit"
                        variant="primary" className="min-h-11 px-5"
                        isPending={isPending}
                    >
                        {saveError ? 'Retry save' : 'Save changes'}
                    </Button>
                </div>
            </Card>
        </form>
    );
}
