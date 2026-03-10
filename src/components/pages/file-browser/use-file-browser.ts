'use client';

import { useEffect, useMemo, useState } from 'react';
import { useRouter } from 'next/navigation';
import { useUser } from '@/lib/firebase/provider';
import type { FileSystemNode, Recording } from '@/lib/types';
import { authFetch } from '@/lib/api-client';
import { deleteRecordings } from '@/app/actions/delete-recordings';
import { useToast } from '@/components/toast-provider';

type BreadcrumbItem = {
    name: string;
    newPath: string[];
};

type UseFileBrowserOptions = {
    rootNode: FileSystemNode;
    onRefresh?: () => void;
};

export function useFileBrowser({ rootNode, onRefresh }: UseFileBrowserOptions) {
    const router = useRouter();
    const { user, isUserLoading } = useUser();
    const { toast } = useToast();

    const [path, setPath] = useState<string[]>([]);
    const [selectedRecording, setSelectedRecording] = useState<Recording | null>(null);
    const [isLoadingDetails, setIsLoadingDetails] = useState(false);
    const [recordingToDelete, setRecordingToDelete] = useState<string | null>(null);
    const [isDeleteModalOpen, setIsDeleteModalOpen] = useState(false);
    const [isDeleting, setIsDeleting] = useState(false);

    const { currentNode, breadcrumbItems } = useMemo(() => {
        let node = rootNode;
        const crumbs: BreadcrumbItem[] = [{ name: 'Home', newPath: [] }];

        path.forEach((segment, index) => {
            const nextNode = node.children?.find((child) => child.name === segment);
            if (nextNode) {
                node = nextNode;
                crumbs.push({ name: segment, newPath: path.slice(0, index + 1) });
            }
        });

        return { currentNode: node, breadcrumbItems: crumbs };
    }, [path, rootNode]);

    const items = useMemo(() => {
        return (
            currentNode.children?.sort((a, b) => {
                if (a.type === 'folder' && b.type !== 'folder') return -1;
                if (a.type !== 'folder' && b.type === 'folder') return 1;
                return a.name.localeCompare(b.name);
            }) || []
        );
    }, [currentNode]);

    useEffect(() => {
        if (!isUserLoading && !user) {
            router.replace('/login');
        }
    }, [isUserLoading, router, user]);

    const openRecordingDetails = async (recordingId: string) => {
        setIsLoadingDetails(true);
        try {
            const response = await authFetch(`/api/recordings/${recordingId}`);
            if (!response.ok) {
                throw new Error('Failed to fetch recording details');
            }

            const data = await response.json();
            if (!data.recording) {
                throw new Error('Invalid response format');
            }

            setSelectedRecording(data.recording);
        } catch (error) {
            console.error('Error fetching recording details:', error);
            toast({
                title: 'Error',
                description: 'Failed to load recording details. Please try again.',
                status: 'danger',
            });
        } finally {
            setIsLoadingDetails(false);
        }
    };

    const handleNodeClick = async (node: FileSystemNode) => {
        if (node.type === 'folder') {
            setPath((prev) => [...prev, node.name]);
            return;
        }

        const recordingId = node.id.replace('file-', '');
        await openRecordingDetails(recordingId);
    };

    const handleDeleteClick = (node: FileSystemNode) => {
        if (node.type !== 'file') {
            return;
        }

        setRecordingToDelete(node.id.replace('file-', ''));
        setIsDeleteModalOpen(true);
    };

    const confirmDelete = async () => {
        if (!recordingToDelete) {
            return;
        }

        setIsDeleting(true);
        try {
            const result = await deleteRecordings([recordingToDelete]);
            if (result.success) {
                setIsDeleteModalOpen(false);
                setRecordingToDelete(null);
                onRefresh?.();
            } else {
                console.error('Failed to delete:', result.message);
            }
        } catch (error) {
            console.error('Error deleting recording:', error);
        } finally {
            setIsDeleting(false);
        }
    };

    return {
        breadcrumbItems,
        isDeleteModalOpen,
        isDeleting,
        isLoadingDetails,
        isUserLoading,
        items,
        selectedRecording,
        user,
        setIsDeleteModalOpen,
        setPath,
        setSelectedRecording,
        confirmDelete,
        handleDeleteClick,
        handleNodeClick,
    };
}
