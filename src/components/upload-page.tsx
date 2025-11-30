
'use client';

import React, { useState, useTransition } from 'react';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { useToast } from '@/hooks/use-toast';
import { Loader2, UploadCloud, File, X } from 'lucide-react';
import { uploadRecordings } from '@/app/actions/upload-recordings';
import { useRouter } from 'next/navigation';

export function UploadPage() {
    const [files, setFiles] = useState<File[]>([]);
    const [isUploading, startUploadTransition] = useTransition();
    const { toast } = useToast();
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
            toast({
                variant: 'destructive',
                title: 'No files selected',
                description: 'Please select one or more files to upload.',
            });
            return;
        }

        startUploadTransition(async () => {
            const formData = new FormData();
            files.forEach(file => {
                formData.append('files', file);
            });
            
            const result = await uploadRecordings(formData);

            if (result.success) {
                toast({
                    title: 'Upload Successful',
                    description: `${result.count} file(s) have been uploaded to the 'injest' folder.`,
                });
                setFiles([]);
                router.refresh(); 
            } else {
                toast({
                    variant: 'destructive',
                    title: 'Upload Failed',
                    description: result.error || 'An unknown error occurred.',
                });
            }
        });
    };

    return (
        <div className="space-y-6">
            <h1 className="text-3xl font-bold tracking-tight">Upload Recordings</h1>
            <Card>
                <CardHeader>
                    <CardTitle>Upload Files</CardTitle>
                    <CardDescription>
                        Select or drag and drop your call recording files here. They will be placed in the `/injest` directory for processing.
                    </CardDescription>
                </CardHeader>
                <CardContent className="space-y-4">
                    <div 
                        className="flex flex-col items-center justify-center p-12 border-2 border-dashed rounded-lg cursor-pointer hover:border-primary"
                        onDrop={handleDrop}
                        onDragOver={handleDragOver}
                        onClick={() => document.getElementById('file-input')?.click()}
                    >
                        <UploadCloud className="h-12 w-12 text-muted-foreground" />
                        <p className="mt-4 text-lg font-semibold">Drag & drop files here</p>
                        <p className="text-sm text-muted-foreground">or click to browse</p>
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
                        <div className="space-y-2">
                            <h3 className="font-semibold">Selected Files:</h3>
                            <ul className="space-y-2">
                                {files.map((file, index) => (
                                    <li key={index} className="flex items-center justify-between p-2 rounded-md border">
                                        <div className="flex items-center gap-2">
                                            <File className="h-5 w-5 text-muted-foreground" />
                                            <span className="text-sm font-medium">{file.name}</span>
                                        </div>
                                        <Button variant="ghost" size="icon" onClick={() => removeFile(index)}>
                                            <X className="h-4 w-4" />
                                        </Button>
                                    </li>
                                ))}
                            </ul>
                        </div>
                    )}

                    <div className="flex justify-end">
                        <Button onClick={handleUpload} disabled={isUploading || files.length === 0}>
                            {isUploading ? (
                                <>
                                    <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                                    Uploading...
                                </>
                            ) : (
                                'Upload'
                            )}
                        </Button>
                    </div>
                </CardContent>
            </Card>
        </div>
    );
}
