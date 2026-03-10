'use client';

import React from 'react';
import { Card, Input, Spinner } from '@heroui/react';
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

    return (
        <>
            <Card>
                <Card.Header className="flex flex-col items-start gap-4 p-4">
                    <div className="flex justify-between w-full items-center">
                        <div>
                            <h3 className="text-xl font-bold">User Management</h3>
                            <p className="text-small text-default-500">Total Users: {totalUsers}</p>
                        </div>
                        {state.isPending && <Spinner size="sm" />}
                    </div>

                    <div className="w-full sm:max-w-xs">
                        <Input
                            placeholder="Search users..."
                            value={state.searchTerm}
                            onChange={(event) => state.setSearchTerm(event.target.value)}
                            className="w-full"
                        />
                    </div>
                </Card.Header>

                <Card.Content className="p-0">
                    <div className="divide-y divide-default-100">
                        {initialUsers.length > 0 ? (
                            initialUsers.map((user) => (
                                <UserManagementTableRow
                                    key={user.id}
                                    user={user}
                                    isDeleting={state.isDeleting === user.id}
                                    onViewDetails={(userId) => state.router.push(`/admin/users/${userId}`)}
                                    onManagePlan={state.setUserToManage}
                                    onEditUsage={state.setUserToEditUsage}
                                    onToggleRole={state.handleToggleRole}
                                    onEditLimits={state.setUserToEditLimits}
                                    onResetLimits={state.handleResetLimits}
                                    onToggleStatus={state.handleToggleStatus}
                                    onDeleteUser={state.handleDeleteUser}
                                />
                            ))
                        ) : (
                            <div className="text-center py-10 text-default-500">No users found.</div>
                        )}
                    </div>

                    <UserManagementPagination
                        currentPage={currentPage}
                        totalPages={totalPages}
                        onPageChange={state.handlePageChange}
                    />
                </Card.Content>
            </Card>

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
