
"use client";

import React, { useState, useMemo } from 'react';
import type { Contact } from '@/lib/types';
import { PlaceHolderImages } from '@/lib/placeholder-images';
import {
  Dropdown,
  Button,
  Avatar,
  Card,
  Input
} from '@heroui/react';
import { MoreVertical, Search, ChevronLeft, ChevronRight } from 'lucide-react';
import { ManagePlanDialog } from './manage-plan-dialog';
import { useRouter } from 'next/navigation';

const ITEMS_PER_PAGE = 5;

type UserManagementTableProps = {
  allUsers: Contact[];
};

export function UserManagementTable({ allUsers }: UserManagementTableProps) {
  const [userToManage, setUserToManage] = useState<Contact | null>(null);
  const [searchQuery, setSearchQuery] = useState('');
  const [currentPage, setCurrentPage] = useState(1);
  const router = useRouter();

  const handleManagePlanClick = (user: Contact) => {
    setUserToManage(user);
  };

  const handleNavigation = (path: string) => {
    router.push(path);
  };

  const closeDialog = () => {
    setUserToManage(null);
  };

  const filteredUsers = useMemo(() => {
    if (!searchQuery) return allUsers;
    const lowercasedQuery = searchQuery.toLowerCase();
    return allUsers.filter(user =>
      user.name.toLowerCase().includes(lowercasedQuery) ||
      (user.phoneNumber || '').includes(lowercasedQuery)
    );
  }, [allUsers, searchQuery]);

  const totalPages = Math.ceil(filteredUsers.length / ITEMS_PER_PAGE);
  const paginatedUsers = useMemo(() => {
    const startIndex = (currentPage - 1) * ITEMS_PER_PAGE;
    return filteredUsers.slice(startIndex, startIndex + ITEMS_PER_PAGE);
  }, [filteredUsers, currentPage]);

  const nameToSlug = (name: string) => name.toLowerCase().replace(/\s+/g, '-');

  return (
    <>
      <Card>
        <Card.Header className="flex flex-col items-start gap-2">
          <h3 className="text-xl font-bold">User Management</h3>
          <p className="text-small text-default-500">
            A list of all registered users in the system. Found {filteredUsers.length} users.
          </p>
          <div className="w-full sm:max-w-xs pt-2">
            <Input
              placeholder="Search users by name or phone..."
              value={searchQuery}
              onChange={(e) => {
                setSearchQuery(e.target.value);
                setCurrentPage(1);
              }}
              // Manual startContent equivalent if Input doesn't support it directly in v3 beta (it likely does via slots but for safety I'll let it be for now or wrap)
              // startContent={<Search className="text-default-400" size={16} />} 
              className="w-full"
            />
          </div>
        </Card.Header>
        <Card.Content>
          <div className="space-y-4">
            {paginatedUsers.length > 0 ? paginatedUsers.map((user) => {
              const userIndex = allUsers.findIndex((c) => c.phoneNumber === user.phoneNumber);
              const avatar = userIndex !== -1 ? PlaceHolderImages[userIndex % PlaceHolderImages.length] : undefined;
              const userSlug = nameToSlug(user.name);
              return (
                <div
                  key={user.phoneNumber || user.id}
                  className="flex items-center justify-between p-2 rounded-lg hover:bg-default-100 transition-colors"
                >
                  <div className="flex items-center gap-4">
                    <Avatar className="h-10 w-10">
                      <Avatar.Image src={avatar?.imageUrl} alt={user.name} />
                      <Avatar.Fallback>{user.name.charAt(0)}</Avatar.Fallback>
                    </Avatar>
                    <div>
                      <p className="font-semibold">{user.name}</p>
                      <p className="text-small text-default-500">{user.phoneNumber}</p>
                    </div>
                  </div>
                  <div className="hidden sm:flex items-center gap-6 text-sm">
                    <div>
                      <p className="font-medium text-right">{user.plan}</p>
                      <p className="text-default-500 text-right">Plan</p>
                    </div>
                    <div>
                      <p className="font-medium text-right">{user.storageUsed.toFixed(2)} / {user.storageAllocation} GB</p>
                      <p className="text-default-500 text-right">Storage</p>
                    </div>
                    <div>
                      <p className="font-medium text-right">{user.transcriptionUsed} / {user.transcriptionAllocation} min</p>
                      <p className="text-default-500 text-right">Transcription</p>
                    </div>
                  </div>
                  <Dropdown>
                    <Button variant="ghost" isIconOnly size="sm">
                      <MoreVertical className="h-4 w-4" />
                      <span className="sr-only">Actions</span>
                    </Button>
                    <Dropdown.Popover>
                      <Dropdown.Menu aria-label="User Actions">
                        <Dropdown.Item key="details" onPress={() => handleNavigation(`/admin/users/${userSlug}`)}>View User Details</Dropdown.Item>
                        <Dropdown.Item key="payment" onPress={() => handleNavigation(`/admin/users/${userSlug}?tab=payment-history`)}>View Payment History</Dropdown.Item>
                        <Dropdown.Item key="plan" onPress={() => handleManagePlanClick(user)}>
                          Manage Plan
                        </Dropdown.Item>
                        <Dropdown.Item key="disable" className="text-danger">
                          Disable User
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
            <div className="flex justify-center pt-6 gap-2 items-center">
              <Button
                variant="secondary"
                size="sm"
                isIconOnly
                isDisabled={currentPage === 1}
                onPress={() => setCurrentPage(p => Math.max(1, p - 1))}
              >
                <ChevronLeft className="h-4 w-4" />
              </Button>
              <span className="text-small text-default-500">
                Page {currentPage} of {totalPages}
              </span>
              <Button
                variant="secondary"
                size="sm"
                isIconOnly
                isDisabled={currentPage === totalPages}
                onPress={() => setCurrentPage(p => Math.min(totalPages, p + 1))}
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
        />
      )}
    </>
  );
}
