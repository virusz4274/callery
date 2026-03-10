'use client';

import React from 'react';
import { Button } from '@heroui/react';
import { ChevronLeft, ChevronRight } from 'lucide-react';

type AuditLogsPaginationProps = {
    currentPage: number;
    totalPages: number;
    onPageChange: (page: number) => void;
};

export function AuditLogsPagination({ currentPage, totalPages, onPageChange }: AuditLogsPaginationProps) {
    if (totalPages <= 1) {
        return null;
    }

    return (
        <div className="flex justify-center items-center gap-4 mt-4">
            <Button
                size="sm"
                variant="ghost"
                isDisabled={currentPage <= 1}
                onPress={() => onPageChange(currentPage - 1)}
            >
                <ChevronLeft size={16} />
                Previous
            </Button>
            <span className="text-sm text-default-400">
                Page {currentPage} of {totalPages}
            </span>
            <Button
                size="sm"
                variant="ghost"
                isDisabled={currentPage >= totalPages}
                onPress={() => onPageChange(currentPage + 1)}
            >
                Next
                <ChevronRight size={16} />
            </Button>
        </div>
    );
}
