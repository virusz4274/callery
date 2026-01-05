
'use client';

import { useToast } from '@/components/toast-provider';

import React, { useState, useTransition } from 'react';
import { Card, Button, Spinner } from '@heroui/react';
import { Loader2, UploadCloud, File, X } from 'lucide-react';
import { uploadRecordings } from '@/app/actions/upload-recordings';
import { useRouter } from 'next/navigation';

export function UploadPage() {
    const { toast } = useToast();
    const [files, setFiles] = useState<File[]>([]);
    const [isUploading, startUploadTransition] = useTransition();
    const router = useRouter();

    const handleFileChange = (event: React.ChangeEvent<HTMLInputElement>) => {
        if (event.target.files) {
            setFiles(Array.from(event.target.files));
        }
    };

    const handleDrop = (event: React.DragEvent<HTMLDivElement>) => {
        event.preventDefault();
        event.stopPropagation();
        if (event.dataTransfer.files) {
            setFiles(Array.from(event.dataTransfer.files));
        }
    };

    const handleDragOver = (event: React.DragEvent<HTMLDivElement>) => {
        event.preventDefault();
        event.stopPropagation();
    };

    const removeFile = (index: number) => {
        setFiles(files.filter((_, i) => i !== index));
    };

    const handleUpload = async () => {
        if (files.length === 0) {
            toast({ title: 'No Files Selected', description: 'Please select one or more files to upload.', status: 'warning' });
            return;
        }

        startUploadTransition(async () => {
            const formData = new FormData();
            files.forEach(file => {
                formData.append('files', file);
            });

            const result = await uploadRecordings(formData);

            if (result.success) {
                toast({ title: 'Upload Successful', description: `${result.count} file(s) have been uploaded to the 'injest' folder.`, status: 'success' });
                setFiles([]);
                router.refresh();
            } else {
                toast({ title: 'Upload Failed', description: result.error || 'An unknown error occurred.', status: 'danger' });
            }
        });
    };

    return (
        <div className="space-y-8 relative max-w-5xl mx-auto">
            {/* Background Elements */}
            <div className="absolute top-0 left-0 w-full h-full overflow-hidden -z-10 pointer-events-none">
                <div className="absolute top-[-10%] right-[-5%] w-[500px] h-[500px] rounded-full bg-primary/10 blur-3xl opacity-40 animate-pulse" />
                <div className="absolute bottom-[-10%] left-[-5%] w-[400px] h-[400px] rounded-full bg-secondary/10 blur-3xl opacity-40" />
            </div>

            <div className="flex flex-col gap-2 text-center md:text-left">
                <h1 className="text-4xl font-bold tracking-tight text-foreground bg-clip-text text-transparent bg-gradient-to-r from-foreground to-foreground/70">
                    Upload Recordings
                </h1>
                <p className="text-default-500 text-lg">
                    Add new calls to your workspace for instant AI analysis
                </p>
            </div>

            <Card className="bg-card/70 backdrop-blur-xl border border-default-200/50 shadow-xl overflow-visible">
                <Card.Content className="space-y-8 p-8">
                    <div
                        className="group relative flex flex-col items-center justify-center p-16 border-2 border-dashed rounded-2xl cursor-pointer hover:border-primary border-default-200 transition-all duration-300 bg-gradient-to-b from-default-50/50 to-transparent hover:from-primary/5 hover:to-primary/5"
                        onDrop={handleDrop}
                        onDragOver={handleDragOver}
                        onClick={() => document.getElementById('file-input')?.click()}
                    >
                        <div className="absolute inset-0 bg-grid-default-200/20 [mask-image:linear-gradient(0deg,transparent,black)] pointer-events-none rounded-2xl" />

                        <div className="h-20 w-20 mb-6 rounded-2xl bg-default-100 flex items-center justify-center group-hover:bg-primary group-hover:scale-110 group-hover:rotate-3 transition-all duration-300 shadow-lg group-hover:shadow-primary/30">
                            <UploadCloud className="h-10 w-10 text-default-400 group-hover:text-primary-foreground transition-colors duration-300" />
                        </div>
                        <h3 className="text-2xl font-bold text-foreground mb-2 group-hover:text-primary transition-colors">Drag & drop files here</h3>
                        <p className="text-md text-default-500 mb-6">or click to browse your computer</p>

                        <div className="flex gap-4 text-xs text-default-400 font-mono bg-default-100/50 px-4 py-2 rounded-full backdrop-blur-sm border border-default-200/50">
                            <span>MP3</span>
                            <span>WAV</span>
                            <span>M4A</span>
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

                    {files.length > 0 && (
                        <div className="space-y-4 animate-appearance-in">
                            <div className="flex justify-between items-end border-b border-default-100 pb-2">
                                <div>
                                    <h3 className="font-bold text-lg text-foreground">Selected Files</h3>
                                    <p className="text-small text-default-500">{files.length} file(s) ready to upload</p>
                                </div>
                                <Button size="sm" variant="ghost" onPress={() => setFiles([])} className="font-medium text-danger hover:bg-danger/10">
                                    Clear All
                                </Button>
                            </div>
                            <ul className="grid gap-3 sm:grid-cols-1 md:grid-cols-2 lg:grid-cols-3">
                                {files.map((file, index) => (
                                    <li key={index} className="flex items-center justify-between p-3 rounded-xl border border-default-200 bg-background/40 backdrop-blur-md hover:border-primary/30 hover:bg-primary/5 transition-all duration-200 group">
                                        <div className="flex items-center gap-3 overflow-hidden">
                                            <div className="h-10 w-10 rounded-lg bg-gradient-to-br from-primary/10 to-secondary/10 flex items-center justify-center flex-shrink-0 text-primary group-hover:text-secondary transition-colors">
                                                <File className="h-5 w-5" />
                                            </div>
                                            <div className="flex flex-col overflow-hidden">
                                                <span className="text-sm font-semibold truncate text-foreground">{file.name}</span>
                                                <span className="text-xs text-default-400 font-mono">{(file.size / 1024 / 1024).toFixed(2)} MB</span>
                                            </div>
                                        </div>
                                        <Button variant="ghost" isIconOnly size="sm" onPress={() => removeFile(index)} className="text-default-400 hover:text-danger hover:bg-danger/10 opacity-0 group-hover:opacity-100 transition-all">
                                            <X className="h-4 w-4" />
                                        </Button>
                                    </li>
                                ))}
                            </ul>
                        </div>
                    )}

                    <div className="flex justify-end pt-6 border-t border-default-100/50">
                        <Button
                            onPress={handleUpload}
                            isDisabled={isUploading || files.length === 0}
                            variant="primary"
                            className={`font-bold text-lg px-8 h-14 shadow-lg shadow-primary/25 rounded-xl transition-all ${isUploading ? 'opacity-80' : 'hover:scale-[1.02] hover:shadow-primary/40'}`}
                            size="lg"
                        >
                            {isUploading && <Spinner size="sm" color="current" className="mr-2" />}
                            {isUploading ? 'Uploading Files...' : 'Start Upload'}
                        </Button>
                    </div>
                </Card.Content>
            </Card>
        </div>
    );
}
