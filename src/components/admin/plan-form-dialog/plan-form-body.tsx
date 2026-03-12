import React from 'react';
import { Checkbox, Input, Label, ListBox, Select, TextArea } from '@heroui/react';
import type { PlanFormValues } from './types';
import { INTERVALS } from './types';

type PlanFormBodyProps = {
    values: PlanFormValues;
    setField: <K extends keyof PlanFormValues>(key: K, value: PlanFormValues[K]) => void;
};

export function PlanFormBody({ values, setField }: PlanFormBodyProps) {
    return (
        <div className="space-y-6">
            <section className="rounded-[1.5rem] border border-default-200/80 bg-background p-5 sm:p-6">
                <div className="mb-5 space-y-1">
                    <h3 className="text-lg font-bold tracking-[-0.03em] text-foreground">Plan identity</h3>
                    <p className="text-sm leading-6 text-default-500">
                        Set the customer-facing name, description, and Stripe catalog references for this plan.
                    </p>
                </div>

                <div className="grid grid-cols-1 gap-5 md:grid-cols-2">
                    <div className="flex flex-col gap-2">
                        <Label className="text-sm font-medium">Plan name</Label>
                        <Input
                            aria-label="Plan name"
                            placeholder="Starter, Pro, Team, Enterprise..."
                            value={values.name}
                            onChange={(event) => setField('name', event.target.value)}
                            className="w-full"
                        />
                    </div>

                    <div className="flex flex-col gap-2">
                        <Label className="text-sm font-medium">Price (USD)</Label>
                        <Input
                            aria-label="Plan price"
                            type="number"
                            placeholder="0.00"
                            value={values.price}
                            onChange={(event) => setField('price', event.target.value)}
                            className="w-full"
                        />
                    </div>

                    <div className="md:col-span-2 flex flex-col gap-2">
                        <Label className="text-sm font-medium">Description</Label>
                        <Input
                            aria-label="Plan description"
                            placeholder="Describe who this plan is for and what value it unlocks."
                            value={values.description}
                            onChange={(event) => setField('description', event.target.value)}
                            className="w-full"
                        />
                    </div>

                    <div className="flex flex-col gap-2">
                        <Label className="text-sm font-medium">Billing interval</Label>
                        <Select
                            aria-label="Billing interval"
                            selectedKey={values.interval}
                            onSelectionChange={(key) => setField('interval', key as PlanFormValues['interval'])}
                        >
                            <Select.Trigger className="w-full">
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
                        <div className="rounded-[1.25rem] border border-default-200/80 bg-default-50/70 px-4 py-3">
                            <div className="flex flex-col gap-3">
                                <Checkbox
                                    aria-label="Plan active"
                                    isSelected={values.isActive}
                                    onChange={() => setField('isActive', !values.isActive)}
                                >
                                    <Checkbox.Control>
                                        <Checkbox.Indicator />
                                    </Checkbox.Control>
                                    <Checkbox.Content>Active and available for assignment</Checkbox.Content>
                                </Checkbox>

                                <Checkbox
                                    aria-label="Plan default"
                                    isSelected={values.isDefault}
                                    onChange={() => setField('isDefault', !values.isDefault)}
                                >
                                    <Checkbox.Control>
                                        <Checkbox.Indicator />
                                    </Checkbox.Control>
                                    <Checkbox.Content>Default plan for new users</Checkbox.Content>
                                </Checkbox>
                            </div>
                        </div>
                    </div>

                    <div className="flex flex-col gap-2">
                        <Label className="text-sm font-medium">Stripe price ID (base)</Label>
                        <Input
                            aria-label="Stripe base price ID"
                            placeholder="price_..."
                            value={values.stripePriceId}
                            onChange={(event) => setField('stripePriceId', event.target.value)}
                            className="w-full"
                        />
                    </div>

                    <div className="flex flex-col gap-2">
                        <Label className="text-sm font-medium">Stripe storage price ID</Label>
                        <Input
                            aria-label="Stripe storage price ID"
                            placeholder="price_..."
                            value={values.stripeStoragePriceId}
                            onChange={(event) => setField('stripeStoragePriceId', event.target.value)}
                            className="w-full"
                        />
                    </div>

                    <div className="md:col-span-2 flex flex-col gap-2">
                        <Label className="text-sm font-medium">Stripe transcription price ID</Label>
                        <Input
                            aria-label="Stripe transcription price ID"
                            placeholder="price_..."
                            value={values.stripeTranscriptionPriceId}
                            onChange={(event) => setField('stripeTranscriptionPriceId', event.target.value)}
                            className="w-full"
                        />
                    </div>
                </div>
            </section>

            <section className="rounded-[1.5rem] border border-default-200/80 bg-default-50/70 p-5 sm:p-6">
                <div className="mb-5 space-y-1">
                    <h3 className="text-lg font-bold tracking-[-0.03em] text-foreground">Usage limits</h3>
                    <p className="text-sm leading-6 text-default-500">
                        Define the included storage and transcription allowance before overage rules apply.
                    </p>
                </div>

                <div className="grid grid-cols-1 gap-5 md:grid-cols-2">
                    <div className="flex flex-col gap-2">
                        <Label className="text-sm font-medium">Storage (GB)</Label>
                        <Input
                            aria-label="Storage limit in gigabytes"
                            type="number"
                            value={values.storageGB}
                            onChange={(event) => setField('storageGB', event.target.value)}
                            className="w-full"
                        />
                    </div>

                    <div className="flex flex-col gap-2">
                        <Label className="text-sm font-medium">Transcription (minutes)</Label>
                        <Input
                            aria-label="Transcription limit in minutes"
                            type="number"
                            value={values.transcriptionMinutes}
                            onChange={(event) => setField('transcriptionMinutes', event.target.value)}
                            className="w-full"
                        />
                    </div>
                </div>
            </section>

            <section className="rounded-[1.5rem] border border-default-200/80 bg-background p-5 sm:p-6">
                <div className="mb-5 space-y-1">
                    <h3 className="text-lg font-bold tracking-[-0.03em] text-foreground">Included features</h3>
                    <p className="text-sm leading-6 text-default-500">
                        Add one feature per line. These are reused in pricing and admin review surfaces.
                    </p>
                </div>

                <div className="flex flex-col gap-2">
                    <Label className="text-sm font-medium">Features</Label>
                    <TextArea
                        aria-label="Plan features"
                        placeholder="Unlimited library search&#10;AI summaries&#10;Team billing controls"
                        value={values.featuresInput}
                        onChange={(event) => setField('featuresInput', event.target.value)}
                        className="w-full"
                        rows={6}
                    />
                </div>
            </section>
        </div>
    );
}
