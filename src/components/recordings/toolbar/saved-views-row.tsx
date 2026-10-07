import React from 'react';
import { Button, Chip, Input, Label, Popover, TextField } from '@heroui/react';
import { ContextHelp } from '@/components/context-help';
import { Bookmark, BookmarkPlus, Sparkles, Trash2 } from 'lucide-react';
import type { SavedRecordingsView, SmartCollection } from './types';

type SavedViewsRowProps = {
    savedViews: SavedRecordingsView[];
    activeViewId?: string;
    smartCollections: SmartCollection[];
    activeSmartCollectionId?: string;
    onApplySavedView: (viewId: string) => void;
    onDeleteSavedView: (viewId: string) => void;
    onSaveCurrentView: (name: string) => void;
    onApplySmartCollection: (collectionId: string) => void;
};

export function SavedViewsRow({
    savedViews,
    activeViewId,
    smartCollections,
    activeSmartCollectionId,
    onApplySavedView,
    onDeleteSavedView,
    onSaveCurrentView,
    onApplySmartCollection,
}: SavedViewsRowProps) {
    const [draftName, setDraftName] = React.useState('');

    return (
        <div className="flex flex-wrap items-center gap-2">
            <Popover>
                    <Button size="sm" variant="ghost" className="rounded-full">
                        <Bookmark className="h-4 w-4" />
                        Views
                    </Button>
                <Popover.Content placement="bottom start" offset={10} className="w-[min(94vw,24rem)] p-3">
                    <Popover.Dialog className="space-y-4">
                        <div className="flex items-center gap-2 text-xs font-semibold uppercase tracking-[0.22em] text-default-400">
                            Views and collections
                            <ContextHelp
                                title="Views and collections"
                                description="Saved views remember filters. Collections apply presets."
                                placement="right"
                            />
                        </div>

                        <div className="flex flex-wrap items-center gap-2">
                            {smartCollections.map((collection) => (
                                <Button key={collection.id} size="sm" variant={activeSmartCollectionId === collection.id ? 'secondary' : 'ghost'}
                                    aria-pressed={activeSmartCollectionId === collection.id} className="min-h-11 md:min-h-8"
                                    onPress={() => onApplySmartCollection(collection.id)} aria-description={collection.description}>
                                    <Sparkles className="size-4" />{collection.name}
                                </Button>
                            ))}
                        </div>

                        <div className="space-y-2">
                            <div className="flex items-center gap-2">
                                <Chip variant="soft" color="default" size="sm">
                                    <Bookmark className="mr-1 h-3.5 w-3.5" />
                                    Saved views
                                </Chip>
                                {savedViews.length === 0 && (
                                    <span className="text-xs text-default-400">No saved views yet</span>
                                )}
                            </div>
                            <div className="flex flex-wrap items-center gap-2">
                                {savedViews.map((view) => (
                                    <div key={view.id} className="flex items-center gap-1">
                                        <Button size="sm" variant={activeViewId === view.id ? 'secondary' : 'ghost'} aria-pressed={activeViewId === view.id}
                                            className="min-h-11 md:min-h-8" onPress={() => onApplySavedView(view.id)}>{view.name}</Button>
                                        <Button isIconOnly size="sm" variant="ghost" className="min-h-11 min-w-11 text-danger md:min-h-8 md:min-w-8"
                                            onPress={() => onDeleteSavedView(view.id)} aria-label={`Delete ${view.name}`}><Trash2 className="size-4" /></Button>
                                    </div>
                                ))}
                            </div>
                        </div>

                        <div className="space-y-3 border-t border-default-100 pt-3">
                            <div className="text-sm font-semibold text-foreground">Save filters as a view</div>
                            <TextField value={draftName} onChange={setDraftName}><Label>Saved view name</Label><Input
                                placeholder="Example: Weekly pipeline calls"
                                variant="secondary"
                            /></TextField>
                            <Button
                                size="sm"
                                className="w-full rounded-full"
                                isDisabled={!draftName.trim()}
                                onPress={() => {
                                    const trimmed = draftName.trim();
                                    if (!trimmed) {
                                        return;
                                    }
                                    onSaveCurrentView(trimmed);
                                    setDraftName('');
                                }}
                            >
                                <BookmarkPlus className="h-4 w-4" />
                                Save current view
                            </Button>
                        </div>
                    </Popover.Dialog>
                </Popover.Content>
            </Popover>

        </div>
    );
}
