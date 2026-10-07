import { Button, Popover, SearchField, Tooltip } from '@heroui/react';
import { LayoutGrid, Rows3, SlidersHorizontal } from 'lucide-react';
import type { ReactNode } from 'react';
import type { RecordingsToolbarProps } from './types';
import { ContactFilterPicker } from './contact-filter-picker';
import { ActiveFilters } from './active-filters';
import { SemanticFeedback } from './semantic-feedback';
import { RecordingDateField, RecordingSortSelect } from './recording-filter-fields';

export function SearchSortRow(props: RecordingsToolbarProps & { supplementalActions?: ReactNode }) {
    const semantic = props.searchMode === 'semantic';
    return <div className="space-y-3">
        <div className="flex items-center gap-3">
            <form onSubmit={event => { event.preventDefault(); if (semantic) props.onSemanticSearch(); }} className="flex min-w-0 flex-1 gap-2">
                <SearchField aria-label={semantic ? 'Search recordings with AI search' : 'Filter recordings'} value={semantic ? props.semanticQuery : props.search}
                    onChange={semantic ? props.onSemanticQueryChange : props.onSearchChange} className="min-w-0 flex-1" variant="secondary">
                    <SearchField.Group className="flex min-h-11 items-center rounded-lg border border-border bg-background px-3">
                        <SearchField.SearchIcon className="mr-2 shrink-0 text-muted" />
                        <SearchField.Input className="min-w-0 flex-1 bg-transparent text-base" placeholder={semantic ? 'Describe a conversation' : 'Search contacts, summaries, transcripts…'} />
                        <SearchField.ClearButton aria-label={semantic ? 'Clear AI search' : 'Clear text search'} onPress={semantic ? props.onClearSemanticSearch : undefined} />
                    </SearchField.Group>
                </SearchField>
                {semantic && <Button type="submit" className="min-h-11" isPending={props.isSemanticSearching} isDisabled={!props.semanticQuery.trim() || props.isSemanticSearching}>Search</Button>}
            </form>
            <div className="inline-flex shrink-0 items-center rounded-lg border border-border bg-surface-secondary p-1" role="group" aria-label="Recording search mode">
                {(['text', 'semantic'] as const).map(mode => <Button key={mode} size="sm" variant={props.searchMode === mode ? 'secondary' : 'ghost'} aria-pressed={props.searchMode === mode} onPress={() => props.onSearchModeChange(mode)}>{mode === 'text' ? 'Text' : 'AI search'}</Button>)}
            </div>
        </div>
        {!semantic && <div className="flex flex-wrap items-center gap-2">
            <Popover>
                <Button variant={props.contactId || props.startDate || props.endDate ? 'secondary' : 'ghost'} size="sm"><SlidersHorizontal className="size-4" />Filters</Button>
                <Popover.Content placement="bottom start" offset={8} className="w-[min(94vw,24rem)] p-4">
                    <Popover.Dialog className="space-y-4">
                        <Popover.Heading className="text-base font-semibold">Recording filters</Popover.Heading>
                        <ContactFilterPicker contactId={props.contactId} onChange={props.onContactChange} />
                        <div className="grid grid-cols-2 gap-3">
                            <RecordingDateField label="From date" value={props.startDate} max={props.endDate} onChange={value => props.onDateChange(value, props.endDate)} />
                            <RecordingDateField label="To date" value={props.endDate} min={props.startDate} onChange={value => props.onDateChange(props.startDate, value)} />
                        </div>
                    </Popover.Dialog>
                </Popover.Content>
            </Popover>
            <RecordingSortSelect value={`${props.sortBy}-${props.sortOrder}`} onChange={value => { const [by, order] = value.split('-'); props.onSortChange(by, order); }} />
            {props.supplementalActions}
            <div className="ml-auto inline-flex rounded-lg border border-border bg-surface-secondary p-1" role="group" aria-label="Row density">
                <Tooltip><Button isIconOnly size="sm" variant={props.density === 'comfortable' ? 'secondary' : 'ghost'} aria-label="Comfortable density" aria-pressed={props.density === 'comfortable'} onPress={() => props.onDensityChange('comfortable')}><LayoutGrid className="size-4" /></Button><Tooltip.Content>Comfortable density</Tooltip.Content></Tooltip>
                <Tooltip><Button isIconOnly size="sm" variant={props.density === 'dense' ? 'secondary' : 'ghost'} aria-label="Dense density" aria-pressed={props.density === 'dense'} onPress={() => props.onDensityChange('dense')}><Rows3 className="size-4" /></Button><Tooltip.Content>Dense density</Tooltip.Content></Tooltip>
            </div>
        </div>}
        <ActiveFilters {...props} />
        <SemanticFeedback {...props} />
    </div>;
}
