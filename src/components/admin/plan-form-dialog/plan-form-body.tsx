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
        <div className="grid grid-cols-1 md:grid-cols-2 gap-5 py-4">
            <div className="flex flex-col gap-2">
                <Label className="text-sm font-medium">Plan Name</Label>
                <Input
                    placeholder="e.g. Enterprise"
                    value={values.name}
                    onChange={(event) => setField('name', event.target.value)}
                    className="w-full"
                />
            </div>

            <div className="flex flex-col gap-2">
                <Label className="text-sm font-medium">Stripe Price ID (Base)</Label>
                <Input
                    placeholder="price_H5ggY..."
                    value={values.stripePriceId}
                    onChange={(event) => setField('stripePriceId', event.target.value)}
                    className="w-full"
                />
            </div>

            <div className="flex flex-col gap-2">
                <Label className="text-sm font-medium">Stripe Storage Price ID (Metered)</Label>
                <Input
                    placeholder="price_..."
                    value={values.stripeStoragePriceId}
                    onChange={(event) => setField('stripeStoragePriceId', event.target.value)}
                    className="w-full"
                />
            </div>

            <div className="flex flex-col gap-2">
                <Label className="text-sm font-medium">Stripe Transcription Price ID (Metered)</Label>
                <Input
                    placeholder="price_..."
                    value={values.stripeTranscriptionPriceId}
                    onChange={(event) => setField('stripeTranscriptionPriceId', event.target.value)}
                    className="w-full"
                />
            </div>

            <div className="flex flex-col gap-2">
                <Label className="text-sm font-medium">Price (USD)</Label>
                <Input
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
                    placeholder="Short description for the pricing table"
                    value={values.description}
                    onChange={(event) => setField('description', event.target.value)}
                    className="w-full"
                />
            </div>

            <div className="flex flex-col gap-2">
                <Label className="text-sm font-medium">Billing Interval</Label>
                <Select
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
                <Label className="text-sm font-medium">Status & Visibility</Label>
                <div className="flex flex-col gap-2 pt-2">
                    <Checkbox
                        isSelected={values.isActive}
                        onChange={() => setField('isActive', !values.isActive)}
                    >
                        <Checkbox.Control>
                            <Checkbox.Indicator />
                        </Checkbox.Control>
                        <Checkbox.Content>Active (Visible)</Checkbox.Content>
                    </Checkbox>

                    <Checkbox
                        isSelected={values.isDefault}
                        onChange={() => setField('isDefault', !values.isDefault)}
                    >
                        <Checkbox.Control>
                            <Checkbox.Indicator />
                        </Checkbox.Control>
                        <Checkbox.Content>Default Plan for New Users</Checkbox.Content>
                    </Checkbox>
                </div>
            </div>

            <div className="md:col-span-2 flex items-center gap-2 mt-4 font-bold text-sm text-default-500">
                <div className="h-px flex-1 bg-default-200"></div>
                <span>Limits</span>
                <div className="h-px flex-1 bg-default-200"></div>
            </div>

            <div className="flex flex-col gap-2">
                <Label className="text-sm font-medium">Storage (GB)</Label>
                <Input
                    type="number"
                    value={values.storageGB}
                    onChange={(event) => setField('storageGB', event.target.value)}
                    className="w-full"
                />
            </div>

            <div className="flex flex-col gap-2">
                <Label className="text-sm font-medium">Transcription (Min)</Label>
                <Input
                    type="number"
                    value={values.transcriptionMinutes}
                    onChange={(event) => setField('transcriptionMinutes', event.target.value)}
                    className="w-full"
                />
            </div>

            <div className="md:col-span-2 flex flex-col gap-2">
                <Label className="text-sm font-medium">Features (One per line)</Label>
                <TextArea
                    placeholder="Feature 1&#10;Feature 2&#10;Feature 3"
                    value={values.featuresInput}
                    onChange={(event) => setField('featuresInput', event.target.value)}
                    className="w-full"
                />
            </div>
        </div>
    );
}
