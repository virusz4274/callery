
"use client";

import React, { useState, useMemo } from 'react';
import type { Contact } from '@/lib/types';
import { PlaceHolderImages } from '@/lib/placeholder-images';
import Image from 'next/image';
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu';
import { Button } from '@/components/ui/button';
import { Avatar, AvatarFallback } from '@/components/ui/avatar';
import { MoreVertical, Search } from 'lucide-react';
import { ManagePlanDialog } from './manage-plan-dialog';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Input } from '@/components/ui/input';
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
      user.phoneNumber.includes(lowercasedQuery)
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
        <CardHeader>
          <CardTitle>User Management</CardTitle>
          <CardDescription>
            A list of all registered users in the system. Found {filteredUsers.length} users.
          </CardDescription>
          <div className="relative pt-2">
            <Search className="absolute left-2.5 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
            <Input
              placeholder="Search users by name or phone..."
              className="w-full rounded-lg bg-background pl-8 md:w-[320px]"
              value={searchQuery}
              onChange={(e) => {
                setSearchQuery(e.target.value);
                setCurrentPage(1); // Reset to first page on new search
              }}
            />
          </div>
        </CardHeader>
        <CardContent>
            <div className="space-y-4">
            {paginatedUsers.length > 0 ? paginatedUsers.map((user) => {
                const userIndex = allUsers.findIndex((c) => c.phoneNumber === user.phoneNumber);
                const avatar = userIndex !== -1 ? PlaceHolderImages[userIndex % PlaceHolderImages.length] : undefined;
                const userSlug = nameToSlug(user.name);
                return (
                <div
                    key={user.phoneNumber}
                    className="flex items-center justify-between p-2 rounded-lg hover:bg-muted/50"
                >
                    <div className="flex items-center gap-4">
                    <Avatar>
                        {avatar && (
                        <Image
                            src={avatar.imageUrl}
                            alt={user.name}
                            width={40}
                            height={40}
                            data-ai-hint={avatar.imageHint}
                            className="rounded-full object-cover"
                        />
                        )}
                        <AvatarFallback>{user.name.charAt(0)}</AvatarFallback>
                    </Avatar>
                    <div>
                        <p className="font-semibold">{user.name}</p>
                        <p className="text-sm text-muted-foreground">{user.phoneNumber}</p>
                    </div>
                    </div>
                    <div className="hidden sm:flex items-center gap-6 text-sm">
                    <div>
                        <p className="font-medium text-right">{user.plan}</p>
                        <p className="text-muted-foreground text-right">Plan</p>
                    </div>
                    <div>
                        <p className="font-medium text-right">{user.storageUsed.toFixed(2)} / {user.storageAllocation} GB</p>
                        <p className="text-muted-foreground text-right">Storage</p>
                    </div>
                    <div>
                        <p className="font-medium text-right">{user.transcriptionUsed} / {user.transcriptionAllocation} min</p>
                        <p className="text-muted-foreground text-right">Transcription</p>
                    </div>
                    </div>
                    <DropdownMenu>
                    <DropdownMenuTrigger asChild>
                        <Button variant="ghost" size="icon">
                        <MoreVertical className="h-4 w-4" />
                        <span className="sr-only">Actions</span>
                        </Button>
                    </DropdownMenuTrigger>
                    <DropdownMenuContent align="end">
                        <DropdownMenuItem onSelect={() => handleNavigation(`/admin/users/${userSlug}`)}>View User Details</DropdownMenuItem>
                        <DropdownMenuItem onSelect={() => handleNavigation(`/admin/users/${userSlug}?tab=payment-history`)}>View Payment History</DropdownMenuItem>
                        <DropdownMenuSeparator />
                        <DropdownMenuItem onSelect={() => handleManagePlanClick(user)}>
                        Manage Plan
                        </DropdownMenuItem>
                        <DropdownMenuSeparator />
                        <DropdownMenuItem className="text-destructive focus:text-destructive">
                        Disable User
                        </DropdownMenuItem>
                    </DropdownMenuContent>
                    </DropdownMenu>
                </div>
                );
            }) : (
                <div className="text-center py-10 text-muted-foreground">
                    No users found.
                </div>
            )}
            </div>
             {totalPages > 1 && (
            <div className="flex items-center justify-end pt-6">
                <div className="flex items-center gap-2">
                <Button
                    variant="outline"
                    size="sm"
                    onClick={() => setCurrentPage(p => Math.max(1, p - 1))}
                    disabled={currentPage === 1}
                >
                    Previous
                </Button>
                <span className="text-sm text-muted-foreground">
                    Page {currentPage} of {totalPages}
                </span>
                <Button
                    variant="outline"
                    size="sm"
                    onClick={() => setCurrentPage(p => Math.min(totalPages, p + 1))}
                    disabled={currentPage === totalPages}
                >
                    Next
                </Button>
                </div>
            </div>
            )}
        </CardContent>
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
