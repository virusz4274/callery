import React from 'react';
import { Button, Card } from '@heroui/react';
import { ChevronLeft, ChevronRight } from 'lucide-react';

type RecordingsTableFooterProps = {
    page: number;
    totalPages: number;
    onPageChange: (page: number) => void;
    variant?: 'default' | 'flat';
};

export function RecordingsTableFooter({
    page,
    totalPages,
    onPageChange,
    variant = 'default',
}: RecordingsTableFooterProps) {
    if (totalPages <= 1) {
        return null;
    }

    return (
        <Card.Footer
            className={`flex items-center justify-between px-4 py-3 md:px-6 md:py-4 ${
                variant === 'flat' ? 'px-0 border-none' : 'border-t border-default-100/50'
            }`}
        >
            <span className="text-xs text-default-400 uppercase tracking-widest font-semibold">
                Page {page} of {totalPages}
            </span>
            <div className="flex gap-2">
                <Button
                    variant="ghost"
                    size="sm"
                    onPress={() => onPageChange(Math.max(1, page - 1))}
                    isDisabled={page === 1}
                    className="bg-default-100/50 backdrop-blur-md"
                >
                    <ChevronLeft className="h-4 w-4 mr-1" /> Previous
                </Button>
                <Button
                    variant="ghost"
                    size="sm"
                    onPress={() => onPageChange(Math.min(totalPages, page + 1))}
                    isDisabled={page === totalPages}
                    className="bg-default-100/50 backdrop-blur-md"
                >
                    Next <ChevronRight className="h-4 w-4 ml-1" />
                </Button>
            </div>
        </Card.Footer>
    );
}
