'use client';

import type { UserResponse } from '@/lib/db/types';
import { Avatar, Button, Chip, Dropdown } from '@heroui/react';
import { MoreVertical } from 'lucide-react';

type UserManagementTableRowProps = {
    user: UserResponse;
    isDeleting: boolean;
    onViewDetails: (userId: string) => void;
    onManagePlan: (user: UserResponse) => void;
    onEditUsage: (user: UserResponse) => void;
    onToggleRole: (userId: string, currentRole: 'user' | 'admin') => void;
    onEditLimits: (user: UserResponse) => void;
    onResetLimits: (userId: string) => void;
    onToggleStatus: (userId: string, currentStatus?: boolean) => void;
    onDeleteUser: (userId: string) => void;
    onRestoreUser: (userId: string) => void;
};

export function UserManagementTableRow({
    user,
    isDeleting,
    onViewDetails,
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

    return (
        <div
            className={`grid grid-cols-[1fr_auto_auto] items-center gap-4 p-4 hover:bg-default-50 transition-colors ${user.disabled || isSoftDeleted ? 'opacity-60 bg-default-100' : ''}`}
        >
            <div className="flex items-center gap-4 min-w-0">
                <Avatar className="h-10 w-10 flex-shrink-0">
                    <Avatar.Image src={user.photoURL} alt={user.name} />
                    <Avatar.Fallback>{user.name?.charAt(0) || 'U'}</Avatar.Fallback>
                </Avatar>
                <div className="min-w-0 overflow-hidden">
                    <div className="flex items-center gap-2">
                        <p className="font-semibold truncate">{user.name || 'Unnamed User'}</p>
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
                    <p className="text-small text-default-500 truncate">{user.email}</p>
                    {isSoftDeleted ? (
                        <p className="text-xs text-warning-600 truncate">
                            Restore by {new Date(user.softDelete!.restoreUntil).toLocaleDateString()}
                        </p>
                    ) : null}
                </div>
            </div>

            <div className="hidden md:grid grid-cols-[80px_130px_130px_120px] gap-4 text-sm items-center flex-shrink-0 mr-4">
                <div className="text-right">
                    <p className="font-medium">{user.plan}</p>
                    <p className="text-xs text-default-400">Plan</p>
                </div>
                <div className="text-right">
                    <p className="font-medium">
                        {(user.storageUsed / (1024 * 1024 * 1024)).toFixed(2)} /{' '}
                        {(user.storageAllocation / (1024 * 1024 * 1024)).toFixed(0)} GB
                    </p>
                    <p className="text-xs text-default-400">Storage</p>
                </div>
                <div className="text-right">
                    <p className="font-medium">
                        {(user.transcriptionUsed / 60).toFixed(1)} / {(user.transcriptionAllocation / 60).toFixed(0)} min
                    </p>
                    <p className="text-xs text-default-400">Transcription</p>
                </div>
                <div className="text-right">
                    <p className="font-medium text-default-700">
                        {user.lastLoginAt ? new Date(user.lastLoginAt).toLocaleDateString() : 'Never'}
                    </p>
                    <p className="text-xs text-default-400">Last Active</p>
                </div>
            </div>

            <Dropdown>
                <Button variant="ghost" isIconOnly size="sm">
                    <MoreVertical className="h-4 w-4" />
                    <span className="sr-only">Actions</span>
                </Button>
                <Dropdown.Popover>
                    <Dropdown.Menu aria-label="User Actions">
                        <Dropdown.Item key="details" onPress={() => onViewDetails(user.id)}>
                            View Details
                        </Dropdown.Item>

                        <Dropdown.Item key="plan" onPress={() => onManagePlan(user)}>
                            Manage Plan
                        </Dropdown.Item>

                        <Dropdown.Item key="usage" onPress={() => onEditUsage(user)}>
                            Adjust Usage
                        </Dropdown.Item>

                        <Dropdown.Item key="role" onPress={() => onToggleRole(user.id, user.role)}>
                            {user.role === 'admin' ? 'Demote to User' : 'Promote to Admin'}
                        </Dropdown.Item>

                        <Dropdown.Item key="edit_limits" onPress={() => onEditLimits(user)}>
                            Edit Limits
                        </Dropdown.Item>

                        <Dropdown.Item key="limits" onPress={() => onResetLimits(user.id)}>
                            Reset Defaults
                        </Dropdown.Item>

                        {!isSoftDeleted ? (
                            <Dropdown.Item
                                key="status"
                                className={user.disabled ? 'text-success' : 'text-danger'}
                                onPress={() => onToggleStatus(user.id, user.disabled)}
                            >
                                {user.disabled ? 'Enable User' : 'Disable User'}
                            </Dropdown.Item>
                        ) : null}

                        {isSoftDeleted ? (
                            <Dropdown.Item key="restore" className="text-success" onPress={() => onRestoreUser(user.id)}>
                                {isDeleting ? 'Restoring...' : 'Restore User'}
                            </Dropdown.Item>
                        ) : (
                            <Dropdown.Item key="delete" className="text-danger" onPress={() => onDeleteUser(user.id)}>
                                {isDeleting ? 'Deleting...' : 'Delete User'}
                            </Dropdown.Item>
                        )}
                    </Dropdown.Menu>
                </Dropdown.Popover>
            </Dropdown>
        </div>
    );
}
