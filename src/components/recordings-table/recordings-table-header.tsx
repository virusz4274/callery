import React from 'react';
import { Button, Card } from '@heroui/react';
import { Loader2, Trash2 } from 'lucide-react';

type RecordingsTableHeaderProps = {
    totalCount: number;
    displayedCount: number;
    selectedCount: number;
    isDeleting: boolean;
    isSelectionMode: boolean;
    onToggleSelectionMode: () => void;
    onDeleteSelection: () => void;
    variant?: 'default' | 'flat';
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
}: RecordingsTableHeaderProps) {
    return (
        <Card.Header
            className={`flex flex-col sm:flex-row items-start sm:items-center justify-between gap-3 px-4 py-3 md:gap-4 md:p-6 ${
                variant === 'flat' ? 'px-0 py-2 border-none' : 'border-b border-default-100/50'
            }`}
        >
            <div>
                <h2 className="text-lg font-semibold text-foreground">Recent Recordings</h2>
                <p className="text-sm text-default-500">
                    {selectedCount > 0
                        ? `${selectedCount} item(s) selected`
                        : `Showing ${displayedCount} of ${totalCount} recordings`}
                </p>
            </div>

            {selectedCount > 0 && (
                <Button
                    variant="danger"
                    size="sm"
                    onPress={onDeleteSelection}
                    isDisabled={isDeleting}
                    className="animate-appearance-in font-medium"
                >
                    {isDeleting ? (
                        <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                    ) : (
                        <Trash2 className="mr-2 h-4 w-4" />
                    )}
                    Delete Selection ({selectedCount})
                </Button>
            )}

            <div className="md:hidden">
                {isSelectionMode ? (
                    <Button size="sm" variant="ghost" onPress={onToggleSelectionMode}>
                        Cancel
                    </Button>
                ) : null}
            </div>
        </Card.Header>
    );
}
