"use client";

import React, { useState, useTransition } from 'react';
import type { UserResponse, PlanResponse } from '@/lib/db/types'; // Using UserResponse as it comes from API/Server Action

import {
  Dropdown,
  Button,
  Avatar,
  Card,
  Input,
  Chip,
  Spinner
} from '@heroui/react';
import { MoreVertical, ChevronLeft, ChevronRight } from 'lucide-react';
import { ManagePlanDialog } from './manage-plan-dialog';
import { EditLimitsDialog } from './edit-limits-dialog';
import { EditUsageDialog } from './edit-usage-dialog';
import { useRouter, useSearchParams, usePathname } from 'next/navigation';
import {
  toggleUserStatus,
  updateUserRole,
  updateUserLimits,
  deleteUser
} from '@/app/actions/admin';

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
  plans
}: UserManagementTableProps) {
  const [userToManage, setUserToManage] = useState<UserResponse | null>(null);
  const [userToEditLimits, setUserToEditLimits] = useState<UserResponse | null>(null);
  const [userToEditUsage, setUserToEditUsage] = useState<UserResponse | null>(null);
  const router = useRouter();
  const searchParams = useSearchParams();
  const pathname = usePathname();
  const [isPending, startTransition] = useTransition();

  // Better approach without external lib for now:
  const [searchTerm, setSearchTerm] = useState(initialSearch);
  const [isDeleting, setIsDeleting] = useState<string | null>(null); // Track which user is being deleted

  // Search handler
  const handleSearch = React.useCallback((term: string) => {
    const params = new URLSearchParams(searchParams);
    if (term) {
      params.set('search', term);
    } else {
      params.delete('search');
    }
    params.set('page', '1');
    router.replace(`${pathname}?${params.toString()}`);
  }, [searchParams, pathname, router]);

  React.useEffect(() => {
    const timeoutId = setTimeout(() => {
      if (searchTerm !== initialSearch) {
        handleSearch(searchTerm);
      }
    }, 500);
    return () => clearTimeout(timeoutId);
  }, [searchTerm, initialSearch, handleSearch]);

  const handlePageChange = (page: number) => {
    const params = new URLSearchParams(searchParams);
    params.set('page', page.toString());
    router.push(`${pathname}?${params.toString()}`);
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
    // Reset to defaults: 5GB storage, 60 mins transcription
    if (confirm('Are you sure you want to reset this users limits to default (5GB, 60min)?')) {
      startTransition(async () => {
        await updateUserLimits(userId, {
          storageAllocation: 5 * 1024 * 1024 * 1024,
          transcriptionAllocation: 60 * 60
        });
      });
    }
  };

  const handleManagePlanClick = (user: UserResponse) => {
    setUserToManage(user);
  };

  const closeDialog = () => {
    setUserToManage(null);
    setUserToEditLimits(null);
    setUserToEditUsage(null);
  };

  const handleDeleteUser = async (userId: string) => {
    if (!confirm('Are you sure you want to permanently delete this user? This action cannot be undone and will remove all their data.')) {
      return;
    }

    setIsDeleting(userId);
    try {
      await deleteUser(userId);
      // router.refresh(); // Server action revalidates, but router.refresh ensures client updates
    } catch (error) {
      alert('Failed to delete user');
      console.error(error);
    } finally {
      setIsDeleting(null);
    }
  };

  return (
    <>
      <Card>
        <Card.Header className="flex flex-col items-start gap-4 p-4">
          <div className="flex justify-between w-full items-center">
            <div>
              <h3 className="text-xl font-bold">User Management</h3>
              <p className="text-small text-default-500">
                Total Users: {totalUsers}
              </p>
            </div>
            {isPending && <Spinner size="sm" />}
          </div>

          <div className="w-full sm:max-w-xs">
            <Input
              placeholder="Search users..."
              value={searchTerm}
              onChange={(e) => setSearchTerm(e.target.value)}
              className="w-full"
            />
          </div>
        </Card.Header>
        <Card.Content className="p-0">
          <div className="divide-y divide-default-100">
            {initialUsers.length > 0 ? initialUsers.map((user) => {
              return (
                <div
                  key={user.id}
                  className={`grid grid-cols-[1fr_auto_auto] items-center gap-4 p-4 hover:bg-default-50 transition-colors ${user.disabled ? 'opacity-60 bg-default-100' : ''}`}
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
                          <Chip color="warning" variant="soft" size="sm" className="ml-2 flex-shrink-0">Admin</Chip>
                        )}
                        {user.disabled && (
                          <Chip color="danger" size="sm" className="ml-2 flex-shrink-0">Banned</Chip>
                        )}
                      </div>
                      <p className="text-small text-default-500 truncate">{user.email}</p>
                    </div>
                  </div>

                  <div className="hidden md:grid grid-cols-[80px_130px_130px_120px] gap-4 text-sm items-center flex-shrink-0 mr-4">
                    <div className="text-right">
                      <p className="font-medium">{user.plan}</p>
                      <p className="text-xs text-default-400">Plan</p>
                    </div>
                    <div className="text-right">
                      <p className="font-medium">{(user.storageUsed / (1024 * 1024 * 1024)).toFixed(2)} / {(user.storageAllocation / (1024 * 1024 * 1024)).toFixed(0)} GB</p>
                      <p className="text-xs text-default-400">Storage</p>
                    </div>
                    <div className="text-right">
                      <p className="font-medium">{(user.transcriptionUsed / 60).toFixed(1)} / {(user.transcriptionAllocation / 60).toFixed(0)} min</p>
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
                        {/* Navigation handled via router for implementation simplicity */}
                        <Dropdown.Item key="details" onPress={() => router.push(`/admin/users/${user.id}`)}>
                          View Details
                        </Dropdown.Item>

                        <Dropdown.Item key="plan" onPress={() => handleManagePlanClick(user)}>
                          Manage Plan
                        </Dropdown.Item>

                        <Dropdown.Item key="usage" onPress={() => setUserToEditUsage(user)}>
                          Adjust Usage
                        </Dropdown.Item>

                        <Dropdown.Item key="role" onPress={() => handleToggleRole(user.id, user.role)}>
                          {user.role === 'admin' ? 'Demote to User' : 'Promote to Admin'}
                        </Dropdown.Item>

                        <Dropdown.Item key="edit_limits" onPress={() => setUserToEditLimits(user)}>
                          Edit Limits
                        </Dropdown.Item>

                        <Dropdown.Item key="limits" onPress={() => handleResetLimits(user.id)}>
                          Reset Defaults
                        </Dropdown.Item>

                        <Dropdown.Item
                          key="status"
                          className={user.disabled ? "text-success" : "text-danger"}
                          onPress={() => handleToggleStatus(user.id, user.disabled)}
                        >
                          {user.disabled ? 'Enable User' : 'Disable User'}
                        </Dropdown.Item>
                        <Dropdown.Item
                          key="delete"
                          className="text-danger"
                          onPress={() => handleDeleteUser(user.id)}
                        >
                          {isDeleting === user.id ? 'Deleting...' : 'Delete User'}
                        </Dropdown.Item>
                      </Dropdown.Menu>
                    </Dropdown.Popover>
                  </Dropdown>
                </div>
              );
            }) : (
              <div className="text-center py-10 text-default-500">
                No users found.
              </div>
            )}
          </div>

          {totalPages > 1 && (
            <div className="flex justify-center p-4 gap-2 items-center border-t border-default-100">
              <Button
                variant="ghost"
                size="sm"
                isIconOnly
                isDisabled={currentPage === 1}
                onPress={() => handlePageChange(currentPage - 1)}
              >
                <ChevronLeft className="h-4 w-4" />
              </Button>
              <span className="text-small text-default-500">
                Page {currentPage} of {totalPages}
              </span>
              <Button
                variant="ghost"
                size="sm"
                isIconOnly
                isDisabled={currentPage === totalPages}
                onPress={() => handlePageChange(currentPage + 1)}
              >
                <ChevronRight className="h-4 w-4" />
              </Button>
            </div>
          )}
        </Card.Content>
      </Card>

      {userToManage && (
        <ManagePlanDialog
          user={userToManage}
          isOpen={!!userToManage}
          onClose={closeDialog}
          plans={plans}
        />
      )}

      {userToEditLimits && (
        <EditLimitsDialog
          user={userToEditLimits}
          isOpen={!!userToEditLimits}
          onClose={closeDialog}
        />
      )}

      {userToEditUsage && (
        <EditUsageDialog
          user={userToEditUsage}
          isOpen={!!userToEditUsage}
          onClose={closeDialog}
        />
      )}
    </>
  );
}
