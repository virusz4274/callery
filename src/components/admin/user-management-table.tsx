'use client';

import { Button, Card, Input, Label, Spinner } from '@heroui/react';
import { useEffect, useRef } from 'react';
import { usePathname, useSearchParams } from 'next/navigation';
import { ADMIN_USERS_RETURN_KEY, usersReturnContext } from '@/lib/admin-navigation';
import { ConfirmActionDialog } from './confirm-action-dialog';
import type { PlanResponse, UserResponse } from '@/lib/db/types';
import { EditLimitsDialog } from './edit-limits-dialog';
import { EditUsageDialog } from './edit-usage-dialog';
import { ManagePlanDialog } from './manage-plan-dialog';
import { UserManagementPagination } from './user-management-pagination';
import { UserManagementTableRow } from './user-management-table-row';
import { useUserManagementTable } from './use-user-management-table';

type UserManagementTableProps = {
    initialUsers: UserResponse[];
    totalUsers: number;
    currentPage: number;
    totalPages: number;
    initialSearch: string;
    plans: PlanResponse[];
};

export function UserManagementTable({
    initialUsers,
    totalUsers,
    currentPage,
    totalPages,
    initialSearch,
    plans,
}: UserManagementTableProps) {
    const state = useUserManagementTable(initialSearch);

    const pathname = usePathname();
    const params = useSearchParams();
    const searchRef = useRef<HTMLInputElement>(null);
    const restored = useRef(false);
    useEffect(() => {
        if (restored.current) return;
        const saved = usersReturnContext();
        const href = params.size ? `${pathname}?${params}` : pathname;
        if (saved.href === href) {
            const frame = requestAnimationFrame(() => {
                window.scrollTo({ top: saved.scroll, behavior: 'instant' });
                restored.current = true;
                try { sessionStorage.removeItem(ADMIN_USERS_RETURN_KEY); } catch { /* Optional storage. */ }
            });
            return () => cancelAnimationFrame(frame);
        }
        restored.current = true;
    }, [pathname, params]);
    const clearSearch = () => { state.setSearchTerm(''); searchRef.current?.focus(); };
    const confirmationDescriptions = {
        delete: 'The account will be disabled immediately and scheduled for deletion. It can be restored during the existing restore window.',
        role: state.confirmation?.user.role === 'admin' ? 'Remove this account’s administrative access and change its role to User.' : 'Grant this account access to the admin console and administrative actions.',
        status: state.confirmation?.user.disabled ? 'Enable this account to access the application again.' : 'Disable this account so it can no longer access the application.',
        limits: 'Replace custom allocations with the defaults: 5 GB storage and 60 minutes of transcription.',
    };
    return (
        <>
            <Card className="overflow-hidden">
                <Card.Header className="flex flex-col items-start gap-4 border-b border-border p-5">
                    <div className="flex justify-between w-full items-center">
                        <div>
                            <p aria-live="polite" className="text-sm text-muted">{totalUsers} {initialSearch ? 'matches' : 'users'}</p>
                        </div>
                        {state.isPending && <Spinner size="sm" />}
                    </div>

                    <div className="flex w-full flex-wrap items-end gap-2">
                        <div className="min-w-0 flex-1 space-y-2"><Label htmlFor="admin-user-search">Search users</Label>
                        <Input
                            id="admin-user-search" ref={searchRef} type="search" aria-label="Search users" placeholder="Name or email"
                            value={state.searchTerm}
                            onChange={(event) => state.setSearchTerm(event.target.value)}
                            className="min-h-11 w-full"
                        />
                        </div>
                        {state.searchTerm && <Button variant="secondary" className="min-h-11" onPress={clearSearch}>Clear search</Button>}
                    </div>
                </Card.Header>

                <Card.Content className="p-0">
                    <div className="hidden grid-cols-[minmax(180px,1fr)_minmax(0,480px)_44px] gap-4 border-b border-border px-5 py-3 text-sm font-medium text-muted xl:grid" aria-hidden="true">
                        <span>User</span><div className="grid grid-cols-[minmax(0,0.7fr)_minmax(0,1.2fr)_minmax(0,1.2fr)_minmax(0,0.9fr)] gap-3 text-right"><span>Plan</span><span>Storage</span><span>Transcription</span><span>Last active</span></div><span className="sr-only">Actions</span>
                    </div>
                    <div className="divide-y divide-border">
                        {initialUsers.length > 0 ? (
                            initialUsers.map((user) => (
                                <UserManagementTableRow
                                    key={user.id}
                                    user={user}
                                    isDeleting={state.pendingUser === user.id}
                                    onManagePlan={state.setUserToManage}
                                    onEditUsage={state.setUserToEditUsage}
                                    onToggleRole={state.handleToggleRole}
                                    onEditLimits={state.setUserToEditLimits}
                                    onResetLimits={state.handleResetLimits}
                                    onToggleStatus={state.handleToggleStatus}
                                    onDeleteUser={state.handleDeleteUser}
                                    onRestoreUser={state.handleRestoreUser}
                                />
                            ))
                        ) : (
                            <div className="space-y-3 py-10 text-center text-muted"><p>{initialSearch ? 'No users match your search.' : 'No users found.'}</p>{initialSearch && <Button variant="secondary" onPress={clearSearch}>Clear search</Button>}</div>
                        )}
                    </div>

                    <UserManagementPagination
                        currentPage={currentPage}
                        totalPages={totalPages}
                        onPageChange={state.handlePageChange}
                    />
                </Card.Content>
            </Card>

            {state.confirmation && <ConfirmActionDialog title={`${state.confirmation.action === 'delete' ? 'Schedule deletion for' : 'Update'} ${state.confirmation.user.name || state.confirmation.user.email}?`} description={confirmationDescriptions[state.confirmation.action]} label="Confirm" pending={!!state.pendingUser} error={state.actionError} onConfirm={state.confirmAction} onClose={state.closeConfirmation} danger={state.confirmation.action === 'delete' || state.confirmation.action === 'status'} />}
            {state.userToManage && (
                <ManagePlanDialog
                    user={state.userToManage}
                    isOpen={!!state.userToManage}
                    onClose={state.closeDialogs}
                    plans={plans}
                />
            )}

            {state.userToEditLimits && (
                <EditLimitsDialog
                    user={state.userToEditLimits}
                    isOpen={!!state.userToEditLimits}
                    onClose={state.closeDialogs}
                />
            )}

            {state.userToEditUsage && (
                <EditUsageDialog
                    user={state.userToEditUsage}
                    isOpen={!!state.userToEditUsage}
                    onClose={state.closeDialogs}
                />
            )}
        </>
    );
}
