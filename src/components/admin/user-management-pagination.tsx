'use client';

import { Button, Chip } from '@heroui/react';
import { ChevronLeft, ChevronRight } from 'lucide-react';

type UserManagementPaginationProps = {
    currentPage: number;
    totalPages: number;
    onPageChange: (page: number) => void;
};

export function UserManagementPagination({
    currentPage,
    totalPages,
    onPageChange,
}: UserManagementPaginationProps) {
    if (totalPages <= 1) {
        return null;
    }

    return (
        <div className="flex flex-col gap-3 border-t border-default-100/80 px-5 py-4 sm:flex-row sm:items-center sm:justify-between">
            <p className="text-sm text-default-500">Move through the user list without losing your current search context.</p>
            <div className="flex items-center justify-between gap-3 sm:justify-end">
                <Button
                    variant="ghost"
                    size="sm"
                    isDisabled={currentPage === 1}
                    onPress={() => onPageChange(currentPage - 1)}
                    className="gap-2"
                >
                    <ChevronLeft className="h-4 w-4" />
                    Previous
                </Button>
                <Chip variant="soft" color="default" className="rounded-full px-3 py-1 text-xs font-semibold">
                    Page {currentPage} of {totalPages}
                </Chip>
                <Button
                    variant="ghost"
                    size="sm"
                    isDisabled={currentPage === totalPages}
                    onPress={() => onPageChange(currentPage + 1)}
                    className="gap-2"
                >
                    Next
                    <ChevronRight className="h-4 w-4" />
                </Button>
            </div>
        </div>
    );
}
