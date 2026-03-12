'use client';

import React from 'react';
import { Button, Chip, Input, Label, ListBox, Select } from '@heroui/react';
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

export function AuditLogsFilters({
    initialActionFilter,
    initialStartDate,
    initialEndDate,
    onActionFilterChange,
    onDateChange,
    onClearFilters,
}: AuditLogsFiltersProps) {
    const hasFilters = Boolean(initialActionFilter || initialStartDate || initialEndDate);

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
                    <div className="flex flex-col gap-2">
                        <Label className="text-sm font-medium">From date</Label>
                        <Input
                            aria-label="Audit logs from date"
                            type="date"
                            value={initialStartDate?.split('T')[0] || ''}
                            onChange={(event) => onDateChange('startDate', event.target.value)}
                        />
                    </div>
                    <div className="flex flex-col gap-2">
                        <Label className="text-sm font-medium">To date</Label>
                        <Input
                            aria-label="Audit logs to date"
                            type="date"
                            value={initialEndDate?.split('T')[0] || ''}
                            onChange={(event) => onDateChange('endDate', event.target.value)}
                        />
                    </div>
                </div>
            </div>
        </div>
    );
}
