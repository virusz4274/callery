import { parseDate, type DateValue } from '@internationalized/date';
import { Button, Chip, DateField, DateRangePicker, Disclosure, FieldError, ListBox, Popover, RangeCalendar, SearchField, Select } from '@heroui/react';
import { ContextHelp } from '@/components/context-help';
import { useIsMobile } from '@/hooks/use-mobile';
import { CalendarRange, Filter, LayoutGrid, Rows3, SlidersHorizontal, Sparkles, User, X } from 'lucide-react';
import type { Contact } from '@/lib/types';
import type { SemanticFallbackReason, SemanticSearchMode } from '@/lib/db/search';
import type { ReactNode } from 'react';

type SearchSortRowProps = {
    searchMode: 'text' | 'semantic';
    onSearchModeChange: (mode: 'text' | 'semantic') => void;
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
    semanticQuery: string;
    onSemanticQueryChange: (value: string) => void;
    onSemanticSearch: () => void;
    onClearSemanticSearch: () => void;
    isSemanticSearching: boolean;
    semanticResultsCount?: number;
    semanticSearchMode?: SemanticSearchMode;
    semanticFallbackReason?: SemanticFallbackReason;
    density: 'comfortable' | 'dense';
    onDensityChange: (density: 'comfortable' | 'dense') => void;
    onResetAll: () => void;
    supplementalActions?: ReactNode;
};

type DateRangeValue = {
    start: DateValue;
    end: DateValue;
} | null;

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

function getDateRangeValue(startDate?: string, endDate?: string): DateRangeValue {
    if (!startDate || !endDate) {
        return null;
    }

    try {
        return {
            start: parseDate(startDate),
            end: parseDate(endDate),
        };
    } catch {
        return null;
    }
}

export function SearchSortRow({
    searchMode,
    onSearchModeChange,
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
    semanticQuery,
    onSemanticQueryChange,
    onSemanticSearch,
    onClearSemanticSearch,
    isSemanticSearching,
    semanticResultsCount,
    semanticSearchMode,
    semanticFallbackReason,
    density,
    onDensityChange,
    onResetAll,
    supplementalActions,
}: SearchSortRowProps) {
    const isMobile = useIsMobile();
    const selectedContact = contacts.find((contact) => contact.id === contactId);
    const dateRangeValue = getDateRangeValue(startDate, endDate);
    const hasTextSearch = Boolean(search);
    const hasSemanticSearch = Boolean(semanticQuery) || semanticResultsCount !== undefined;
    const hasDateRange = Boolean(startDate || endDate);
    const hasContact = Boolean(selectedContact);
    const hasNonDefaultSort = sortBy !== 'date' || sortOrder !== 'desc';
    const activeFilterCount = [hasTextSearch, hasSemanticSearch, hasContact, hasDateRange, hasNonDefaultSort].filter(Boolean).length;
    const sortLabel = sortBy === 'duration'
        ? (sortOrder === 'desc' ? 'Longest duration' : 'Shortest duration')
        : (sortOrder === 'desc' ? 'Newest first' : 'Oldest first');
    const summaryParts = [
        hasTextSearch ? `Text: ${search}` : null,
        semanticResultsCount !== undefined ? `${semanticResultsCount} AI match${semanticResultsCount === 1 ? '' : 'es'}` : null,
        semanticSearchMode === 'fallback' ? 'Keyword fallback' : null,
        hasContact ? selectedContact?.name || selectedContact?.phoneNumbers?.[0] || 'Contact selected' : null,
        hasDateRange ? `${startDate || 'Any'} to ${endDate || 'Any'}` : null,
        hasNonDefaultSort ? sortLabel : null,
    ].filter(Boolean) as string[];
    const fallbackMessage = semanticFallbackReason === 'embedding_unavailable'
        ? 'AI embeddings were unavailable, so these results came from keyword matches in summaries and transcripts.'
        : 'Vector search was unavailable, so these results came from keyword matches in summaries and transcripts.';

    const resetFilters = () => {
        onResetAll();
    };

    return (
        <div className="space-y-3 md:space-y-4">
            <div className="flex flex-wrap items-center justify-between gap-2">
                <div className="flex items-center gap-2">
                    {activeFilterCount > 0 && (
                        <Chip variant="soft" color="warning" size="sm">
                            {activeFilterCount} active
                        </Chip>
                    )}
                    <div className="flex items-center gap-1.5 text-xs font-semibold uppercase tracking-[0.24em] text-primary">
                        {!isMobile && <Sparkles className="h-3.5 w-3.5" />}
                        {!isMobile && 'Search tools'}
                        <ContextHelp
                            title="Unified search"
                            description="Use one search surface for both exact text filtering and AI search."
                            points={[
                                'Text mode filters the live library as you type.',
                                'AI search finds similar conversations by intent or topic.',
                                'Open More filters for contact, date range, and sort order.',
                            ]}
                            placement="right"
                        />
                    </div>
                </div>
                <div className="inline-flex items-center rounded-full border border-default-200 bg-background/80 p-1">
                    <Button
                        size="sm"
                        variant={searchMode === 'text' ? 'secondary' : 'ghost'}
                        className="rounded-full px-3"
                        onPress={() => onSearchModeChange('text')}
                    >
                        Text
                    </Button>
                    <Button
                        size="sm"
                        variant={searchMode === 'semantic' ? 'secondary' : 'ghost'}
                        className="rounded-full px-3"
                        onPress={() => onSearchModeChange('semantic')}
                    >
                        AI search
                    </Button>
                </div>
            </div>

            {searchMode === 'semantic' ? (
                <>
                    <form
                        onSubmit={(event) => {
                            event.preventDefault();
                            onSemanticSearch();
                        }}
                        className="grid gap-2 md:gap-3 lg:grid-cols-[minmax(0,1fr)_auto_auto] lg:items-end"
                    >
                        <SearchField
                            aria-label="Search recordings with AI search"
                            value={semanticQuery}
                            onChange={onSemanticQueryChange}
                            className="w-full"
                            variant="secondary"
                        >
                            <SearchField.Group className="flex h-10 items-center overflow-hidden rounded-2xl border border-default-200 bg-background px-3 transition-all focus-within:border-primary focus-within:ring-1 focus-within:ring-primary/20 md:h-12">
                                <SearchField.SearchIcon className="mr-2 text-default-400" />
                                <SearchField.Input
                                    className="w-full border-none bg-transparent p-0 text-small placeholder:text-default-400 focus:ring-0"
                                    placeholder="AI search: payment confirmation calls"
                                />
                                <SearchField.ClearButton />
                            </SearchField.Group>
                        </SearchField>
                        <Button
                            type="submit"
                            isDisabled={isSemanticSearching || !semanticQuery.trim()}
                            className="h-10 rounded-full px-5 font-medium md:h-12 md:px-6"
                        >
                            {isSemanticSearching ? 'Searching...' : 'Search'}
                        </Button>
                        {semanticResultsCount !== undefined ? (
                            <Button
                                variant="ghost"
                                onPress={onClearSemanticSearch}
                                className="h-10 rounded-full px-4 text-danger md:h-12"
                            >
                                <X className="mr-1 h-4 w-4" />
                                {isMobile ? 'Clear' : 'Clear search'}
                            </Button>
                        ) : (
                            <div className="hidden lg:block" />
                        )}
                    </form>
                    {semanticSearchMode === 'fallback' && (
                        <div className="flex flex-wrap items-center gap-2 rounded-2xl border border-warning/25 bg-warning/8 px-3 py-2 text-sm text-default-700">
                            <Chip size="sm" color="warning" variant="soft">
                                Keyword fallback
                            </Chip>
                            <p>{fallbackMessage}</p>
                        </div>
                    )}
                </>
            ) : (
                <div className="grid gap-2 md:gap-3 lg:grid-cols-[minmax(0,1fr)_auto] lg:items-center">
                    <SearchField
                        aria-label="Filter recordings"
                        value={search}
                        onChange={onSearchChange}
                        className="w-full"
                        variant="secondary"
                    >
                        <SearchField.Group className="flex h-10 items-center overflow-hidden rounded-2xl border border-default-200 bg-background px-3 transition-all focus-within:border-primary focus-within:ring-1 focus-within:ring-primary/20 md:h-12">
                            <Filter className="mr-2 h-4 w-4 text-default-400" />
                            <SearchField.Input
                                className="w-full border-none bg-transparent p-0 text-small placeholder:text-default-400 focus:ring-0"
                                placeholder="Filter by contact, summary, transcript..."
                            />
                            <SearchField.ClearButton />
                        </SearchField.Group>
                    </SearchField>
                    {!isMobile && hasTextSearch ? (
                        <Button
                            variant="ghost"
                            className="h-12 rounded-full text-danger"
                            onPress={() => onSearchChange('')}
                        >
                            <X className="mr-1 h-4 w-4" />
                            Clear text
                        </Button>
                    ) : (
                        <div className="hidden lg:block" />
                    )}
                </div>
            )}

            <div className="flex flex-wrap items-center gap-1.5 md:gap-2">
                <Popover>
                    <Popover.Trigger>
                        <Button
                            variant={hasContact || hasDateRange || hasNonDefaultSort ? 'secondary' : 'ghost'}
                            className="rounded-full"
                            size={isMobile ? 'sm' : 'md'}
                        >
                            <SlidersHorizontal className="h-4 w-4" />
                            More filters
                        </Button>
                    </Popover.Trigger>
                    <Popover.Content placement="bottom start" offset={10} className="w-[min(94vw,24rem)] p-3">
                        <Popover.Dialog className="space-y-4">
                            <div className="space-y-1">
                                <Popover.Heading className="text-sm font-semibold text-foreground">
                                    Advanced filters
                                </Popover.Heading>
                                <p className="text-sm text-default-500">
                                    Contact, date, and sort stay on demand so search remains the main action.
                                </p>
                            </div>

                            <div className="space-y-3">
                                <div className="space-y-2">
                                    <label className="block text-small font-medium text-default-500">
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
                                        <Select.Trigger className="h-11 rounded-2xl">
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

                                <div className="space-y-2">
                                    <label className="flex items-center gap-2 text-small font-medium text-default-500">
                                        <CalendarRange className="h-4 w-4" />
                                        Date range
                                    </label>
                                    <DateRangePicker
                                        aria-label="Recordings date range"
                                        value={dateRangeValue}
                                        onChange={(value: DateRangeValue) => {
                                            if (!value) {
                                                onDateChange(undefined, undefined);
                                                return;
                                            }

                                            onDateChange(value.start.toString(), value.end.toString());
                                        }}
                                    >
                                        <DateField.Group fullWidth variant="secondary">
                                            <DateField.InputContainer>
                                                <DateField.Input slot="start">
                                                    {(segment) => <DateField.Segment segment={segment} />}
                                                </DateField.Input>
                                                <DateRangePicker.RangeSeparator />
                                                <DateField.Input slot="end">
                                                    {(segment) => <DateField.Segment segment={segment} />}
                                                </DateField.Input>
                                            </DateField.InputContainer>
                                            <DateField.Suffix>
                                                <DateRangePicker.Trigger>
                                                    <DateRangePicker.TriggerIndicator />
                                                </DateRangePicker.Trigger>
                                            </DateField.Suffix>
                                        </DateField.Group>
                                        <FieldError>Please select a valid start and end date.</FieldError>
                                        <DateRangePicker.Popover>
                                            <RangeCalendar aria-label="Choose recordings date range">
                                                <RangeCalendar.Header>
                                                    <RangeCalendar.Heading />
                                                    <div className="flex items-center gap-2">
                                                        <RangeCalendar.NavButton slot="previous" />
                                                        <RangeCalendar.NavButton slot="next" />
                                                    </div>
                                                </RangeCalendar.Header>
                                                <RangeCalendar.Grid>
                                                    <RangeCalendar.GridHeader>
                                                        {(day) => <RangeCalendar.HeaderCell>{day}</RangeCalendar.HeaderCell>}
                                                    </RangeCalendar.GridHeader>
                                                    <RangeCalendar.GridBody>
                                                        {(date) => <RangeCalendar.Cell date={date} />}
                                                    </RangeCalendar.GridBody>
                                                </RangeCalendar.Grid>
                                            </RangeCalendar>
                                        </DateRangePicker.Popover>
                                    </DateRangePicker>
                                </div>

                                <div className="space-y-2">
                                    <label className="block text-small font-medium text-default-500">
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
                                        <Select.Trigger className="h-11 rounded-2xl">
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
                        </Popover.Dialog>
                    </Popover.Content>
                </Popover>

                <div className="inline-flex items-center rounded-full border border-default-200 bg-background/80 p-1">
                    <Button
                        size="sm"
                        variant={density === 'comfortable' ? 'secondary' : 'ghost'}
                        className="rounded-full"
                        onPress={() => onDensityChange('comfortable')}
                    >
                        <LayoutGrid className="h-3.5 w-3.5" />
                        {!isMobile && 'Comfortable'}
                    </Button>
                    <Button
                        size="sm"
                        variant={density === 'dense' ? 'secondary' : 'ghost'}
                        className="rounded-full"
                        onPress={() => onDensityChange('dense')}
                    >
                        <Rows3 className="h-3.5 w-3.5" />
                        {!isMobile && 'Dense'}
                    </Button>
                </div>
                {supplementalActions}
            </div>

            {(summaryParts.length > 0 || density === 'comfortable') && (
                <Disclosure className="rounded-xl border border-default-200/80 bg-background/70">
                    <Disclosure.Heading>
                        <Disclosure.Trigger className="flex w-full cursor-pointer items-center justify-between gap-3 px-4 py-2.5">
                            <div className="min-w-0">
                                <div className="flex items-center gap-2 text-sm font-medium text-foreground">
                                    <SlidersHorizontal className="h-4 w-4 text-default-500" />
                                    Active setup
                                </div>
                                <div className="truncate text-sm text-default-500">
                                    {summaryParts.length > 0 ? summaryParts.join(' • ') : 'Comfortable density'}
                                </div>
                            </div>
                            <Disclosure.Indicator className="h-4 w-4 flex-shrink-0 text-default-400" />
                        </Disclosure.Trigger>
                    </Disclosure.Heading>
                    <Disclosure.Content>
                        <Disclosure.Body className="flex flex-wrap items-center gap-2 border-t border-default-100/80 px-4 py-3">
                            {hasTextSearch && (
                                <Chip variant="soft" color="default">
                                    Text: {search}
                                </Chip>
                            )}
                            {semanticResultsCount !== undefined && (
                                <Chip variant="soft" color="accent">
                                    <Sparkles className="mr-1 h-3.5 w-3.5" />
                                    {semanticResultsCount} AI match{semanticResultsCount === 1 ? '' : 'es'}
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
                            {hasNonDefaultSort && (
                                <Chip variant="soft" color="default">
                                    {sortLabel}
                                </Chip>
                            )}
                            {density === 'comfortable' && (
                                <Chip variant="soft" color="default">
                                    Comfortable density
                                </Chip>
                            )}
                            <Button
                                size="sm"
                                variant="ghost"
                                className="rounded-full text-danger"
                                onPress={resetFilters}
                            >
                                <X className="mr-1 h-4 w-4" />
                                Reset
                            </Button>
                        </Disclosure.Body>
                    </Disclosure.Content>
                </Disclosure>
            )}
        </div>
    );
}
