'use client';

import { Input, Label, ListBox, Select, TextField } from '@heroui/react';

const sortOptions = [
    { id: 'date-desc', label: 'Newest first' },
    { id: 'date-asc', label: 'Oldest first' },
    { id: 'duration-desc', label: 'Longest first' },
    { id: 'duration-asc', label: 'Shortest first' },
];

export function RecordingSortSelect({ value, onChange }: { value: string; onChange: (value: string) => void }) {
    return <Select aria-label="Sort order" selectedKey={value} onSelectionChange={key => { if (key !== null) onChange(String(key)); }} className="min-w-0 w-full sm:w-44">
        <Select.Trigger className="min-h-11"><Select.Value /><Select.Indicator data-testid="recording-sort-icon" /></Select.Trigger>
        <Select.Popover><ListBox>{sortOptions.map(option => <ListBox.Item key={option.id} id={option.id} textValue={option.label}>{option.label}</ListBox.Item>)}</ListBox></Select.Popover>
    </Select>;
}

export function RecordingDateField({ label, value, min, max, onChange }: {
    label: string; value?: string; min?: string; max?: string; onChange: (value?: string) => void;
}) {
    return <TextField className="min-w-0" aria-label={label}>
        <Label>{label}</Label>
        <Input type="date" value={value || ''} min={min} max={max} className="min-h-11 min-w-0 w-full text-base" onChange={event => {
            if (event.currentTarget.validity.valid) onChange(event.currentTarget.value || undefined);
        }} />
    </TextField>;
}
