
'use client';

import { useToast } from '@/components/toast-provider';

import React, { useState, useTransition } from 'react';
import { Card, Button, Spinner } from '@heroui/react';
import { UploadCloud, File, X } from 'lucide-react';
import { uploadRecordings } from '@/app/actions/upload-recordings';
import { useRouter } from 'next/navigation';

import { useUser } from '@/lib/firebase/provider';

export function UploadPage() {
    const { toast } = useToast();

    interface UploadItem {
        id: string;
        file: File;
        status: 'pending' | 'uploading' | 'success' | 'error';
        error?: string;
    }

    const [uploadItems, setUploadItems] = useState<UploadItem[]>([]);
    const [isUploading, startUploadTransition] = useTransition();
    const [isDragging, setIsDragging] = useState(false);
    const router = useRouter();

    const { user, isUserLoading } = useUser();

    // Protect the page - redirect to login if not authenticated
    React.useEffect(() => {
        if (!isUserLoading && !user) {
            router.replace('/login');
        }
    }, [user, isUserLoading, router]);

    if (isUserLoading || !user) {
        return <div className="flex justify-center p-8"><Spinner size="lg" /></div>;
    }

    const addFiles = (newFiles: File[]) => {
        const newItems: UploadItem[] = newFiles.map(file => ({
            id: Math.random().toString(36).substring(7),
            file,
            status: 'pending'
        }));
        setUploadItems(prev => [...prev, ...newItems]);
    };

    const handleFileChange = (event: React.ChangeEvent<HTMLInputElement>) => {
        if (event.target.files) {
            addFiles(Array.from(event.target.files));
        }
    };

    const handleDrop = (event: React.DragEvent<HTMLDivElement>) => {
        event.preventDefault();
        event.stopPropagation();
        setIsDragging(false);
        if (event.dataTransfer.files) {
            addFiles(Array.from(event.dataTransfer.files));
        }
    };

    const handleDragOver = (event: React.DragEvent<HTMLDivElement>) => {
        event.preventDefault();
        event.stopPropagation();
        setIsDragging(true);
    };

    const handleDragLeave = (event: React.DragEvent<HTMLDivElement>) => {
        event.preventDefault();
        event.stopPropagation();
        setIsDragging(false);
    };

    const removeFile = (id: string) => {
        setUploadItems(prev => prev.filter(item => item.id !== id));
    };

    const updateItemStatus = (id: string, status: UploadItem['status'], error?: string) => {
        setUploadItems(prev => prev.map(item =>
            item.id === id ? { ...item, status, error } : item
        ));
    };

    const handleUpload = async () => {
        const pendingItems = uploadItems.filter(item => item.status === 'pending' || item.status === 'error');

        if (pendingItems.length === 0) {
            toast({ title: 'No Files to Upload', description: 'All files are already uploaded or none selected.', status: 'warning' });
            return;
        }

        startUploadTransition(async () => {
            // Mark all pending as uploading first
            setUploadItems(prev => prev.map(item =>
                (item.status === 'pending' || item.status === 'error') ? { ...item, status: 'uploading', error: undefined } : item
            ));

            const uploadPromises = pendingItems.map(async (item) => {
                const formData = new FormData();
                formData.append('files', item.file);
                try {
                    const result = await uploadRecordings(formData);
                    if (result.success) {
                        updateItemStatus(item.id, 'success');
                        return { success: true };
                    } else {
                        updateItemStatus(item.id, 'error', result.error || 'Upload failed');
                        return { success: false, error: result.error };
                    }
                } catch (error) {
                    console.error(`Failed to upload ${item.file.name}`, error);
                    const errorMessage = error instanceof Error ? error.message : 'Unknown error';
                    updateItemStatus(item.id, 'error', errorMessage);
                    return { success: false, error: errorMessage };
                }
            });

            // Run all uploads in parallel
            const results = await Promise.all(uploadPromises);

            // Aggregate results
            const successCount = results.filter(r => r.success).length;
            const failures = results.filter(r => !r.success);

            if (successCount > 0) {
                if (failures.length > 0) {
                    toast({
                        title: 'Partially Successful',
                        description: `Uploaded ${successCount} file(s). Failed: ${failures.length} file(s).`,
                        status: 'warning'
                    });
                } else {
                    toast({
                        title: 'Upload Successful',
                        description: `${successCount} file(s) have been uploaded successfully.`,
                        status: 'success'
                    });
                }
                router.refresh();
            } else {
                toast({
                    title: 'Upload Failed',
                    description: failures[0]?.error || 'No files were uploaded.',
                    status: 'danger'
                });
            }
        });
    };

    return (
        <div className="space-y-8 relative max-w-7xl mx-auto">
            {/* Background Elements */}
            <div className="absolute top-0 left-0 w-full h-full overflow-hidden -z-10 pointer-events-none">
                <div className="absolute top-[-10%] right-[-5%] w-[500px] h-[500px] rounded-full bg-primary/10 blur-3xl opacity-40 animate-pulse" />
                <div className="absolute bottom-[-10%] left-[-5%] w-[400px] h-[400px] rounded-full bg-secondary/10 blur-3xl opacity-40" />
            </div>

            <div className="flex flex-col gap-2 text-center md:text-left pt-4">
                <h1 className="text-4xl font-bold tracking-tight text-foreground bg-clip-text text-transparent bg-gradient-to-r from-foreground to-foreground/70">
                    Upload Recordings
                </h1>
                <p className="text-default-500 text-lg">
                    Add new calls to your workspace for instant AI analysis
                </p>
            </div>

            <div className="grid grid-cols-1 lg:grid-cols-12 gap-8 items-start">
                {/* Left Column: Dropzone (Sticky on Desktop) */}
                <div className="lg:col-span-5 lg:sticky lg:top-8 z-10">
                    <Card className="bg-card/70 backdrop-blur-xl border border-default-200/50 shadow-lg md:shadow-xl overflow-visible rounded-xl md:rounded-2xl">
                        <Card.Content className="p-4 sm:p-8">
                            <div
                                className={`group relative flex flex-col items-center justify-center p-8 sm:p-12 border-2 border-dashed rounded-2xl cursor-pointer transition-all duration-300 ${isDragging
                                    ? 'border-primary bg-primary/10 scale-[1.01]'
                                    : 'border-default-200 hover:border-primary bg-gradient-to-b from-default-50/50 to-transparent hover:from-primary/5 hover:to-primary/5'
                                    }`}
                                onDrop={handleDrop}
                                onDragOver={handleDragOver}
                                onDragLeave={handleDragLeave}
                                onClick={() => document.getElementById('file-input')?.click()}
                            >
                                {/* Grid Pattern */}
                                <div className={`absolute inset-0 bg-grid-default-200/20 [mask-image:linear-gradient(0deg,transparent,black)] pointer-events-none rounded-2xl transition-opacity duration-300 ${isDragging ? 'opacity-50' : 'opacity-100'}`} />

                                <div className={`h-16 w-16 sm:h-20 sm:w-20 mb-4 sm:mb-6 rounded-3xl flex items-center justify-center transition-all duration-300 shadow-xl ${isDragging
                                    ? 'bg-primary text-primary-foreground scale-110 rotate-0 shadow-primary/30'
                                    : 'bg-default-100 text-default-400 group-hover:bg-primary group-hover:text-primary-foreground group-hover:scale-110 group-hover:rotate-3 group-hover:shadow-primary/30'
                                    }`}>
                                    <UploadCloud className="h-8 w-8 sm:h-10 sm:w-10 transition-colors duration-300" />
                                </div>

                                <h3 className={`text-xl font-bold mb-2 transition-colors text-center ${isDragging ? 'text-primary' : 'text-foreground group-hover:text-primary'}`}>
                                    {isDragging ? 'Drop files to upload' : 'Drag & drop files here'}
                                </h3>
                                <p className="text-sm text-default-500 mb-2 max-w-sm text-center px-4">
                                    or click to browse
                                </p>
                                <div className="flex items-center gap-2 mb-6 px-3 py-1 bg-yellow-500/10 text-yellow-600 dark:text-yellow-400 rounded-full border border-yellow-500/20">
                                    <span className="w-2 h-2 rounded-full bg-current animate-pulse" />
                                    <p className="text-xs font-semibold text-center">
                                        Max file size: 2GB per file
                                    </p>
                                </div>

                                <div className="flex flex-wrap justify-center gap-3 text-xs text-default-400 font-mono bg-default-100/50 px-4 py-2 rounded-xl backdrop-blur-sm border border-default-200/50">
                                    <span>MP3</span>
                                    <span className="w-px h-3 bg-default-300/50" />
                                    <span>WAV</span>
                                    <span className="w-px h-3 bg-default-300/50" />
                                    <span>M4A</span>
                                    <span className="w-px h-3 bg-default-300/50" />
                                    <span>MP4</span>
                                </div>

                                <input
                                    id="file-input"
                                    type="file"
                                    multiple
                                    className="hidden"
                                    onChange={handleFileChange}
                                    accept="audio/*,video/*,.m4a,.mp3,.wav,.mp4"
                                />
                            </div>
                        </Card.Content>
                    </Card>
                </div>

                {/* Right Column: File List */}
                <div className="lg:col-span-7 space-y-6">
                    {uploadItems.length > 0 ? (
                        <>
                            <Card className="bg-card/70 backdrop-blur-xl border border-default-200/50 shadow-xl">
                                <Card.Content className="p-4 sm:p-6">
                                    <div className="flex flex-col sm:flex-row justify-between items-start sm:items-center gap-4 mb-6 border-b border-default-100 pb-4">
                                        <div>
                                            <h3 className="font-bold text-xl text-foreground">Selected Files</h3>
                                            <p className="text-small text-default-500 mt-1">{uploadItems.length} file(s) ready</p>
                                        </div>
                                        <div className="flex gap-2 w-full sm:w-auto">
                                            <Button size="sm" variant="ghost" onPress={() => setUploadItems([])} className="font-medium text-danger hover:bg-danger/10 flex-1 sm:flex-none">
                                                Clear All
                                            </Button>
                                            <Button
                                                onPress={handleUpload}
                                                isDisabled={isUploading || uploadItems.every(i => i.status === 'success')}
                                                variant="primary"
                                                className={`font-semibold shadow-md shadow-primary/20 flex-1 sm:flex-none ${isUploading ? 'opacity-80' : 'hover:scale-[1.02]'}`}
                                                size="sm"
                                            >
                                                {isUploading && <Spinner size="sm" color="current" className="mr-2" />}
                                                {isUploading ? 'Uploading...' : 'Upload All'}
                                            </Button>
                                        </div>
                                    </div>

                                    <ul className="space-y-3">
                                        {uploadItems.map((item) => (
                                            <li key={item.id} className={`group flex items-center justify-between p-3 rounded-xl border transition-all duration-200 ${item.status === 'error' ? 'border-danger/50 bg-danger/5' :
                                                item.status === 'success' ? 'border-success/50 bg-success/5' :
                                                    'border-default-200 bg-background/40 hover:bg-default-100/50'
                                                }`}>
                                                <div className="flex items-center gap-4 overflow-hidden w-full">
                                                    <div className={`h-10 w-10 rounded-lg flex items-center justify-center flex-shrink-0 ${item.status === 'error' ? 'bg-danger/10 text-danger' :
                                                        item.status === 'success' ? 'bg-success/10 text-success' :
                                                            'bg-primary/10 text-primary'
                                                        }`}>
                                                        {item.status === 'uploading' ? (
                                                            <Spinner size="sm" color="current" />
                                                        ) : (
                                                            <File className="h-5 w-5" />
                                                        )}
                                                    </div>
                                                    <div className="flex flex-col overflow-hidden min-w-0 flex-1">
                                                        <div className="flex items-center gap-2">
                                                            <span className="text-sm font-medium truncate text-foreground">{item.file.name}</span>
                                                            {item.status === 'success' && <span className="text-[10px] font-bold text-success bg-success/10 px-2 py-0.5 rounded-full">DONE</span>}
                                                            {item.status === 'error' && <span className="text-[10px] font-bold text-danger bg-danger/10 px-2 py-0.5 rounded-full">FAILED</span>}
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
                                                    onPress={() => removeFile(item.id)}
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
                        </>
                    ) : (
                        <div className="h-full flex items-center justify-center min-h-[300px] border-2 border-dashed border-default-100 rounded-3xl bg-default-50/30 text-default-400">
                            <div className="text-center p-6">
                                <div className="inline-flex items-center justify-center w-16 h-16 rounded-full bg-default-100 mb-4">
                                    <File className="w-8 h-8 text-default-300" />
                                </div>
                                <p className="text-lg font-medium">No files selected</p>
                                <p className="text-sm text-default-400">Files you add will appear here</p>
                            </div>
                        </div>
                    )}
                </div>
            </div>
        </div>
    );
}
