"use client";

import { SidebarTrigger } from '@/components/ui/sidebar';
import { Input } from '@/components/ui/input';
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu';
import { Button } from '@/components/ui/button';
import { Avatar, AvatarFallback, AvatarImage } from '@/components/ui/avatar';
import { Search, ChevronRight, Users, Clock } from 'lucide-react';
import { PlaceHolderImages } from '@/lib/placeholder-images';

type AppHeaderProps = {
  searchQuery: string;
  onSearchChange: (query: string) => void;
  currentFilter: { type: string | null; value: string | null };
};

export function AppHeader({ searchQuery, onSearchChange, currentFilter }: AppHeaderProps) {
  const userAvatar = PlaceHolderImages.find(img => img.id === 'user1');

  return (
    <header className="sticky top-0 z-10 flex h-16 items-center gap-4 border-b bg-background px-4 sm:px-6">
      <SidebarTrigger className="md:hidden" />

      <div className="flex items-center gap-2 text-sm text-muted-foreground">
        <span className="font-medium text-foreground">CallOrganizer</span>
        {currentFilter.type && (
          <>
            <ChevronRight className="h-4 w-4" />
            {currentFilter.type === 'contact' ? <Users className="h-4 w-4"/> : <Clock className="h-4 w-4"/>}
            <span className="font-medium text-foreground">{currentFilter.value}</span>
          </>
        )}
      </div>

      <div className="ml-auto flex items-center gap-4">
        <div className="relative">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
          <Input
            type="search"
            placeholder="Search recordings..."
            className="pl-9 w-48 md:w-64"
            value={searchQuery}
            onChange={(e) => onSearchChange(e.target.value)}
          />
        </div>

        <DropdownMenu>
          <DropdownMenuTrigger asChild>
            <Button variant="ghost" size="icon" className="rounded-full">
              <Avatar className="h-8 w-8">
                {userAvatar && <AvatarImage src={userAvatar.imageUrl} alt="User avatar" data-ai-hint={userAvatar.imageHint}/>}
                <AvatarFallback>U</AvatarFallback>
              </Avatar>
            </Button>
          </DropdownMenuTrigger>
          <DropdownMenuContent align="end">
            <DropdownMenuLabel>My Account</DropdownMenuLabel>
            <DropdownMenuSeparator />
            <DropdownMenuItem>Settings</DropdownMenuItem>
            <DropdownMenuItem>Support</DropdownMenuItem>
            <DropdownMenuSeparator />
            <DropdownMenuItem>Logout</DropdownMenuItem>
          </DropdownMenuContent>
        </DropdownMenu>
      </div>
    </header>
  );
}
