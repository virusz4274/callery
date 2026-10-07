'use client';

import { useCallback, useEffect, useRef, useState, useTransition } from 'react';
import { usePathname, useRouter, useSearchParams } from 'next/navigation';
import { deleteUser, restoreUser, toggleUserStatus, updateUserLimits, updateUserRole } from '@/app/actions/admin';
import { useToast } from '@/components/toast-provider';
import type { UserResponse } from '@/lib/db/types';

type UserAction = 'delete' | 'role' | 'status' | 'limits';
export function useUserManagementTable(initialSearch: string) {
    const [userToManage, setUserToManage] = useState<UserResponse | null>(null);
    const [userToEditLimits, setUserToEditLimits] = useState<UserResponse | null>(null);
    const [userToEditUsage, setUserToEditUsage] = useState<UserResponse | null>(null);
    const [searchTerm, setSearchTerm] = useState(initialSearch);
    const [pendingUser, setPendingUser] = useState<string | null>(null);
    const busy = useRef(false);
    const [confirmation, setConfirmation] = useState<{ user: UserResponse; action: UserAction } | null>(null);
    const [actionError, setActionError] = useState<string | null>(null);
    const router = useRouter();
    const searchParams = useSearchParams();
    const pathname = usePathname();
    const [isPending, startTransition] = useTransition();
    const { toast } = useToast();
    const updateSearchParams = useCallback((updates: Record<string, string | null>) => {
        const params = new URLSearchParams(searchParams);
        for (const [key, value] of Object.entries(updates)) { if (value) params.set(key, value); else params.delete(key); }
        return params.size ? `${pathname}?${params}` : pathname;
    }, [pathname, searchParams]);
    useEffect(() => {
        const timeout = setTimeout(() => {
            if (searchTerm !== initialSearch) startTransition(() => router.replace(updateSearchParams({ search: searchTerm || null, page: '1' }), { scroll: false }));
        }, 500);
        return () => clearTimeout(timeout);
    }, [initialSearch, searchTerm, router, updateSearchParams]);
    useEffect(() => {
        const restoreSearch = () => setSearchTerm(new URL(location.href).searchParams.get('search') || '');
        window.addEventListener('popstate', restoreSearch);
        return () => window.removeEventListener('popstate', restoreSearch);
    }, []);
    const runAction = async (user: UserResponse, action: UserAction | 'restore') => {
        if (busy.current) return;
        busy.current = true; setPendingUser(user.id); setActionError(null);
        try {
            if (action === 'delete') await deleteUser(user.id);
            if (action === 'restore') await restoreUser(user.id);
            if (action === 'role') await updateUserRole(user.id, user.role === 'admin' ? 'user' : 'admin');
            if (action === 'status') await toggleUserStatus(user.id, !user.disabled);
            if (action === 'limits') { const result = await updateUserLimits(user.id, { storageAllocation: 5 * 1024 ** 3, transcriptionAllocation: 3600 }); if (result?.fieldErrors) throw new Error(Object.values(result.fieldErrors).join(' ')); }
            toast({ title: action === 'restore' ? 'User restored' : 'User updated', status: 'success' });
            setConfirmation(null); router.refresh();
        } catch (error) {
            const message = error instanceof Error ? error.message : 'Please try again.';
            setActionError(message); toast({ title: 'Unable to update user', description: message, status: 'danger' });
        } finally { busy.current = false; setPendingUser(null); }
    };
    const requestAction = (user: UserResponse, action: UserAction) => { setActionError(null); setConfirmation({ user, action }); };
    const closeDialogs = () => { setUserToManage(null); setUserToEditLimits(null); setUserToEditUsage(null); };
    return {
        isPending, pendingUser, searchTerm, userToManage, userToEditLimits, userToEditUsage,
        setSearchTerm, setUserToManage, setUserToEditLimits, setUserToEditUsage, closeDialogs,
        confirmation, actionError, closeConfirmation: () => { if (!busy.current) setConfirmation(null); },
        confirmAction: () => { if (confirmation) void runAction(confirmation.user, confirmation.action); },
        handleDeleteUser: (user: UserResponse) => requestAction(user, 'delete'),
        handleRestoreUser: (user: UserResponse) => void runAction(user, 'restore'),
        handleToggleRole: (user: UserResponse) => requestAction(user, 'role'),
        handleToggleStatus: (user: UserResponse) => requestAction(user, 'status'),
        handleResetLimits: (user: UserResponse) => requestAction(user, 'limits'),
        handlePageChange: (page: number) => startTransition(() => router.push(updateSearchParams({ page: String(page) }))),
        router,
    };
}
