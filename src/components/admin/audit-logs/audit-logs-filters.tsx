'use client';

import React from 'react';
import { Input, Label, ListBox, Select } from '@heroui/react';
import { ACTION_TYPES } from './constants';

type AuditLogsFiltersProps = {
    initialActionFilter?: string;
    initialStartDate?: string;
    initialEndDate?: string;
    onActionFilterChange: (key: React.Key | null) => void;
    onDateChange: (type: 'startDate' | 'endDate', value: string) => void;
};

export function AuditLogsFilters({
    initialActionFilter,
    initialStartDate,
    initialEndDate,
    onActionFilterChange,
    onDateChange,
}: AuditLogsFiltersProps) {
    return (
        <div className="flex gap-4 mb-6 flex-wrap">
            <div className="w-64">
                <Select
                    className="w-full"
                    placeholder="All Actions"
                    selectedKey={initialActionFilter || null}
                    onSelectionChange={(key) => onActionFilterChange(key)}
                >
                    <Label>Filter by Action</Label>
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

            <div className="flex flex-col gap-2">
                <Label className="text-sm">Filter by Date</Label>
                <div className="flex items-center gap-2">
                    <Input
                        type="date"
                        className="w-40"
                        aria-label="From Date"
                        value={initialStartDate?.split('T')[0] || ''}
                        onChange={(event) => onDateChange('startDate', event.target.value)}
                    />
                    <span className="text-default-400">to</span>
                    <Input
                        type="date"
                        className="w-40"
                        aria-label="To Date"
                        value={initialEndDate?.split('T')[0] || ''}
                        onChange={(event) => onDateChange('endDate', event.target.value)}
                    />
                </div>
            </div>
        </div>
    );
}
