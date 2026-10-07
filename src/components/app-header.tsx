"use client";

import { ActionLink } from '@/components/action-link';
import Link from 'next/link';
import { Logo } from './icons';
import { ThemeSwitcher } from './theme-switcher';
import { NotificationCenter } from './notifications/notification-center';
import { UserDropdown } from './navigation/user-dropdown';
import { MainNav } from './navigation/main-nav';
import { MobileMenu } from './navigation/mobile-menu';
import type { AppUser as User } from '@/lib/auth/types';
import type { User as UserProfile } from '@/lib/types';
import { publicEnv } from '@/lib/public-env';
import { usePathname } from 'next/navigation';
import { navigationConfig } from '@/config/navigation';
import { ChevronRight } from 'lucide-react';

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
  const pathname = usePathname();
  const currentPage = [...navigationConfig.main, { href: '/settings', name: 'Settings' }]
    .find((item) => pathname === item.href || pathname.startsWith(`${item.href}/`))?.name || 'Workspace';

  return (
    <header className="sticky top-0 z-40 w-full border-b border-border bg-surface/95 backdrop-blur-md pt-[env(safe-area-inset-top)]">
      <div className="mx-auto flex h-16 w-full min-w-0 items-center gap-2 px-3 md:px-8">

        {/* Mobile Menu - Only show if burger menu is enabled */}
        {showHamburger && (
          <MobileMenu
            user={user}
            userProfile={userProfile}
          />
        )}

        {/* Logo */}
        <div className={`flex shrink-0 md:mr-4 ${compact ? 'md:hidden' : ''}`}>
          <Link href="/" className="flex items-center gap-2">
            <Logo className="h-8 w-8 shrink-0" />
            <span className={`${showHamburger ? 'hidden md:inline' : 'hidden min-[360px]:inline'} text-lg font-semibold tracking-tight`}>Callery</span>
          </Link>
        </div>

        {/* Desktop Navigation */}
        {showPrimaryNav && <MainNav userProfile={userProfile} loggedIn={!!user} />}
        {compact && (
          <div className="hidden items-center gap-2 text-sm md:flex" aria-label="Current location">
            <span className="text-muted">Workspace</span>
            <ChevronRight className="size-3.5 text-muted" aria-hidden="true" />
            <span className="font-medium">{currentPage}</span>
          </div>
        )}

        <div className="flex min-w-0 flex-1 items-center justify-end gap-2 md:gap-4">
          <ThemeSwitcher />

          {user && <NotificationCenter />}

          {user ? (
            <UserDropdown user={user} userProfile={userProfile} onLogout={onLogout} />
          ) : (
            <div className="flex items-center gap-2">
              <Link href="/login" className="hidden sm:flex text-sm font-medium text-foreground hover:text-primary transition-colors px-4 py-2">
                Login
              </Link>
              <ActionLink href="/signup" size="sm" variant="primary" className="px-6 font-semibold">
                  Sign Up
                </ActionLink>
            </div>
          )}
        </div>
      </div>
    </header>
  );
}
