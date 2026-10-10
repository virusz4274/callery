'use client';

import { rememberUsersPosition } from '@/lib/admin-navigation';
import { useState } from 'react';
import type { UserResponse } from '@/lib/db/types';
import { Avatar, Button, Chip, Dropdown, Link, Modal } from '@heroui/react';
import { MoreVertical } from 'lucide-react';

type UserManagementTableRowProps = {
    user: UserResponse;
    teamMode?: boolean;
    isDeleting: boolean;
    onManagePlan: (user: UserResponse) => void;
    onEditUsage: (user: UserResponse) => void;
    onToggleRole: (user: UserResponse) => void;
    onEditLimits: (user: UserResponse) => void;
    onResetLimits: (user: UserResponse) => void;
    onToggleStatus: (user: UserResponse) => void;
    onDeleteUser: (user: UserResponse) => void;
    onRestoreUser: (user: UserResponse) => void;
};

export function UserManagementTableRow({
    user,
    teamMode = false,
    isDeleting,
    onManagePlan,
    onEditUsage,
    onToggleRole,
    onEditLimits,
    onResetLimits,
    onToggleStatus,
    onDeleteUser,
    onRestoreUser,
}: UserManagementTableRowProps) {
    const isSoftDeleted = user.softDelete?.isDeleted;
    const [mobileActions, setMobileActions] = useState(false);
    const act = (callback: () => void) => { setMobileActions(false); callback(); };
    if (teamMode) return <div className="flex flex-wrap items-center justify-between gap-4 px-5 py-4">
        <div className="min-w-0 space-y-1"><Link href={`/admin/users/${user.id}`} onPress={rememberUsersPosition} className="min-h-11 break-words font-semibold">{user.name || user.email}</Link>
            <p className="break-all text-sm text-muted">{user.email} · {user.role === 'admin' ? 'Administrator' : 'Member'}{user.disabled ? ' · Access removed' : ''}</p>
            <p className="text-sm text-muted">{user.totalRecordings} recordings · {(user.storageUsed / 1024 ** 3).toFixed(2)} GB</p>
        </div>
        <div className="flex flex-wrap gap-2"><Button variant="secondary" className="min-h-11" isDisabled={isDeleting} onPress={() => onToggleRole(user)}>{user.role === 'admin' ? 'Make member' : 'Make administrator'}</Button>
            <Button variant={user.disabled ? 'secondary' : 'danger-soft'} className="min-h-11" isDisabled={isDeleting} onPress={() => user.disabled ? onRestoreUser(user) : onDeleteUser(user)}>{user.disabled ? 'Restore access' : 'Remove access'}</Button>
        </div>
    </div>;

    return (
        <div
            className={`grid grid-cols-[minmax(0,1fr)_auto] items-start gap-3 px-5 py-4 xl:grid-cols-[minmax(180px,1fr)_minmax(0,480px)_44px] xl:gap-4 transition-colors ${
                user.disabled || isSoftDeleted ? 'bg-surface-secondary' : 'hover:bg-surface-secondary'
            }`}
        >
            <div className="flex items-center gap-4 min-w-0">
                <Avatar className="h-10 w-10 flex-shrink-0">
                    <Avatar.Image src={user.photoURL} alt={user.name} />
                    <Avatar.Fallback>{user.name?.charAt(0) || 'U'}</Avatar.Fallback>
                </Avatar>
                <div className="min-w-0">
                    <div className="flex flex-wrap items-center gap-2">
                        <Link href={`/admin/users/${user.id}`} onPress={rememberUsersPosition} aria-label={`Open ${user.name || user.email}`} className="min-h-11 break-words font-semibold text-foreground underline-offset-4">{user.name || 'Unnamed User'}</Link>
                        {user.role === 'admin' && (
                            <Chip color="warning" variant="soft" size="sm" className="ml-2 flex-shrink-0">
                                Admin
                            </Chip>
                        )}
                        {isSoftDeleted ? (
                            <Chip color="warning" size="sm" className="ml-2 flex-shrink-0">
                                Pending Deletion
                            </Chip>
                        ) : null}
                        {user.disabled && !isSoftDeleted && (
                            <Chip color="danger" size="sm" className="ml-2 flex-shrink-0">
                                Banned
                            </Chip>
                        )}
                    </div>
                    <p className="break-all text-sm text-muted">{user.email}</p>
                    <dl className="mt-2 space-y-1 text-sm text-muted xl:hidden">
                        <div className="flex flex-wrap gap-x-2"><dt>Plan:</dt><dd>{user.planName}</dd></div>
                        <div className="flex flex-wrap gap-x-2"><dt>Storage:</dt><dd>{(user.storageUsed / 1024 ** 3).toFixed(2)} / {(user.storageAllocation / 1024 ** 3).toFixed(2)} GB</dd></div>
                        <div className="flex flex-wrap gap-x-2"><dt>Transcription:</dt><dd>{(user.transcriptionUsed / 60).toFixed(1)} / {(user.transcriptionAllocation / 60).toFixed(1)} min</dd></div>
                        <div className="flex flex-wrap gap-x-2"><dt>Last active:</dt><dd>{user.lastLoginAt ? new Date(user.lastLoginAt).toLocaleDateString() : 'Never'}</dd></div>
                    </dl>
                    {isSoftDeleted ? (
                        <p className="break-words text-xs text-warning">
                            Restore by {new Date(user.softDelete!.restoreUntil).toLocaleDateString()}
                        </p>
                    ) : null}
                </div>
            </div>

            <div className="hidden min-w-0 grid-cols-[minmax(0,0.7fr)_minmax(0,1.2fr)_minmax(0,1.2fr)_minmax(0,0.9fr)] items-start gap-3 break-words text-sm xl:grid">
                <div className="text-right">
                    <p className="flex min-h-11 items-center justify-end font-medium">{user.planName}</p>
                </div>
                <div className="text-right">
                    <p className="flex min-h-11 items-center justify-end font-medium">
                        {(user.storageUsed / (1024 * 1024 * 1024)).toFixed(2)} /{' '}
                        {Number((user.storageAllocation / 1024 ** 3).toFixed(2))} GB
                    </p>
                </div>
                <div className="text-right">
                    <p className="flex min-h-11 items-center justify-end font-medium">
                        {(user.transcriptionUsed / 60).toFixed(1)} / {Number((user.transcriptionAllocation / 60).toFixed(2))} min
                    </p>
                </div>
                <div className="text-right">
                    <p className="flex min-h-11 items-center justify-end font-medium text-foreground">
                        {user.lastLoginAt ? new Date(user.lastLoginAt).toLocaleDateString() : 'Never'}
                    </p>
                </div>
            </div>

            <div className="flex items-center gap-1">
                <Button aria-label={`Actions for ${user.name || user.email}`} isIconOnly variant="ghost" className="size-11 xl:hidden" isDisabled={isDeleting} onPress={() => setMobileActions(true)}><MoreVertical className="size-4" /></Button>
                <div className="hidden xl:block"><Dropdown>
                    <Dropdown.Trigger aria-label={`Actions for ${user.name || user.email}`} isDisabled={isDeleting} className="flex size-11 items-center justify-center rounded-full hover:bg-surface-secondary">
                        <MoreVertical className="h-4 w-4" />
                    </Dropdown.Trigger>
                    <Dropdown.Popover placement="bottom end" offset={8} className="w-64 max-w-[calc(100vw-2rem)]">
                        <Dropdown.Menu aria-label="User Actions">
                            <Dropdown.Item id="details" href={`/admin/users/${user.id}`} onAction={rememberUsersPosition}>
                                View Details
                            </Dropdown.Item>

                            <Dropdown.Item id="plan" onAction={() => onManagePlan(user)}>
                                Manage Plan
                            </Dropdown.Item>

                            <Dropdown.Item id="usage" onAction={() => onEditUsage(user)}>
                                Adjust Usage
                            </Dropdown.Item>

                            <Dropdown.Item id="role" onAction={() => onToggleRole(user)}>
                                {user.role === 'admin' ? 'Demote to User' : 'Promote to Admin'}
                            </Dropdown.Item>

                            <Dropdown.Item id="edit_limits" onAction={() => onEditLimits(user)}>
                                Edit Limits
                            </Dropdown.Item>

                            <Dropdown.Item id="limits" onAction={() => onResetLimits(user)}>
                                Reset Defaults
                            </Dropdown.Item>

                            {!isSoftDeleted ? (
                                <Dropdown.Item
                                    id="status"
                                    className={user.disabled ? 'text-success' : 'text-danger'}
                                    onAction={() => onToggleStatus(user)}
                                >
                                    {user.disabled ? 'Enable User' : 'Disable User'}
                                </Dropdown.Item>
                            ) : null}

                            {isSoftDeleted ? (
                                <Dropdown.Item id="restore" className="text-success" onAction={() => onRestoreUser(user)}>
                                    {isDeleting ? 'Restoring...' : 'Restore User'}
                                </Dropdown.Item>
                            ) : (
                                <Dropdown.Item id="delete" className="text-danger" onAction={() => onDeleteUser(user)}>
                                    {isDeleting ? 'Deleting...' : 'Delete User'}
                                </Dropdown.Item>
                            )}
                        </Dropdown.Menu>
                    </Dropdown.Popover>
                </Dropdown></div>
                <Modal.Backdrop isOpen={mobileActions} onOpenChange={setMobileActions}><Modal.Container placement="bottom" size="lg" scroll="inside"><Modal.Dialog className="p-0">
                        <Modal.CloseTrigger className="size-11" aria-label="Close user actions" />
                        <Modal.Header className="px-5 py-4 pr-16"><Modal.Heading>User actions</Modal.Heading></Modal.Header>
                        <Modal.Body className="border-t border-border px-5 py-4">
                            <p className="mb-4 break-words font-medium text-foreground">{user.name || user.email}</p>
                            <div className="grid gap-2">
                                <Link href={`/admin/users/${user.id}`} onPress={() => { rememberUsersPosition(); setMobileActions(false); }} className="min-h-11 py-3">View Details</Link>
                                <Button variant="secondary" className="h-auto min-h-11 whitespace-normal py-3" onPress={() => act(() => onManagePlan(user))}>Manage Plan</Button>
                                <Button variant="secondary" className="h-auto min-h-11 whitespace-normal py-3" onPress={() => act(() => onEditUsage(user))}>Adjust Usage</Button>
                                <Button variant="secondary" className="h-auto min-h-11 whitespace-normal py-3" onPress={() => act(() => onToggleRole(user))}>{user.role === 'admin' ? 'Demote to User' : 'Promote to Admin'}</Button>
                                <Button variant="secondary" className="h-auto min-h-11 whitespace-normal py-3" onPress={() => act(() => onEditLimits(user))}>Edit Limits</Button>
                                <Button variant="secondary" className="h-auto min-h-11 whitespace-normal py-3" onPress={() => act(() => onResetLimits(user))}>Reset Defaults</Button>
                                {!isSoftDeleted && <Button variant={user.disabled ? 'secondary' : 'danger-soft'} className="h-auto min-h-11 whitespace-normal py-3" onPress={() => act(() => onToggleStatus(user))}>{user.disabled ? 'Enable User' : 'Disable User'}</Button>}
                                <Button variant={isSoftDeleted ? 'secondary' : 'danger-soft'} className="h-auto min-h-11 whitespace-normal py-3" onPress={() => act(() => isSoftDeleted ? onRestoreUser(user) : onDeleteUser(user))}>{isSoftDeleted ? 'Restore User' : 'Delete User'}</Button>
                            </div>
                        </Modal.Body>
                    </Modal.Dialog></Modal.Container></Modal.Backdrop>
            </div>
        </div>
    );
}
