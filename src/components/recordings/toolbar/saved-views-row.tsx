import React from 'react';
import { Button, Chip, Input, Popover } from '@heroui/react';
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
        <div className="space-y-4 border-t border-default-100/80 pt-4">
            <div className="flex flex-wrap items-center justify-between gap-3">
                <div className="space-y-1">
                    <div className="text-xs font-semibold uppercase tracking-[0.22em] text-default-400">
                        Views and collections
                    </div>
                    <p className="text-sm text-default-600">
                        Save your favorite filter combinations and switch to smart presets instantly.
                    </p>
                </div>

                <Popover>
                    <Popover.Trigger>
                        <Button size="sm" variant="secondary" className="rounded-full">
                            <BookmarkPlus className="h-4 w-4" />
                            Save current view
                        </Button>
                    </Popover.Trigger>
                    <Popover.Content placement="bottom end" className="w-[290px] p-3">
                        <Popover.Dialog className="space-y-3">
                            <div className="text-sm font-semibold text-foreground">Save filters as a view</div>
                            <Input
                                aria-label="Saved view name"
                                value={draftName}
                                onChange={(event) => setDraftName(event.target.value)}
                                placeholder="Example: Weekly pipeline calls"
                                variant="secondary"
                            />
                            <Button
                                size="sm"
                                className="w-full rounded-full"
                                onPress={() => {
                                    const trimmed = draftName.trim();
                                    if (!trimmed) {
                                        return;
                                    }
                                    onSaveCurrentView(trimmed);
                                    setDraftName('');
                                }}
                            >
                                Save view
                            </Button>
                        </Popover.Dialog>
                    </Popover.Content>
                </Popover>
            </div>

            <div className="flex flex-wrap items-center gap-2">
                {smartCollections.map((collection) => (
                    <button
                        key={collection.id}
                        type="button"
                        onClick={() => onApplySmartCollection(collection.id)}
                        className={`inline-flex items-center gap-2 rounded-full border px-3 py-1.5 text-xs font-semibold transition-colors ${
                            activeSmartCollectionId === collection.id
                                ? 'border-accent/30 bg-accent/10 text-accent'
                                : 'border-default-200 bg-default-50 text-default-600 hover:border-default-300 hover:text-foreground'
                        }`}
                        title={collection.description}
                    >
                        <Sparkles className="h-3.5 w-3.5" />
                        {collection.name}
                    </button>
                ))}
            </div>

            <div className="flex flex-wrap items-center gap-2">
                <Chip variant="soft" color="default" size="sm">
                    <Bookmark className="mr-1 h-3.5 w-3.5" />
                    Saved views
                </Chip>
                {savedViews.length === 0 && (
                    <span className="text-xs text-default-400">No saved views yet</span>
                )}
                {savedViews.map((view) => (
                    <div key={view.id} className="flex items-center rounded-full border border-default-200 bg-background pr-1">
                        <button
                            type="button"
                            onClick={() => onApplySavedView(view.id)}
                            className={`rounded-full px-3 py-1.5 text-xs font-semibold transition-colors ${
                                activeViewId === view.id
                                    ? 'bg-primary/10 text-primary'
                                    : 'text-default-600 hover:text-foreground'
                            }`}
                        >
                            {view.name}
                        </button>
                        <button
                            type="button"
                            onClick={() => onDeleteSavedView(view.id)}
                            className="inline-flex h-6 w-6 items-center justify-center rounded-full text-default-400 hover:bg-danger/10 hover:text-danger"
                            aria-label={`Delete ${view.name}`}
                        >
                            <Trash2 className="h-3.5 w-3.5" />
                        </button>
                    </div>
                ))}
            </div>
        </div>
    );
}
