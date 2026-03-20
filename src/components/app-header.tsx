"use client";

import React from 'react';
import Link from 'next/link';
import { Button } from "@heroui/react";
import { Logo } from './icons';
import { ThemeSwitcher } from './theme-switcher';
import { NotificationCenter } from './notifications/notification-center';
import { UserDropdown } from './navigation/user-dropdown';
import { MainNav } from './navigation/main-nav';
import { MobileMenu } from './navigation/mobile-menu';
import type { User } from 'firebase/auth';
import type { User as UserProfile } from '@/lib/types';
import { publicEnv } from '@/lib/public-env';

type AppHeaderProps = {
  user: User | null;
  userProfile: UserProfile | null;
  onLogout: () => void;
  showPrimaryNav?: boolean;
  compact?: boolean;
};

export function AppHeader({
  user,
  userProfile,
  onLogout,
  showPrimaryNav = true,
  compact = false,
}: AppHeaderProps) {
  const showHamburger = publicEnv.NEXT_PUBLIC_SHOW_MOBILE_BURGER_MENU;

  return (
    <header className="sticky top-0 z-40 w-full border-b border-default-200/50 bg-background/70 backdrop-blur-xl supports-[backdrop-filter]:bg-background/60 pt-[env(safe-area-inset-top)]">
      <div className={`w-full max-w-full mx-auto flex items-center px-4 md:px-6 ${compact ? 'h-14' : 'h-16'}`}>

        {/* Mobile Menu - Only show if burger menu is enabled */}
        {showHamburger && (
          <MobileMenu
            user={user}
            userProfile={userProfile}
          />
        )}

        {/* Logo */}
        <div className="mr-4 flex">
          <Link href="/" className="flex items-center gap-2">
            <Logo className="h-8 w-8 text-primary" />
            <span className="font-bold text-xl tracking-tight hidden xs:block">Callery</span>
          </Link>
        </div>

        {/* Desktop Navigation */}
        {showPrimaryNav && <MainNav userProfile={userProfile} loggedIn={!!user} />}

        <div className="flex flex-1 items-center justify-end gap-2 md:gap-4">
          <ThemeSwitcher />

          {user && <NotificationCenter />}

          {user ? (
            <UserDropdown user={user} userProfile={userProfile} onLogout={onLogout} />
          ) : (
            <div className="flex items-center gap-2">
              <Link href="/login" className="hidden sm:flex text-sm font-medium text-foreground hover:text-primary transition-colors px-4 py-2">
                Login
              </Link>
              <Link href="/signup">
                <Button size="sm" className="font-medium rounded-full px-6 bg-primary text-white">
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
