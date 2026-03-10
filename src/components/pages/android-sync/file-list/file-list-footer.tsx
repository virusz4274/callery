import React from 'react';
import { CustomPagination } from '@/components/recordings/pagination';

type FileListFooterProps = {
    filteredCount: number;
    page: number;
    totalPages: number;
    onPageChange: (page: number) => void;
};

const ROWS_PER_PAGE = 50;

export function FileListFooter({ filteredCount, page, totalPages, onPageChange }: FileListFooterProps) {
    const start = Math.min(filteredCount, (page - 1) * ROWS_PER_PAGE + 1);
    const end = Math.min(filteredCount, page * ROWS_PER_PAGE);

    return (
        <div className="p-3 border-t border-default-100 bg-content1 flex justify-between items-center shrink-0">
            <div className="text-sm text-muted-foreground">
                Showing {start} - {end} of {filteredCount}
            </div>
            <CustomPagination page={page} total={totalPages} onChange={onPageChange} />
        </div>
    );
}
