'use client';

import React from 'react';
import { Chip } from '@heroui/react';
import { CustomPagination } from '@/components/recordings/pagination';

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
        <div className="mt-6 flex flex-col gap-3 border-t border-default-100/80 pt-5 sm:flex-row sm:items-center sm:justify-between">
            <p className="text-sm text-default-500">
                Review adjacent pages to verify who changed what and when.
            </p>
            <div className="flex flex-wrap items-center justify-between gap-3 sm:justify-end">
                <Chip variant="soft" color="default" className="rounded-full px-3 py-1 text-xs font-semibold">
                    Page {currentPage} of {totalPages}
                </Chip>
                <CustomPagination page={currentPage} total={totalPages} onChange={onPageChange} />
            </div>
        </div>
    );
}
