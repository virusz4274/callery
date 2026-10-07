import type { AdminFieldErrors } from '@/lib/admin-validation';
import { FieldError } from '../admin-form-errors';
import { Checkbox, Input, Label, ListBox, Select, TextArea, Surface } from '@heroui/react';
import type { PlanFormValues } from './types';
import { INTERVALS } from './types';

type PlanFormBodyProps = {
    values: PlanFormValues;
    errors: AdminFieldErrors;
    setField: <K extends keyof PlanFormValues>(key: K, value: PlanFormValues[K]) => void;
};

export function PlanFormBody({ values, setField, errors }: PlanFormBodyProps) {
    return (
        <div className="space-y-6">
            <Surface variant="secondary" className="p-4">
                <div className="mb-5 space-y-1">
                    <h3 className="text-lg font-bold text-foreground">Plan details</h3>
                </div>

                <div className="grid grid-cols-1 gap-5 md:grid-cols-2">
                    <div className="flex flex-col gap-2">
                        <Label htmlFor="plan-key" className="text-sm font-medium">Plan key</Label>
                        <Input
                            aria-label="Plan key"
                            placeholder="free-trial, pro, team..."
                            id="plan-key" aria-invalid={!!errors.key} aria-describedby={errors.key ? "key-error" : undefined} value={values.key}
                            onChange={(event) => setField('key', event.target.value)}
                            className="min-h-11 w-full"
                        />
                        <FieldError errors={errors} name="key" />
                    </div>

                    <div className="flex flex-col gap-2">
                        <Label htmlFor="plan-name" className="text-sm font-medium">Plan name</Label>
                        <Input
                            aria-label="Plan name"
                            placeholder="Starter, Pro, Team, Enterprise..."
                            id="plan-name" aria-invalid={!!errors.name} aria-describedby={errors.name ? "name-error" : undefined} value={values.name}
                            onChange={(event) => setField('name', event.target.value)}
                            className="min-h-11 w-full"
                        />
                        <FieldError errors={errors} name="name" />
                    </div>

                    <div className="flex flex-col gap-2">
                        <Label htmlFor="plan-price" className="text-sm font-medium">Price (USD)</Label>
                        <Input
                            aria-label="Plan price"
                            type="number" min={0} step="any"
                            placeholder="0.00"
                            id="plan-price" aria-invalid={!!errors.price} aria-describedby={errors.price ? "price-error" : undefined} value={values.price}
                            onChange={(event) => setField('price', event.target.value)}
                            className="min-h-11 w-full"
                        />
                        <FieldError errors={errors} name="price" />
                    </div>

                    <div className="md:col-span-2 flex flex-col gap-2">
                        <Label htmlFor="plan-description" className="text-sm font-medium">Description</Label>
                        <Input
                            aria-label="Plan description"
                            placeholder="Describe who this plan is for and what value it unlocks."
                            id="plan-description" aria-invalid={!!errors.description} aria-describedby={errors.description ? "description-error" : undefined} value={values.description}
                            onChange={(event) => setField('description', event.target.value)}
                            className="min-h-11 w-full"
                        />
                        <FieldError errors={errors} name="description" />
                    </div>

                    <div className="flex flex-col gap-2">
                        <Label id="plan-interval-label" className="text-sm font-medium">Billing interval</Label>
                        <Select
                            aria-label="Billing interval" aria-labelledby="plan-interval-label"
                            selectedKey={values.interval}
                            onSelectionChange={(key) => setField('interval', key as PlanFormValues['interval'])}
                        >
                            <Select.Trigger className="min-h-11 w-full">
                                <Select.Value />
                                <Select.Indicator />
                            </Select.Trigger>
                            <Select.Popover>
                                <ListBox>
                                    {INTERVALS.map((item) => (
                                        <ListBox.Item key={item.value} id={item.value} textValue={item.label}>
                                            {item.label}
                                        </ListBox.Item>
                                    ))}
                                </ListBox>
                            </Select.Popover>
                        </Select>
                    </div>

                    <div className="flex flex-col gap-2">
                        <Label className="text-sm font-medium">Visibility</Label>
                        <div className="rounded-xl border border-border bg-background px-4 py-3">
                            <div className="flex flex-col gap-3">
                                <Checkbox
                                    aria-label="Plan active"
                                    isSelected={values.isActive}
                                    onChange={() => setField('isActive', !values.isActive)}
                                >
                                    <Checkbox.Content className="min-h-11">
                                        <Checkbox.Control>
                                            <Checkbox.Indicator />
                                        </Checkbox.Control>
                                        <Label>Active and available for assignment</Label>
                                    </Checkbox.Content>
                                </Checkbox>

                                <Checkbox
                                    aria-label="Plan default"
                                    isSelected={values.isDefault}
                                    onChange={() => setField('isDefault', !values.isDefault)}
                                >
                                    <Checkbox.Content className="min-h-11">
                                        <Checkbox.Control>
                                            <Checkbox.Indicator />
                                        </Checkbox.Control>
                                        <Label>Default plan for new users</Label>
                                    </Checkbox.Content>
                                </Checkbox>
                            </div>
                        </div>
                    </div>

                    <div className="flex flex-col gap-2">
                        <Label htmlFor="plan-stripePriceId" className="text-sm font-medium">Stripe price ID (base)</Label>
                        <Input
                            aria-label="Stripe base price ID"
                            placeholder="price_..."
                            id="plan-stripePriceId" aria-invalid={!!errors.stripePriceId} aria-describedby={errors.stripePriceId ? "stripePriceId-error" : undefined} value={values.stripePriceId}
                            onChange={(event) => setField('stripePriceId', event.target.value)}
                            className="min-h-11 w-full"
                        />
                        <FieldError errors={errors} name="stripePriceId" />
                    </div>

                    <div className="flex flex-col gap-2">
                        <Label htmlFor="plan-stripeStoragePriceId" className="text-sm font-medium">Stripe storage price ID</Label>
                        <Input
                            aria-label="Stripe storage price ID"
                            placeholder="price_..."
                            id="plan-stripeStoragePriceId" aria-invalid={!!errors.stripeStoragePriceId} aria-describedby={errors.stripeStoragePriceId ? "stripeStoragePriceId-error" : undefined} value={values.stripeStoragePriceId}
                            onChange={(event) => setField('stripeStoragePriceId', event.target.value)}
                            className="min-h-11 w-full"
                        />
                        <FieldError errors={errors} name="stripeStoragePriceId" />
                    </div>

                    <div className="md:col-span-2 flex flex-col gap-2">
                        <Label htmlFor="plan-stripeTranscriptionPriceId" className="text-sm font-medium">Stripe transcription price ID</Label>
                        <Input
                            aria-label="Stripe transcription price ID"
                            placeholder="price_..."
                            id="plan-stripeTranscriptionPriceId" aria-invalid={!!errors.stripeTranscriptionPriceId} aria-describedby={errors.stripeTranscriptionPriceId ? "stripeTranscriptionPriceId-error" : undefined} value={values.stripeTranscriptionPriceId}
                            onChange={(event) => setField('stripeTranscriptionPriceId', event.target.value)}
                            className="min-h-11 w-full"
                        />
                        <FieldError errors={errors} name="stripeTranscriptionPriceId" />
                    </div>
                </div>
            </Surface>

            <Surface variant="secondary" className="p-4">
                <div className="mb-5 space-y-1">
                    <h3 className="text-lg font-bold text-foreground">Usage limits</h3>
                    <p id="plan-limits-help" className="text-sm leading-6 text-muted">
                        Define the included storage and transcription allowance before overage rules apply.
                    </p>
                </div>

                <div className="grid grid-cols-1 gap-5 md:grid-cols-2">
                    <div className="flex flex-col gap-2">
                        <Label htmlFor="plan-storageGB" className="text-sm font-medium">Storage (GB)</Label>
                        <Input
                            aria-label="Storage limit in gigabytes"
                            type="number" min={0} step="any"
                            id="plan-storageGB" aria-invalid={!!errors.storageGB} aria-describedby={`plan-limits-help${errors.storageGB ? ' storageGB-error' : ''}`} value={values.storageGB}
                            onChange={(event) => setField('storageGB', event.target.value)}
                            className="min-h-11 w-full"
                        />
                        <FieldError errors={errors} name="storageGB" />
                    </div>

                    <div className="flex flex-col gap-2">
                        <Label htmlFor="plan-transcriptionMinutes" className="text-sm font-medium">Transcription (minutes)</Label>
                        <Input
                            aria-label="Transcription limit in minutes"
                            type="number" min={0} step="any"
                            id="plan-transcriptionMinutes" aria-invalid={!!errors.transcriptionMinutes} aria-describedby={`plan-limits-help${errors.transcriptionMinutes ? ' transcriptionMinutes-error' : ''}`} value={values.transcriptionMinutes}
                            onChange={(event) => setField('transcriptionMinutes', event.target.value)}
                            className="min-h-11 w-full"
                        />
                        <FieldError errors={errors} name="transcriptionMinutes" />
                    </div>
                </div>
            </Surface>

            <Surface variant="secondary" className="p-4">
                <div className="mb-5 space-y-1">
                    <h3 className="text-lg font-bold text-foreground">Included features</h3>
                    <p id="plan-features-help" className="text-sm leading-6 text-muted">
                        One feature per line, shown on the pricing page.
                    </p>
                </div>

                <div className="flex flex-col gap-2">
                    <Label htmlFor="plan-featuresInput" className="text-sm font-medium">Features</Label>
                    <TextArea
                        aria-label="Plan features"
                        placeholder="Unlimited library search&#10;AI summaries&#10;Team billing controls"
                        id="plan-featuresInput" aria-invalid={!!errors.featuresInput} aria-describedby={`plan-features-help${errors.featuresInput ? ' featuresInput-error' : ''}`} value={values.featuresInput}
                        onChange={(event) => setField('featuresInput', event.target.value)}
                        className="min-h-11 w-full"
                        rows={6}
                    />
                        <FieldError errors={errors} name="featuresInput" />
                </div>
            </Surface>
        </div>
    );
}
