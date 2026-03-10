'use client';

import React from 'react';
import { Button, Card, Spinner } from '@heroui/react';
import { File, X } from 'lucide-react';
import type { UploadItem } from './types';

type UploadItemsCardProps = {
    uploadItems: UploadItem[];
    isUploading: boolean;
    onClearAll: () => void;
    onUploadAll: () => void;
    onRemoveFile: (id: string) => void;
};

export function UploadItemsCard({
    uploadItems,
    isUploading,
    onClearAll,
    onUploadAll,
    onRemoveFile,
}: UploadItemsCardProps) {
    return (
        <Card className="bg-card/70 backdrop-blur-xl border border-default-200/50 shadow-xl">
            <Card.Content className="p-4 sm:p-6">
                <div className="flex flex-col sm:flex-row justify-between items-start sm:items-center gap-4 mb-6 border-b border-default-100 pb-4">
                    <div>
                        <h3 className="font-bold text-xl text-foreground">Selected Files</h3>
                        <p className="text-small text-default-500 mt-1">{uploadItems.length} file(s) ready</p>
                    </div>
                    <div className="flex gap-2 w-full sm:w-auto">
                        <Button
                            size="sm"
                            variant="ghost"
                            onPress={onClearAll}
                            className="font-medium text-danger hover:bg-danger/10 flex-1 sm:flex-none"
                        >
                            Clear All
                        </Button>
                        <Button
                            onPress={onUploadAll}
                            isDisabled={isUploading || uploadItems.every((item) => item.status === 'success')}
                            variant="primary"
                            className={`font-semibold shadow-md shadow-primary/20 flex-1 sm:flex-none ${
                                isUploading ? 'opacity-80' : 'hover:scale-[1.02]'
                            }`}
                            size="sm"
                        >
                            {isUploading && <Spinner size="sm" color="current" className="mr-2" />}
                            {isUploading ? 'Uploading...' : 'Upload All'}
                        </Button>
                    </div>
                </div>

                <ul className="space-y-3">
                    {uploadItems.map((item) => (
                        <li
                            key={item.id}
                            className={`group flex items-center justify-between p-3 rounded-xl border transition-all duration-200 ${
                                item.status === 'error'
                                    ? 'border-danger/50 bg-danger/5'
                                    : item.status === 'success'
                                      ? 'border-success/50 bg-success/5'
                                      : 'border-default-200 bg-background/40 hover:bg-default-100/50'
                            }`}
                        >
                            <div className="flex items-center gap-4 overflow-hidden w-full">
                                <div
                                    className={`h-10 w-10 rounded-lg flex items-center justify-center flex-shrink-0 ${
                                        item.status === 'error'
                                            ? 'bg-danger/10 text-danger'
                                            : item.status === 'success'
                                              ? 'bg-success/10 text-success'
                                              : 'bg-primary/10 text-primary'
                                    }`}
                                >
                                    {item.status === 'uploading' ? (
                                        <Spinner size="sm" color="current" />
                                    ) : (
                                        <File className="h-5 w-5" />
                                    )}
                                </div>
                                <div className="flex flex-col overflow-hidden min-w-0 flex-1">
                                    <div className="flex items-center gap-2">
                                        <span className="text-sm font-medium truncate text-foreground">{item.file.name}</span>
                                        {item.status === 'success' && (
                                            <span className="text-[10px] font-bold text-success bg-success/10 px-2 py-0.5 rounded-full">
                                                DONE
                                            </span>
                                        )}
                                        {item.status === 'error' && (
                                            <span className="text-[10px] font-bold text-danger bg-danger/10 px-2 py-0.5 rounded-full">
                                                FAILED
                                            </span>
                                        )}
                                    </div>
                                    <span className="text-xs text-default-500 font-mono flex items-center gap-2">
                                        {(item.file.size / 1024 / 1024).toFixed(2)} MB
                                        {item.error && <span className="text-danger">- {item.error}</span>}
                                    </span>
                                </div>
                            </div>
                            <Button
                                variant="ghost"
                                isIconOnly
                                size="sm"
                                onPress={() => onRemoveFile(item.id)}
                                className="text-default-400 hover:text-danger hover:bg-danger/10"
                                isDisabled={isUploading}
                            >
                                <X className="h-4 w-4" />
                            </Button>
                        </li>
                    ))}
                </ul>
            </Card.Content>
        </Card>
    );
}
