'use client';

import React from 'react';
import { Button, Card, Dropdown } from '@heroui/react';
import { ChevronRight, FileText, Folder, MoreVertical, PlayCircle, Trash2 } from 'lucide-react';
import type { FileSystemNode } from '@/lib/types';
import { ClientFormattedDate } from '@/components/client-formatted-date';

type BreadcrumbItem = {
    name: string;
    newPath: string[];
};

type FileBrowserTableProps = {
    items: FileSystemNode[];
    breadcrumbItems: BreadcrumbItem[];
    onBreadcrumbClick: (newPath: string[]) => void;
    onNodeClick: (node: FileSystemNode) => void | Promise<void>;
    onDeleteClick: (node: FileSystemNode) => void;
};

export function FileBrowserTable({
    items,
    breadcrumbItems,
    onBreadcrumbClick,
    onNodeClick,
    onDeleteClick,
}: FileBrowserTableProps) {
    return (
        <Card className="bg-card/70 backdrop-blur-xl border border-default-200/50 shadow-lg md:shadow-xl overflow-visible transition-all duration-300 rounded-xl md:rounded-2xl">
            <Card.Header className="flex flex-col items-start px-6 pt-6 pb-0">
                <div className="pt-2 pb-4 flex items-center flex-wrap gap-1 text-sm text-default-500">
                    {breadcrumbItems.map((item, index) => {
                        const isLast = index === breadcrumbItems.length - 1;

                        return (
                            <React.Fragment key={index}>
                                {index > 0 && <ChevronRight className="h-4 w-4" />}
                                <Button
                                    size="sm"
                                    variant="ghost"
                                    onPress={() => onBreadcrumbClick(item.newPath)}
                                    isDisabled={isLast}
                                    className={`min-w-0 px-2 h-7 ${
                                        isLast
                                            ? 'font-semibold text-foreground opacity-100'
                                            : 'text-default-500 hover:text-primary'
                                    }`}
                                >
                                    {item.name}
                                </Button>
                            </React.Fragment>
                        );
                    })}
                </div>
            </Card.Header>

            <Card.Content className="pb-8 px-0 sm:px-6">
                <div className="rounded-xl border border-default-200/50 overflow-hidden mt-4 bg-background/40 shadow-sm backdrop-blur-md">
                    <table className="w-full text-sm text-left table-fixed sm:table-auto">
                        <thead className="text-default-500 font-medium bg-default-50/50 border-b border-default-100/50">
                            <tr>
                                <th className="h-12 px-4 align-middle pl-6 w-full sm:w-[400px]">Name</th>
                                <th className="h-12 px-4 align-middle hidden sm:table-cell w-[100px]">Type</th>
                                <th className="h-12 px-4 align-middle hidden sm:table-cell w-[100px]">Size</th>
                                <th className="h-12 px-4 align-middle text-right pr-6 hidden sm:table-cell w-[150px]">
                                    Last Modified
                                </th>
                                <th className="h-12 px-4 align-middle w-[50px]"></th>
                            </tr>
                        </thead>

                        <tbody className="divide-y divide-default-100">
                            {items.length > 0 ? (
                                items.map((item) => (
                                    <tr
                                        key={item.id}
                                        className={`transition-colors group ${
                                            item.type === 'folder' ? 'cursor-pointer hover:bg-primary/5' : 'hover:bg-default-50'
                                        }`}
                                    >
                                        <td className="p-4 align-middle pl-6 truncate" onClick={() => onNodeClick(item)}>
                                            <div className="flex items-center gap-3">
                                                <div
                                                    className={`p-2 rounded-lg flex-shrink-0 ${
                                                        item.type === 'folder'
                                                            ? 'bg-primary/10 text-primary'
                                                            : 'bg-default-100 text-default-500'
                                                    }`}
                                                >
                                                    {item.type === 'folder' ? (
                                                        <Folder className="h-4 w-4" />
                                                    ) : (
                                                        <FileText className="h-4 w-4" />
                                                    )}
                                                </div>
                                                <span
                                                    className={`font-medium truncate ${
                                                        item.type === 'folder'
                                                            ? 'text-foreground group-hover:text-primary transition-colors'
                                                            : 'text-default-700'
                                                    }`}
                                                >
                                                    {item.name}
                                                </span>
                                            </div>
                                        </td>
                                        <td
                                            className="p-4 align-middle capitalize text-default-500 hidden sm:table-cell"
                                            onClick={() => onNodeClick(item)}
                                        >
                                            <span className="px-2 py-1 rounded-md bg-default-100/50 text-xs font-medium">
                                                {item.type}
                                            </span>
                                        </td>
                                        <td
                                            className="p-4 align-middle text-default-500 font-mono text-xs hidden sm:table-cell"
                                            onClick={() => onNodeClick(item)}
                                        >
                                            {item.size || '—'}
                                        </td>
                                        <td
                                            className="p-4 align-middle text-right text-default-500 pr-6 hidden sm:table-cell"
                                            onClick={() => onNodeClick(item)}
                                        >
                                            <ClientFormattedDate date={item.lastModified} formatString="PP" />
                                        </td>
                                        <td className="p-0 align-middle text-right pr-2 w-[50px]">
                                            {item.type === 'file' && (
                                                <Dropdown>
                                                    <Button
                                                        isIconOnly
                                                        variant="ghost"
                                                        size="sm"
                                                        className="text-default-400 hover:text-foreground"
                                                    >
                                                        <MoreVertical className="h-4 w-4" />
                                                    </Button>
                                                    <Dropdown.Popover>
                                                        <Dropdown.Menu aria-label="File Actions">
                                                            <Dropdown.Item
                                                                key="view"
                                                                textValue="View Details"
                                                                onPress={() => onNodeClick(item)}
                                                            >
                                                                <div className="flex items-center gap-2">
                                                                    <PlayCircle className="h-4 w-4" /> View Details
                                                                </div>
                                                            </Dropdown.Item>
                                                            <Dropdown.Item
                                                                key="delete"
                                                                className="text-danger"
                                                                textValue="Delete"
                                                                onPress={() => onDeleteClick(item)}
                                                            >
                                                                <div className="flex items-center gap-2">
                                                                    <Trash2 className="h-4 w-4" /> Delete
                                                                </div>
                                                            </Dropdown.Item>
                                                        </Dropdown.Menu>
                                                    </Dropdown.Popover>
                                                </Dropdown>
                                            )}
                                        </td>
                                    </tr>
                                ))
                            ) : (
                                <tr>
                                    <td colSpan={5} className="p-16 text-center text-default-500">
                                        <div className="flex flex-col items-center gap-2">
                                            <Folder className="h-10 w-10 text-default-200" />
                                            <p>This folder is empty.</p>
                                        </div>
                                    </td>
                                </tr>
                            )}
                        </tbody>
                    </table>
                </div>
            </Card.Content>
        </Card>
    );
}
