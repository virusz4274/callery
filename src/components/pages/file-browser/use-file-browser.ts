'use client';

import { useEffect, useMemo, useState } from 'react';
import { useRouter } from 'next/navigation';
import { useUser } from '@/lib/auth/client';
import type { FileSystemNode } from '@/lib/types';
import { useRecordingWorkspace } from '@/hooks/use-recording-workspace';
import { deleteRecordings } from '@/app/actions/delete-recordings';
import { useToast } from '@/components/toast-provider';
import { buildLoginRedirectHref } from '@/lib/auth-redirect';

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
    const workspace = useRecordingWorkspace();
    const [recordingToDelete, setRecordingToDelete] = useState<string | null>(null);
    const [isDeleteModalOpen, setIsDeleteModalOpen] = useState(false);
    const [isDeleting, setIsDeleting] = useState(false);

    const { currentNode, breadcrumbItems, validPathLength } = useMemo(() => {
        let node = rootNode;
        const crumbs: BreadcrumbItem[] = [{ name: 'Home', newPath: [] }];

        for (const [index, segment] of path.entries()) {
            const nextNode = node.children?.find((child) => child.id === segment);
            if (!nextNode) break;
            node = nextNode;
            crumbs.push({ name: nextNode.name, newPath: path.slice(0, index + 1) });
        }

        return { currentNode: node, breadcrumbItems: crumbs, validPathLength: crumbs.length - 1 };
    }, [path, rootNode]);

    useEffect(() => {
        if (validPathLength >= path.length) return;
        const timer = setTimeout(() => setPath(previous => previous.slice(0, validPathLength)), 0);
        return () => clearTimeout(timer);
    }, [path.length, validPathLength]);

    const items = useMemo(() => {
        return (
            currentNode.children?.slice().sort((a, b) => {
                if (a.type === 'folder' && b.type !== 'folder') return -1;
                if (a.type !== 'folder' && b.type === 'folder') return 1;
                return a.name.localeCompare(b.name);
            }) || []
        );
    }, [currentNode]);

    useEffect(() => {
        if (!isUserLoading && !user) {
            router.replace(buildLoginRedirectHref('/files'));
        }
    }, [isUserLoading, router, user]);

    const handleNodeClick = async (node: FileSystemNode) => {
        if (node.type === 'folder') {
            setPath((prev) => [...prev, node.id]);
            return;
        }

        const recordingId = node.recordingId || node.id.replace('file-', '');
        workspace.openId(recordingId);
    };

    const handleDeleteClick = (node: FileSystemNode) => {
        if (node.type !== 'file') {
            return;
        }

        setRecordingToDelete(node.recordingId || node.id.replace('file-', ''));
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
                if (workspace.id === recordingToDelete) workspace.close();
                setIsDeleteModalOpen(false);
                setRecordingToDelete(null);
                onRefresh?.();
                router.refresh();
                toast({
                    title: 'Deleted',
                    description: result.message,
                    status: 'success',
                });
            } else {
                toast({
                    title: 'Delete Failed',
                    description: result.message,
                    status: 'danger',
                });
            }
        } catch (error) {
            console.error('Error deleting recording:', error);
            toast({
                title: 'Delete Failed',
                description: 'Failed to delete recording. Please try again.',
                status: 'danger',
            });
        } finally {
            setIsDeleting(false);
        }
    };

    return {
        breadcrumbItems,
        isDeleteModalOpen,
        isDeleting,
        isUserLoading,
        items,
        workspace,
        user,
        setIsDeleteModalOpen,
        setPath,
        confirmDelete,
        handleDeleteClick,
        handleNodeClick,
    };
}
