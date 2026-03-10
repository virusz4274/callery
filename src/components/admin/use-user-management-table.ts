'use client';

import { useCallback, useEffect, useState, useTransition } from 'react';
import { usePathname, useRouter, useSearchParams } from 'next/navigation';
import { deleteUser, restoreUser, toggleUserStatus, updateUserLimits, updateUserRole } from '@/app/actions/admin';
import type { UserResponse } from '@/lib/db/types';

const DEFAULT_STORAGE_ALLOCATION = 5 * 1024 * 1024 * 1024;
const DEFAULT_TRANSCRIPTION_ALLOCATION = 60 * 60;

export function useUserManagementTable(initialSearch: string) {
    const [userToManage, setUserToManage] = useState<UserResponse | null>(null);
    const [userToEditLimits, setUserToEditLimits] = useState<UserResponse | null>(null);
    const [userToEditUsage, setUserToEditUsage] = useState<UserResponse | null>(null);
    const [searchTerm, setSearchTerm] = useState(initialSearch);
    const [isDeleting, setIsDeleting] = useState<string | null>(null);

    const router = useRouter();
    const searchParams = useSearchParams();
    const pathname = usePathname();
    const [isPending, startTransition] = useTransition();

    const updateSearchParams = useCallback(
        (updates: Record<string, string | null>) => {
            const params = new URLSearchParams(searchParams);

            Object.entries(updates).forEach(([key, value]) => {
                if (!value) {
                    params.delete(key);
                } else {
                    params.set(key, value);
                }
            });

            return `${pathname}?${params.toString()}`;
        },
        [pathname, searchParams]
    );

    const handleSearch = useCallback(
        (term: string) => {
            router.replace(updateSearchParams({ search: term || null, page: '1' }));
        },
        [router, updateSearchParams]
    );

    useEffect(() => {
        const timeoutId = setTimeout(() => {
            if (searchTerm !== initialSearch) {
                handleSearch(searchTerm);
            }
        }, 500);

        return () => clearTimeout(timeoutId);
    }, [handleSearch, initialSearch, searchTerm]);

    const handlePageChange = (page: number) => {
        router.push(updateSearchParams({ page: page.toString() }));
    };

    const handleToggleStatus = (userId: string, currentStatus?: boolean) => {
        startTransition(async () => {
            await toggleUserStatus(userId, !currentStatus);
        });
    };

    const handleToggleRole = (userId: string, currentRole: 'user' | 'admin') => {
        const newRole = currentRole === 'admin' ? 'user' : 'admin';
        startTransition(async () => {
            await updateUserRole(userId, newRole);
        });
    };

    const handleResetLimits = (userId: string) => {
        if (!confirm('Are you sure you want to reset this users limits to default (5GB, 60min)?')) {
            return;
        }

        startTransition(async () => {
            await updateUserLimits(userId, {
                storageAllocation: DEFAULT_STORAGE_ALLOCATION,
                transcriptionAllocation: DEFAULT_TRANSCRIPTION_ALLOCATION,
            });
        });
    };

    const closeDialogs = () => {
        setUserToManage(null);
        setUserToEditLimits(null);
        setUserToEditUsage(null);
    };

    const handleDeleteUser = async (userId: string) => {
        if (
            !confirm(
                'Are you sure you want to schedule this user for deletion? The account will be disabled immediately and can be restored during the restore window.'
            )
        ) {
            return;
        }

        setIsDeleting(userId);
        try {
            await deleteUser(userId);
            router.refresh();
        } catch (error) {
            alert('Failed to delete user');
            console.error(error);
        } finally {
            setIsDeleting(null);
        }
    };

    const handleRestoreUser = async (userId: string) => {
        setIsDeleting(userId);
        try {
            await restoreUser(userId);
            router.refresh();
        } catch (error) {
            alert(error instanceof Error ? error.message : 'Failed to restore user');
            console.error(error);
        } finally {
            setIsDeleting(null);
        }
    };

    return {
        isPending,
        isDeleting,
        searchTerm,
        userToManage,
        userToEditLimits,
        userToEditUsage,
        setSearchTerm,
        setUserToManage,
        setUserToEditLimits,
        setUserToEditUsage,
        closeDialogs,
        handleDeleteUser,
        handleRestoreUser,
        handlePageChange,
        handleResetLimits,
        handleToggleRole,
        handleToggleStatus,
        router,
    };
}
