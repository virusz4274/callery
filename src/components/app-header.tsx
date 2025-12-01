

"use client";

import React from 'react';
import Link from 'next/link';
import { usePathname, useRouter } from 'next/navigation';
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu';
import { Sheet, SheetContent, SheetTrigger } from '@/components/ui/sheet';
import { Button } from '@/components/ui/button';
import { Avatar, AvatarFallback, AvatarImage } from '@/components/ui/avatar';
import { Users, LayoutDashboard, Search, Folder, Upload, Menu, CreditCard } from 'lucide-react';
import { PlaceHolderImages } from '@/lib/placeholder-images';
import { Input } from './ui/input';
import { Logo } from './icons';
import { cn } from '@/lib/utils';
import { ThemeSwitcher } from './theme-switcher';

type AppHeaderProps = {
  searchQuery: string;
  onSearchChange: (query: string) => void;
};

export function AppHeader({ searchQuery, onSearchChange }: AppHeaderProps) {
  const userAvatar = PlaceHolderImages.find(img => img.id === 'user1');
  const pathname = usePathname();
  const router = useRouter();

  const showHamburger = process.env.NEXT_PUBLIC_SHOW_MOBILE_BURGER_MENU === 'true';

  const navItems = [
    { href: '/', name: 'Recordings', icon: LayoutDashboard },
    { href: '/contacts', name: 'Contacts', icon: Users },
    { href: '/files', name: 'Files', icon: Folder },
    { href: '/upload', name: 'Upload', icon: Upload },
    { href: '/pricing', name: 'Pricing', icon: CreditCard },
  ];

  const handleSettingsClick = () => {
    router.push('/settings');
  };

  const getSearchPlaceholder = () => {
    if (pathname === '/contacts') {
      return 'Search contacts...';
    }
    return 'Search recordings...';
  }

  const isSearchablePage = ['/', '/contacts'].includes(pathname);

  return (
    <header className="sticky top-0 z-30 flex h-16 items-center gap-4 border-b bg-background px-4 md:px-6">
       <Link href="/" className="flex items-center gap-2 text-lg font-semibold md:text-base mr-4">
          <Logo className="h-6 w-6 text-primary" />
          <span className="sr-only">CallOrganizer</span>
        </Link>
      
      <nav className="hidden flex-col gap-6 text-lg font-medium md:flex md:flex-row md:items-center md:gap-5 md:text-sm lg:gap-6">
        {navItems.map((item) => (
          <Link
            key={item.href}
            href={item.href}
            className={cn(
                "flex items-center gap-2 text-muted-foreground transition-colors hover:text-foreground",
                pathname === item.href && "text-foreground"
            )}
            >
            <item.icon className="h-4 w-4" />
            {item.name}
          </Link>
        ))}
      </nav>

        {showHamburger && (
            <Sheet>
                <SheetTrigger asChild>
                    <Button variant="outline" size="icon" className="shrink-0 md:hidden">
                        <Menu className="h-5 w-5" />
                        <span className="sr-only">Toggle navigation menu</span>
                    </Button>
                </SheetTrigger>
                <SheetContent side="left">
                    <nav className="grid gap-6 text-lg font-medium">
                        <Link href="/" className="flex items-center gap-2 text-lg font-semibold mb-4">
                            <Logo className="h-6 w-6 text-primary" />
                            <span className="sr-only">CallOrganizer</span>
                        </Link>
                        {navItems.map((item) => (
                            <Link
                                key={item.href}
                                href={item.href}
                                className={cn(
                                    "flex items-center gap-4 text-muted-foreground hover:text-foreground",
                                    pathname === item.href && "text-foreground"
                                )}
                            >
                                <item.icon className="h-5 w-5" />
                                {item.name}
                            </Link>
                        ))}
                    </nav>
                </SheetContent>
            </Sheet>
        )}


      <div className="flex w-full items-center gap-4 md:ml-auto md:gap-2 lg:gap-4">
        {isSearchablePage && (
          <div className="relative ml-auto flex-1 md:grow-0">
              <Search className="absolute left-2.5 top-2.5 h-4 w-4 text-muted-foreground" />
              <Input
                  type="search"
                  placeholder={getSearchPlaceholder()}
                  className="w-full rounded-lg bg-background pl-8 md:w-[200px] lg:w-[320px]"
                  value={searchQuery}
                  onChange={(e) => onSearchChange(e.target.value)}
              />
          </div>
        )}
         <div className={cn(!isSearchablePage && "ml-auto")}>
            <ThemeSwitcher />
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
            <DropdownMenuItem onSelect={handleSettingsClick}>Settings</DropdownMenuItem>
            <DropdownMenuItem>Support</DropdownMenuItem>
            <DropdownMenuSeparator />
            <DropdownMenuItem>Logout</DropdownMenuItem>
          </DropdownMenuContent>
        </DropdownMenu>
      </div>
    </header>
  );
}
