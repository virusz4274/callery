
"use client";

import type { Contact } from '@/lib/types';
import { PlaceHolderImages } from '@/lib/placeholder-images';
import Image from 'next/image';
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu';
import { Button } from '@/components/ui/button';
import { Avatar, AvatarFallback } from '@/components/ui/avatar';
import { MoreVertical } from 'lucide-react';

type UserManagementTableProps = {
  allUsers: Contact[];
};

export function UserManagementTable({ allUsers }: UserManagementTableProps) {
  return (
    <div className="space-y-4">
      {allUsers.map((user) => {
        const avatar =
          PlaceHolderImages[
            allUsers.findIndex((c) => c.phoneNumber === user.phoneNumber) %
              PlaceHolderImages.length
          ];
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
                <p className="font-medium text-right">{user.storageUsed.toFixed(2)} GB</p>
                <p className="text-muted-foreground text-right">Storage</p>
              </div>
              <div>
                <p className="font-medium text-right">{user.transcriptionUsed} min</p>
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
                <DropdownMenuItem>View Details</DropdownMenuItem>
                <DropdownMenuItem>Manage Plan</DropdownMenuItem>
                <DropdownMenuItem className="text-destructive focus:text-destructive">
                  Disable User
                </DropdownMenuItem>
              </DropdownMenuContent>
            </DropdownMenu>
          </div>
        );
      })}
    </div>
  );
}
