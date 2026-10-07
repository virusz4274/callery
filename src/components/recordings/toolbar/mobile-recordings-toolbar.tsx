'use client';

import { useState } from 'react';
import { Button, Input, Label, Modal, SearchField, TextField } from '@heroui/react';
import { SlidersHorizontal } from 'lucide-react';
import type { MobileRecordingFilters, RecordingsToolbarProps } from './types';
import { ContactFilterPicker } from './contact-filter-picker';
import { ActiveFilters } from './active-filters';
import { SemanticFeedback } from './semantic-feedback';
import { RecordingDateField, RecordingSortSelect } from './recording-filter-fields';

export function MobileRecordingsToolbar(props: RecordingsToolbarProps) {
  const [open, setOpen] = useState(false);
  const [draft, setDraft] = useState<MobileRecordingFilters>(() => snapshot(props));
  const [name, setName] = useState('');
  const count = Number(Boolean(props.contactId)) + Number(Boolean(props.startDate || props.endDate)) + Number(props.sortBy !== 'date' || props.sortOrder !== 'desc') + Number(Boolean(props.activeSmartCollectionId)) + Number(Boolean(props.activeViewId));
  const update = (values: Partial<MobileRecordingFilters>) => setDraft(current => ({ ...current, viewId: undefined, collectionId: undefined, ...values }));
  return <div id="semantic-search" className="scroll-mt-24 space-y-2">
    <div className="flex gap-2" role="group" aria-label="Recording search mode">
      {(['text', 'semantic'] as const).map(mode => <Button key={mode} variant={props.searchMode === mode ? 'secondary' : 'ghost'} className="min-h-11 min-w-0 flex-1 px-2 text-sm" aria-pressed={props.searchMode === mode} onPress={() => props.onSearchModeChange(mode)}>{mode === 'text' ? 'Text' : 'AI search'}</Button>)}
      {props.searchMode === 'text' && <Button className="min-h-11 min-w-0 shrink-0 px-2 text-sm" variant={count ? 'secondary' : 'ghost'} onPress={() => { setDraft(snapshot(props)); setOpen(true); }}><SlidersHorizontal className="size-4" />Filters{count > 0 ? ` (${count})` : ''}</Button>}
    </div>
    <form onSubmit={event => { event.preventDefault(); if (props.searchMode === 'semantic') props.onSemanticSearch(); }} className="flex gap-2">
      <SearchField aria-label={props.searchMode === 'text' ? 'Filter recordings' : 'Search recordings with AI search'} value={props.searchMode === 'text' ? props.search : props.semanticQuery}
        onChange={props.searchMode === 'text' ? props.onSearchChange : props.onSemanticQueryChange} className="min-w-0 flex-1" variant="secondary">
        <SearchField.Group className="flex min-h-11 items-center rounded-lg border border-border bg-field px-3">
          <SearchField.SearchIcon className="mr-2 shrink-0 text-muted" />
          <SearchField.Input className="min-w-0 flex-1 bg-transparent text-base" placeholder={props.searchMode === 'text' ? 'Search recordings' : 'Describe a conversation'} />
          <SearchField.ClearButton className="size-11" aria-label={props.searchMode === 'semantic' ? 'Clear AI search' : 'Clear text search'} onPress={props.searchMode === 'semantic' ? props.onClearSemanticSearch : undefined} />
        </SearchField.Group>
      </SearchField>
      {props.searchMode === 'semantic' && <Button type="submit" className="min-h-11" isPending={props.isSemanticSearching} isDisabled={!props.semanticQuery.trim() || props.isSemanticSearching}>Search</Button>}
    </form>
    <ActiveFilters {...props} />
    <SemanticFeedback {...props} />
    <Modal.Backdrop isOpen={open} onOpenChange={setOpen}>
      <Modal.Container className="items-end p-0">
        <Modal.Dialog className="flex max-h-[90dvh] w-full max-w-none flex-col rounded-t-2xl bg-background p-0">
          <Modal.Header className="border-b border-border p-4"><Modal.Heading>Recording filters</Modal.Heading></Modal.Header>
          <Modal.Body className="min-h-0 overflow-y-auto space-y-4 p-4">
            <ContactFilterPicker contactId={draft.contactId} onChange={contactId => update({ contactId })} />
            <div className="grid grid-cols-2 gap-3">
              <RecordingDateField label="From date" value={draft.startDate} max={draft.endDate} onChange={startDate => update({ startDate })} />
              <RecordingDateField label="To date" value={draft.endDate} min={draft.startDate} onChange={endDate => update({ endDate })} />
            </div>
            <RecordingSortSelect value={`${draft.sortBy}-${draft.sortOrder}`} onChange={value => { const [sortBy, sortOrder] = value.split('-') as [MobileRecordingFilters['sortBy'], MobileRecordingFilters['sortOrder']]; update({ sortBy, sortOrder }); }} />
            <fieldset><legend className="mb-1 text-sm font-medium">Row density</legend><div className="flex gap-2">{(['comfortable', 'dense'] as const).map(density => <Button key={density} variant={draft.density === density ? 'secondary' : 'ghost'} className="min-h-11 flex-1" aria-pressed={draft.density === density} onPress={() => update({ density })}>{density === 'dense' ? 'Dense' : 'Comfortable'}</Button>)}</div></fieldset>
            <fieldset><legend className="mb-2 text-sm font-medium">Collections</legend><div className="flex flex-wrap gap-2">{props.smartCollections.map(collection => <Button key={collection.id} className="min-h-11" variant={draft.collectionId === collection.id ? 'secondary' : 'ghost'} onPress={() => {
              const end = new Date(); const start = new Date(end.getTime() - 6 * 86400000);
              update({ collectionId: collection.id, ...(collection.id === 'recent-week' ? { startDate: start.toISOString().slice(0, 10), endDate: end.toISOString().slice(0, 10), sortBy: 'date', sortOrder: 'desc' } : collection.id === 'longest-calls' ? { sortBy: 'duration', sortOrder: 'desc' } : {}) });
            }}>{collection.name}</Button>)}</div></fieldset>
            <div className="space-y-2"><h3 className="text-sm font-medium">Saved views</h3>{props.savedViews.map(view => <div key={view.id} className="flex gap-2"><Button className="min-h-11 min-w-0 flex-1 justify-start" variant={draft.viewId === view.id ? 'secondary' : 'ghost'} onPress={() => setDraft({ ...view, search: view.search || '', density: draft.density, viewId: view.id, collectionId: view.needsTranscription ? 'needs-transcription' : undefined })}>{view.name}</Button><Button variant="ghost" className="min-h-11" aria-label={`Delete ${view.name} view`} onPress={() => props.onDeleteSavedView(view.id)}>Delete</Button></div>)}
              <TextField value={name} onChange={setName}><Label>Save currently applied filters as</Label><Input className="min-h-11 text-base" placeholder="View name" maxLength={80} /></TextField>
              <Button variant="ghost" className="min-h-11" isDisabled={!name.trim()} onPress={() => { props.onSaveCurrentView(name.trim()); setName(''); setOpen(false); }}>Save current view</Button>
            </div>
          </Modal.Body>
          <Modal.Footer className="flex gap-2 border-t border-border p-4 pb-[max(1rem,env(safe-area-inset-bottom))]">
            <Button variant="ghost" className="min-h-11" onPress={() => setDraft({ search: '', sortBy: 'date', sortOrder: 'desc', density: draft.density })}>Clear</Button>
            <Button variant="ghost" className="min-h-11" onPress={() => setOpen(false)}>Cancel</Button>
            <Button className="min-h-11 flex-1" isDisabled={Boolean(draft.startDate && draft.endDate && draft.startDate > draft.endDate)} onPress={() => { props.onApplyMobileFilters(draft); setOpen(false); }}>Apply</Button>
          </Modal.Footer>
        </Modal.Dialog>
      </Modal.Container>
    </Modal.Backdrop>
  </div>;
}

function snapshot(props: RecordingsToolbarProps): MobileRecordingFilters {
  return { search: props.search, contactId: props.contactId, startDate: props.startDate, endDate: props.endDate, sortBy: props.sortBy, sortOrder: props.sortOrder, density: props.density, viewId: props.activeViewId, collectionId: props.activeSmartCollectionId };
}
