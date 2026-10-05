import { Pagination } from '@heroui/react';

interface CustomPaginationProps {
    className?: string;
    page: number;
    total: number;
    onChange: (page: number) => void;
}

function getPageNumbers(page: number, total: number): Array<number | 'ellipsis'> {
    if (total <= 7) {
        return Array.from({ length: total }, (_, index) => index + 1);
    }

    const pages: Array<number | 'ellipsis'> = [1];
    const start = Math.max(2, page - 1);
    const end = Math.min(total - 1, page + 1);

    if (start > 2) {
        pages.push('ellipsis');
    }

    for (let current = start; current <= end; current += 1) {
        pages.push(current);
    }

    if (end < total - 1) {
        pages.push('ellipsis');
    }

    pages.push(total);

    return pages;
}

export function CustomPagination({ className, page, total, onChange }: CustomPaginationProps) {
    if (total <= 1) {
        return null;
    }

    return (
        <Pagination size="sm" className={className}>
            <Pagination.Content>
                <Pagination.Item>
                    <Pagination.Previous
                        isDisabled={page <= 1}
                        onPress={() => onChange(Math.max(1, page - 1))}
                    >
                        <Pagination.PreviousIcon />
                        <span>Previous</span>
                    </Pagination.Previous>
                </Pagination.Item>

                {getPageNumbers(page, total).map((item, index) => (
                    item === 'ellipsis' ? (
                        <Pagination.Item key={`ellipsis-${page}-${index}`}>
                            <Pagination.Ellipsis />
                        </Pagination.Item>
                    ) : (
                        <Pagination.Item key={item}>
                            <Pagination.Link
                                isActive={item === page}
                                onPress={() => onChange(item)}
                            >
                                {item}
                            </Pagination.Link>
                        </Pagination.Item>
                    )
                ))}

                <Pagination.Item>
                    <Pagination.Next
                        isDisabled={page >= total}
                        onPress={() => onChange(Math.min(total, page + 1))}
                    >
                        <span>Next</span>
                        <Pagination.NextIcon />
                    </Pagination.Next>
                </Pagination.Item>
            </Pagination.Content>
        </Pagination>
    );
}
