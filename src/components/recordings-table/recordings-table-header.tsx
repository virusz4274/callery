import { Button, Card } from '@heroui/react';
import { Loader2, Trash2 } from 'lucide-react';
import { useCanDeleteRecording } from '@/hooks/use-team-policy';

type RecordingsTableHeaderProps = {
    totalCount: number;
    displayedCount: number;
    selectedCount: number;
    isDeleting: boolean;
    isSelectionMode: boolean;
    onToggleSelectionMode: () => void;
    onDeleteSelection: () => void;
    variant?: 'default' | 'flat';
    density?: 'comfortable' | 'dense';
    isSemantic?: boolean;
};

export function RecordingsTableHeader({
    totalCount,
    displayedCount,
    selectedCount,
    isDeleting,
    isSelectionMode,
    onToggleSelectionMode,
    onDeleteSelection,
    variant = 'default',
    density = 'comfortable',
    isSemantic = false,
}: RecordingsTableHeaderProps) {
    const canDelete = useCanDeleteRecording();
    return (
        <Card.Header
            role={isSelectionMode ? "region" : undefined}
            aria-label={isSelectionMode ? "Recording selection" : undefined}
            className={`flex flex-row items-center justify-between gap-3 px-4 ${
                density === 'dense' ? 'py-2.5 md:px-3 md:py-3' : 'py-3 md:px-4'
            } ${
                variant === 'flat' ? 'px-0 py-2 border-none' : 'border-b border-default-100/50'
            }`}
        >
            <div>
                <h2 className="sr-only">
                    {selectedCount > 0 ? 'Selection active' : isSemantic ? 'AI search results' : 'Recordings'}
                </h2>
                <p className="text-sm text-muted">
                    {isSelectionMode || selectedCount > 0
                        ? `${selectedCount} selected`
                        : isSemantic ? `${displayedCount} matches on this page · Ranked by relevance` : `Showing ${displayedCount} of ${totalCount} recordings`}
                </p>
            </div>

            <div className="flex flex-wrap items-center gap-2">
                {canDelete && selectedCount > 0 && (
                    <Button
                        variant="danger"
                        size="sm"
                        onPress={onDeleteSelection}
                        isDisabled={isDeleting}
                        className="min-h-11 font-medium md:min-h-8"
                    >
                        {isDeleting ? (
                            <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                        ) : (
                            <Trash2 className="mr-2 h-4 w-4" />
                        )}
                        Delete ({selectedCount})
                    </Button>
                )}

                <div className="lg:hidden">
                    {isSelectionMode ? (
                        <Button size="sm" variant="ghost" className="min-h-11 md:min-h-8" onPress={onToggleSelectionMode}>
                            Cancel
                        </Button>
                    ) : (
                        <Button size="sm" variant="ghost" className="min-h-11 md:min-h-8" onPress={onToggleSelectionMode}>
                            Select items
                        </Button>
                    )}
                </div>

            </div>
        </Card.Header>
    );
}
