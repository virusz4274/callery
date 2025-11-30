
"use client";

import React from 'react';
import Link from 'next/link';
import { usePathname, useRouter, useSearchParams } from 'next/navigation';
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
import { Users, LayoutDashboard, Search } from 'lucide-react';
import { PlaceHolderImages } from '@/lib/placeholder-images';
import { Input } from './ui/input';
import { Logo } from './icons';
import { cn } from '@/lib/utils';

type AppHeaderProps = {
  searchQuery: string;
  onSearchChange: (query: string) => void;
};

export function AppHeader({ searchQuery, onSearchChange }: AppHeaderProps) {
  const userAvatar = PlaceHolderImages.find(img => img.id === 'user1');
  const pathname = usePathname();

  const navItems = [
    { href: '/', name: 'Recordings', icon: LayoutDashboard },
    { href: '/contacts', name: 'Contacts', icon: Users },
  ];

  return (
    <header className="sticky top-0 z-10 flex h-16 items-center gap-4 border-b bg-background px-4 sm:px-6">
       <Link href="/" className="flex items-center gap-2 text-lg font-semibold">
          <Logo className="size-6 text-primary" />
          <span className="sr-only">CallOrganizer</span>
        </Link>
      
      <nav className="hidden md:flex items-center gap-2 text-sm font-medium">
        {navItems.map((item) => (
          <Link
            key={item.href}
            href={item.href}
            className={cn(
                "flex items-center gap-2 rounded-md px-3 py-2 text-muted-foreground transition-colors hover:text-foreground",
                pathname === item.href && "bg-muted text-foreground"
            )}
            >
            <item.icon className="h-4 w-4" />
            {item.name}
          </Link>
        ))}
      </nav>

      <div className="ml-auto flex items-center gap-4">
        <div className="relative w-full max-w-sm">
            <Search className="absolute left-2.5 top-2.5 h-4 w-4 text-muted-foreground" />
            <Input
                type="search"
                placeholder="Search recordings..."
                className="w-full bg-background pl-8"
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
