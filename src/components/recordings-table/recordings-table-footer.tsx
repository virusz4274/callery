import { Button, Card } from '@heroui/react';
import { ChevronLeft, ChevronRight } from 'lucide-react';

type RecordingsTableFooterProps = {
    page: number;
    totalPages: number;
    onPageChange: (page: number) => void;
    variant?: 'default' | 'flat';
    semanticPagination?: { hasMore: boolean; isLoading: boolean };
};

export function RecordingsTableFooter({
    page,
    totalPages,
    onPageChange,
    variant = 'default',
    semanticPagination,
}: RecordingsTableFooterProps) {
    if (semanticPagination ? page === 1 && !semanticPagination.hasMore : totalPages <= 1) {
        return null;
    }

    return (
        <Card.Footer
            className={`flex items-center justify-between px-4 py-3 md:px-6 md:py-4 ${
                variant === 'flat' ? 'px-0 border-none' : 'border-t border-default-100/50'
            }`}
        >
            <div className="text-sm text-muted">
                Page {page}{!semanticPagination && ` of ${totalPages}`}
            </div>
            <div className="flex gap-2">
                <Button
                    variant="ghost"
                    size="sm"
                    onPress={() => onPageChange(Math.max(1, page - 1))}
                    isDisabled={page === 1 || semanticPagination?.isLoading}
                    className="min-h-11 md:min-h-8"
                >
                    <ChevronLeft className="h-4 w-4 mr-1" /> Previous
                </Button>
                <Button
                    variant="ghost"
                    size="sm"
                    onPress={() => onPageChange(semanticPagination ? page + 1 : Math.min(totalPages, page + 1))}
                    isDisabled={semanticPagination ? !semanticPagination.hasMore || semanticPagination.isLoading : page === totalPages}
                    className="min-h-11 md:min-h-8"
                >
                    Next <ChevronRight className="h-4 w-4 ml-1" />
                </Button>
            </div>
        </Card.Footer>
    );
}
