"use client";

import React from 'react';
import Link from 'next/link';
import { usePathname } from 'next/navigation';
import { Button, Input } from "@heroui/react";
import { Search } from 'lucide-react';
import { Logo } from './icons';
import { ThemeSwitcher } from './theme-switcher';
import { UserDropdown } from './navigation/user-dropdown';
import { MainNav } from './navigation/main-nav';
import { MobileMenu } from './navigation/mobile-menu';
import type { User } from 'firebase/auth';
import type { User as UserProfile } from '@/lib/types';

type AppHeaderProps = {
  user: User | null;
  userProfile: UserProfile | null;
  searchQuery: string;
  onSearchChange: (query: string) => void;
  onLogout: () => void;
};

export function AppHeader({ user, userProfile, searchQuery, onSearchChange, onLogout }: AppHeaderProps) {
  const pathname = usePathname();

  const getSearchPlaceholder = () => {
    if (pathname === '/contacts') {
      return 'Search contacts...';
    }
    return 'Search recordings...';
  }

  const isSearchablePage = ['/', '/contacts'].includes(pathname);

  return (
    <header className="sticky top-0 z-40 w-full border-b border-default-200/50 bg-background/70 backdrop-blur-xl supports-[backdrop-filter]:bg-background/60">
      <div className="w-full max-w-full mx-auto flex h-16 items-center px-4 md:px-6">

        {/* Mobile Menu */}
        <MobileMenu
          user={user}
          userProfile={userProfile}
          searchQuery={searchQuery}
          onSearchChange={onSearchChange}
          isSearchablePage={isSearchablePage}
          getSearchPlaceholder={getSearchPlaceholder}
        />

        {/* Logo */}
        <div className="mr-4 flex">
          <Link href="/" className="flex items-center gap-2">
            <Logo className="h-8 w-8 text-primary" />
            <span className="font-bold text-xl tracking-tight hidden xs:block">VoSift</span>
          </Link>
        </div>

        {/* Desktop Navigation */}
        <MainNav userProfile={userProfile} loggedIn={!!user} />

        <div className="flex flex-1 items-center justify-end gap-2 md:gap-4">
          {/* Search Bar - Desktop */}
          {user && isSearchablePage && (
            <div className="hidden lg:flex w-full max-w-[240px]">
              <div className="relative w-full">
                <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-default-400 z-10" />
                <Input
                  className="h-9 w-full text-small font-normal text-default-500 bg-default-100 dark:bg-default-50/10 shadow-none border-none focus:ring-2 focus:ring-primary rounded-md px-9"
                  placeholder={getSearchPlaceholder()}
                  type="search"
                  value={searchQuery}
                  onChange={(e) => onSearchChange(e.target.value)}
                  aria-label="Search"
                />
              </div>
            </div>
          )}

          <ThemeSwitcher />

          {user ? (
            <UserDropdown user={user} userProfile={userProfile} onLogout={onLogout} />
          ) : (
            <div className="flex items-center gap-2">
              <Link href="/login" className="hidden sm:flex text-sm font-medium text-foreground hover:text-primary transition-colors px-4 py-2">
                Login
              </Link>
              <Link href="/signup">
                <Button color="primary" size="sm" className="font-medium rounded-full px-6">
                  Sign Up
                </Button>
              </Link>
            </div>
          )}
        </div>
      </div>
    </header>
  );
}
