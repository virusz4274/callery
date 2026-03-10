'use client';

import { Button } from '@heroui/react';
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
        <div className="flex justify-center p-4 gap-2 items-center border-t border-default-100">
            <Button
                variant="ghost"
                size="sm"
                isIconOnly
                isDisabled={currentPage === 1}
                onPress={() => onPageChange(currentPage - 1)}
            >
                <ChevronLeft className="h-4 w-4" />
            </Button>
            <span className="text-small text-default-500">
                Page {currentPage} of {totalPages}
            </span>
            <Button
                variant="ghost"
                size="sm"
                isIconOnly
                isDisabled={currentPage === totalPages}
                onPress={() => onPageChange(currentPage + 1)}
            >
                <ChevronRight className="h-4 w-4" />
            </Button>
        </div>
    );
}
