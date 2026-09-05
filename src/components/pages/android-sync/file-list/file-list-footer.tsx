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
        <div className="flex shrink-0 flex-wrap items-center justify-between gap-3 border-t border-default-100/70 bg-background/90 p-4">
            <div className="text-sm text-muted-foreground">
                Showing {start} - {end} of {filteredCount}
            </div>
            <CustomPagination page={page} total={totalPages} onChange={onPageChange} />
        </div>
    );
}
