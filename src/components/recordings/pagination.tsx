import React from 'react';
import { Button } from '@heroui/react';
// Step 348 said: "Pagination" was NOT in the list.
// So I must build a custom one using Buttons.

import { ChevronLeft, ChevronRight } from 'lucide-react';

interface CustomPaginationProps {
    page: number;
    total: number;
    onChange: (page: number) => void;
}

export function CustomPagination({ page, total, onChange }: CustomPaginationProps) {
    if (total <= 1) return null;

    // Simple implementation for now: Prev | Current / Total | Next
    // Can be enhanced to show page numbers [1, 2, 3 ... 10]

    return (
        <div className="flex items-center gap-2">
            <Button
                isIconOnly
                variant="ghost"
                isDisabled={page <= 1}
                onPress={() => onChange(page - 1)}
                size="sm"
            >
                <ChevronLeft className="w-4 h-4" />
            </Button>

            <span className="text-small text-default-500 font-medium">
                Page {page} of {total}
            </span>

            <Button
                isIconOnly
                variant="ghost"
                isDisabled={page >= total}
                onPress={() => onChange(page + 1)}
                size="sm"
            >
                <ChevronRight className="w-4 h-4" />
            </Button>
        </div>
    );
}
