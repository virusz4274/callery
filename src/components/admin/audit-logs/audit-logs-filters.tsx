'use client';

import React from 'react';
import { Button, Calendar, Chip, DateField, DatePicker, Label, ListBox, Select } from '@heroui/react';
import { parseDate, type DateValue } from '@internationalized/date';
import { FilterX } from 'lucide-react';
import { ACTION_TYPES } from './constants';

type AuditLogsFiltersProps = {
    initialActionFilter?: string;
    initialStartDate?: string;
    initialEndDate?: string;
    onActionFilterChange: (key: React.Key | null) => void;
    onDateChange: (type: 'startDate' | 'endDate', value: string) => void;
    onClearFilters: () => void;
};

type FilterDateValue = DateValue | null;

function getDateValue(value?: string): FilterDateValue {
    if (!value) {
        return null;
    }

    try {
        return parseDate(value.split('T')[0]);
    } catch {
        return null;
    }
}

type FilterDatePickerProps = {
    ariaLabel: string;
    label: string;
    onChange: (value: string) => void;
    value: FilterDateValue;
};

function FilterDatePicker({ ariaLabel, label, onChange, value }: FilterDatePickerProps) {
    return (
        <div className="flex flex-col gap-2">
            <div className="flex items-center justify-between gap-3">
                <Label className="text-sm font-medium">{label}</Label>
                {value ? (
                    <Button size="sm" variant="ghost" onPress={() => onChange('')}>
                        Clear
                    </Button>
                ) : null}
            </div>

            <DatePicker
                aria-label={ariaLabel}
                className="w-full"
                value={value}
                onChange={(nextValue) => onChange(nextValue ? nextValue.toString() : '')}
            >
                <>
                    <DateField.Group fullWidth variant="secondary">
                        <DateField.InputContainer>
                            <DateField.Input>
                                {(segment) => <DateField.Segment segment={segment} />}
                            </DateField.Input>
                        </DateField.InputContainer>
                        <DateField.Suffix>
                            <DatePicker.Trigger>
                                <DatePicker.TriggerIndicator />
                            </DatePicker.Trigger>
                        </DateField.Suffix>
                    </DateField.Group>

                    <DatePicker.Popover>
                        <Calendar aria-label={ariaLabel}>
                            <Calendar.Header>
                                <Calendar.YearPickerTrigger>
                                    <Calendar.YearPickerTriggerHeading />
                                    <Calendar.YearPickerTriggerIndicator />
                                </Calendar.YearPickerTrigger>
                                <Calendar.NavButton slot="previous" />
                                <Calendar.NavButton slot="next" />
                            </Calendar.Header>
                            <Calendar.Grid>
                                <Calendar.GridHeader>
                                    {(day) => <Calendar.HeaderCell>{day}</Calendar.HeaderCell>}
                                </Calendar.GridHeader>
                                <Calendar.GridBody>
                                    {(date) => <Calendar.Cell date={date} />}
                                </Calendar.GridBody>
                            </Calendar.Grid>
                            <Calendar.YearPickerGrid>
                                <Calendar.YearPickerGridBody>
                                    {({ year }) => <Calendar.YearPickerCell year={year} />}
                                </Calendar.YearPickerGridBody>
                            </Calendar.YearPickerGrid>
                        </Calendar>
                    </DatePicker.Popover>
                </>
            </DatePicker>
        </div>
    );
}

export function AuditLogsFilters({
    initialActionFilter,
    initialStartDate,
    initialEndDate,
    onActionFilterChange,
    onDateChange,
    onClearFilters,
}: AuditLogsFiltersProps) {
    const hasFilters = Boolean(initialActionFilter || initialStartDate || initialEndDate);
    const startDateValue = getDateValue(initialStartDate);
    const endDateValue = getDateValue(initialEndDate);

    return (
        <div className="mb-6 space-y-4 rounded-[1.5rem] border border-default-200/80 bg-default-50/70 p-4 sm:p-5">
            <div className="flex flex-col gap-3 lg:flex-row lg:items-center lg:justify-between">
                <div className="space-y-1">
                    <p className="text-sm font-semibold text-foreground">Filter audit activity</p>
                    <p className="text-sm text-default-500">Narrow by action type or time window to isolate operational changes.</p>
                </div>
                <div className="flex flex-wrap items-center gap-2">
                    {initialActionFilter && (
                        <Chip size="sm" variant="soft" color="accent">
                            {initialActionFilter}
                        </Chip>
                    )}
                    {initialStartDate && (
                        <Chip size="sm" variant="soft" color="default">
                            From {initialStartDate.split('T')[0]}
                        </Chip>
                    )}
                    {initialEndDate && (
                        <Chip size="sm" variant="soft" color="default">
                            To {initialEndDate.split('T')[0]}
                        </Chip>
                    )}
                    {hasFilters && (
                        <Button size="sm" variant="ghost" onPress={onClearFilters} className="gap-2">
                            <FilterX className="h-4 w-4" />
                            Clear
                        </Button>
                    )}
                </div>
            </div>

            <div className="grid gap-4 lg:grid-cols-[minmax(0,18rem)_minmax(0,1fr)]">
                <div className="flex flex-col gap-2">
                    <Label className="text-sm font-medium">Action type</Label>
                    <Select
                        aria-label="Audit action filter"
                        className="w-full"
                        placeholder="All actions"
                        selectedKey={initialActionFilter || null}
                        onSelectionChange={(key) => onActionFilterChange(key)}
                    >
                        <Select.Trigger>
                            <Select.Value />
                            <Select.Indicator />
                        </Select.Trigger>
                        <Select.Popover>
                            <ListBox>
                                {ACTION_TYPES.map((action) => (
                                    <ListBox.Item key={action} textValue={action}>
                                        {action}
                                    </ListBox.Item>
                                ))}
                            </ListBox>
                        </Select.Popover>
                    </Select>
                </div>

                <div className="grid gap-4 sm:grid-cols-2">
                    <FilterDatePicker
                        ariaLabel="Audit logs from date"
                        label="From date"
                        value={startDateValue}
                        onChange={(value) => onDateChange('startDate', value)}
                    />
                    <FilterDatePicker
                        ariaLabel="Audit logs to date"
                        label="To date"
                        value={endDateValue}
                        onChange={(value) => onDateChange('endDate', value)}
                    />
                </div>
            </div>
        </div>
    );
}
