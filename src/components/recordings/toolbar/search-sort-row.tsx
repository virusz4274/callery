import React from 'react';
import { Button, Chip, Input, ListBox, SearchField, Select } from '@heroui/react';
import { CalendarRange, Filter, SlidersHorizontal, User, X } from 'lucide-react';
import type { Contact } from '@/lib/types';

type SearchSortRowProps = {
    search: string;
    onSearchChange: (value: string) => void;
    sortBy: 'date' | 'duration';
    sortOrder: 'asc' | 'desc';
    onSortChange: (by: string, order: string) => void;
    contacts: Contact[];
    contactId?: string;
    onContactChange: (id?: string) => void;
    startDate?: string;
    endDate?: string;
    onDateChange: (start?: string, end?: string) => void;
};

function resolveSortKey(key: unknown): string | null {
    if (!key) {
        return null;
    }

    if (typeof key === 'string') {
        return key;
    }

    if (typeof key === 'object' && key !== null) {
        return Array.from(key as Set<string>)[0] || null;
    }

    return null;
}

export function SearchSortRow({
    search,
    onSearchChange,
    sortBy,
    sortOrder,
    onSortChange,
    contacts,
    contactId,
    onContactChange,
    startDate,
    endDate,
    onDateChange,
}: SearchSortRowProps) {
    const selectedContact = contacts.find((contact) => contact.id === contactId);

    return (
        <div className="space-y-5">
            <div className="space-y-1">
                <div className="text-xs font-semibold uppercase tracking-[0.24em] text-default-400">
                    Filter library
                </div>
                <h3 className="text-xl font-bold tracking-[-0.03em] text-foreground">
                    Narrow the archive without losing your place.
                </h3>
                <p className="text-sm leading-6 text-default-600">
                    Use transcript text, contact, date range, and sort order together. AI search sits
                    above this and can be cleared independently.
                </p>
            </div>

            <div className="grid gap-4 xl:grid-cols-[minmax(0,1.2fr)_260px_240px] xl:items-end">
                <div className="w-full">
                    <label className="mb-2 block text-small font-medium text-default-500">
                        Text search
                    </label>
                    <SearchField
                        aria-label="Filter recordings"
                        value={search}
                        onChange={onSearchChange}
                        className="w-full"
                        variant="secondary"
                    >
                        <SearchField.Group className="flex h-12 items-center overflow-hidden rounded-2xl border border-default-200 bg-default-50 px-3 transition-all focus-within:border-primary focus-within:ring-1 focus-within:ring-primary/20">
                            <Filter className="w-4 h-4 text-default-400 mr-2" />
                            <SearchField.Input
                                className="bg-transparent border-none focus:ring-0 text-small w-full p-0 placeholder:text-default-400"
                                placeholder="Filter by contact, summary, transcript..."
                            />
                            <SearchField.ClearButton />
                        </SearchField.Group>
                    </SearchField>
                </div>

                <div className="w-full">
                    <label className="mb-2 block text-small font-medium text-default-500">
                        Contact
                    </label>
                    <Select
                        aria-label="Filter by contact"
                        selectedKey={contactId || 'all'}
                        variant="secondary"
                        onSelectionChange={(keys) => {
                            const selectedKey = resolveSortKey(keys);
                            if (!selectedKey || selectedKey === 'all') {
                                onContactChange(undefined);
                                return;
                            }

                            onContactChange(selectedKey);
                        }}
                    >
                        <Select.Trigger className="h-12 rounded-2xl">
                            <Select.Value />
                            <Select.Indicator />
                        </Select.Trigger>
                        <Select.Popover>
                            <ListBox selectionMode="single">
                                <ListBox.Item key="all" id="all" textValue="All contacts">
                                    All contacts
                                    <ListBox.ItemIndicator />
                                </ListBox.Item>
                                {contacts.map((contact) => (
                                    <ListBox.Item
                                        key={contact.id}
                                        id={contact.id}
                                        textValue={contact.name || contact.phoneNumbers?.[0] || 'Unknown'}
                                    >
                                        {contact.name || contact.phoneNumbers?.[0] || 'Unknown'}
                                        <ListBox.ItemIndicator />
                                    </ListBox.Item>
                                ))}
                            </ListBox>
                        </Select.Popover>
                    </Select>
                </div>

                <div className="w-full">
                    <label className="mb-2 block text-small font-medium text-default-500">
                        Sort order
                    </label>
                    <Select
                        className="w-full"
                        aria-label="Sort options"
                        variant="secondary"
                        selectedKey={`${sortBy}-${sortOrder}`}
                        onSelectionChange={(keys) => {
                            const selectedKey = resolveSortKey(keys);
                            if (!selectedKey) {
                                return;
                            }

                            const [by, order] = selectedKey.split('-');
                            onSortChange(by, order);
                        }}
                    >
                        <Select.Trigger className="h-12 rounded-2xl">
                            <Select.Value />
                            <Select.Indicator />
                        </Select.Trigger>
                        <Select.Popover>
                            <ListBox selectionMode="single">
                                <ListBox.Item key="date-desc" id="date-desc">
                                    Newest First
                                </ListBox.Item>
                                <ListBox.Item key="date-asc" id="date-asc">
                                    Oldest First
                                </ListBox.Item>
                                <ListBox.Item key="duration-desc" id="duration-desc">
                                    Longest Duration
                                </ListBox.Item>
                                <ListBox.Item key="duration-asc" id="duration-asc">
                                    Shortest Duration
                                </ListBox.Item>
                            </ListBox>
                        </Select.Popover>
                    </Select>
                </div>
            </div>

            <div className="grid gap-4 border-t border-default-100/80 pt-4 lg:grid-cols-[minmax(0,1fr)_minmax(0,1fr)_auto] lg:items-end">
                <div>
                    <label className="mb-2 flex items-center gap-2 text-small font-medium text-default-500">
                        <CalendarRange className="h-4 w-4" />
                        From date
                    </label>
                    <Input
                        aria-label="From date"
                        type="date"
                        variant="secondary"
                        value={startDate || ''}
                        onChange={(event) => onDateChange(event.target.value || undefined, endDate)}
                    />
                </div>
                <div>
                    <label className="mb-2 flex items-center gap-2 text-small font-medium text-default-500">
                        <CalendarRange className="h-4 w-4" />
                        To date
                    </label>
                    <Input
                        aria-label="To date"
                        type="date"
                        variant="secondary"
                        value={endDate || ''}
                        onChange={(event) => onDateChange(startDate, event.target.value || undefined)}
                    />
                </div>
                <div className="flex flex-wrap gap-2 lg:justify-end">
                    {(startDate || endDate || contactId || search) && (
                        <Button
                            variant="ghost"
                            className="rounded-full text-danger"
                            onPress={() => {
                                onDateChange(undefined, undefined);
                                onContactChange(undefined);
                                onSearchChange('');
                            }}
                        >
                            <X className="w-4 h-4 mr-1" />
                            Reset filters
                        </Button>
                    )}
                </div>
            </div>

            <div className="flex flex-wrap items-center gap-2 border-t border-default-100/80 pt-4">
                <div className="flex items-center gap-2 text-default-500">
                    <SlidersHorizontal className="w-4 h-4" />
                    <span className="text-small font-medium">Active filters</span>
                </div>
                {search && (
                    <Chip variant="soft" color="default">
                        Text: {search}
                    </Chip>
                )}
                {selectedContact && (
                    <Chip variant="soft" color="accent">
                        <span className="inline-flex items-center gap-1.5">
                            <User className="h-3.5 w-3.5" />
                            {selectedContact.name || selectedContact.phoneNumbers?.[0] || 'Unknown'}
                        </span>
                    </Chip>
                )}
                {startDate && (
                    <Chip variant="soft" color="warning">
                        From {startDate}
                    </Chip>
                )}
                {endDate && (
                    <Chip variant="soft" color="warning">
                        To {endDate}
                    </Chip>
                )}
                {!search && !selectedContact && !startDate && !endDate && (
                    <span className="text-small text-default-400">No filters applied</span>
                )}
            </div>
        </div>
    );
}
