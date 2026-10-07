import { Button } from '@heroui/react';
import { X } from 'lucide-react';
import { useContactDetails } from '@/hooks/use-contact-details';
import { useUser } from '@/lib/auth/client';
import type { RecordingsToolbarProps } from './types';

export function ActiveFilters(props: RecordingsToolbarProps) {
    const { user } = useUser();
    const { data: contact } = useContactDetails(user?.id, props.contactId);
    const chips: Array<{ id: string; label: string; clear: () => void }> = [];
    if (props.search) chips.push({ id: 'search', label: `Text: ${props.search}`, clear: () => props.onSearchChange('') });
    if (props.contactId) chips.push({ id: 'contact', label: contact?.name || contact?.phoneNumbers?.[0] || 'Contact', clear: () => props.onContactChange(undefined) });
    if (props.startDate || props.endDate) chips.push({ id: 'date', label: `${props.startDate || 'Any date'} – ${props.endDate || 'Any date'}`, clear: () => props.onDateChange(undefined, undefined) });
    if (props.sortBy !== 'date' || props.sortOrder !== 'desc') chips.push({ id: 'sort', label: props.sortBy === 'duration' ? (props.sortOrder === 'desc' ? 'Longest first' : 'Shortest first') : 'Oldest first', clear: () => props.onSortChange('date', 'desc') });
    const removePreset = (kind: 'view' | 'collection') => props.onApplyMobileFilters({
        search: props.search, contactId: props.contactId, startDate: props.startDate, endDate: props.endDate,
        sortBy: props.sortBy, sortOrder: props.sortOrder, density: props.density,
        viewId: kind === 'view' ? undefined : props.activeViewId,
        collectionId: kind === 'collection' ? undefined : props.activeSmartCollectionId,
    });
    if (props.activeSmartCollectionId) chips.push({ id: 'collection', label: props.smartCollections.find(item => item.id === props.activeSmartCollectionId)?.name || 'Collection', clear: () => removePreset('collection') });
    if (props.activeViewId) chips.push({ id: 'view', label: props.savedViews.find(item => item.id === props.activeViewId)?.name || 'Saved view', clear: () => removePreset('view') });
    if (!chips.length || props.searchMode === 'semantic') return null;
    return <div className="flex flex-wrap items-center gap-2" aria-label="Active recording filters">
        {chips.map(chip => <Button key={chip.id} variant="secondary" size="sm" className="h-auto min-h-11 max-w-full whitespace-normal text-left md:min-h-8" onPress={chip.clear} aria-label={`Remove ${chip.label} filter`}>{chip.label}<X className="size-3.5 shrink-0" /></Button>)}
        <Button variant="ghost" size="sm" className="min-h-11 md:min-h-8" onPress={props.onResetAll}>Clear filters</Button>
    </div>;
}
