
"use client";
import { useToast } from '@/components/toast-provider';
import React, { useState, useEffect, useTransition } from 'react';
import { usePathname, useRouter, useSearchParams } from 'next/navigation';
import { AppHeader } from '@/components/app-header';
import { MobileNav } from './mobile-nav';
import { useIsMobile } from '@/hooks/use-mobile';
import { ClientOnly } from './client-only';
import { EmailVerificationAlert } from './email-verification-alert';
import { useUser, useAuth } from '@/lib/firebase/provider';
import { useUserProfile } from '@/hooks/firebase/use-user-profile';
import { signOut, sendEmailVerification } from 'firebase/auth';
import { Spinner } from '@heroui/react';
import { AnnouncementBanner } from '@/components/announcement-banner';
import { BillingAlert } from '@/components/billing-alert';

import { SystemSettingsResponse } from '@/lib/db/types';

type AppLayoutProps = {
  children: React.ReactNode;
  systemSettings?: SystemSettingsResponse;
};

export function AppLayout({ children, systemSettings }: AppLayoutProps) {
  const { toast } = useToast();

  const router = useRouter();
  const pathname = usePathname();
  const searchParams = useSearchParams();
  const [, startTransition] = useTransition();
  const isMobile = useIsMobile();

  // Data fetching and auth logic is now in the layout container
  const { user, isUserLoading } = useUser();
  const { userProfile, isProfileLoading } = useUserProfile(user);
  const auth = useAuth();

  // Maintenance Mode Check
  useEffect(() => {
    if (systemSettings?.maintenanceMode) {
      if (pathname === '/maintenance' || pathname?.startsWith('/login') || pathname?.startsWith('/api')) {
        return;
      }

      // If loading, wait
      if (isUserLoading || isProfileLoading) return;

      // If user is admin, allow access
      if (userProfile?.role === 'admin') {
        return;
      }

      // Otherwise redirect to maintenance
      router.replace('/maintenance');
    } else {
      // If maintenance is OFF, but we are on /maintenance page, go home
      if (pathname === '/maintenance') {
        router.replace('/');
      }
    }
  }, [systemSettings, pathname, isUserLoading, isProfileLoading, userProfile, router]);

  // State for search query
  const [searchQuery, setSearchQuery] = useState(searchParams.get('q') || '');
  const showHamburger = process.env.NEXT_PUBLIC_SHOW_MOBILE_BURGER_MENU === 'true';

  // Effect to update URL when searchQuery changes
  useEffect(() => {
    const params = new URLSearchParams(window.location.search);
    if (searchQuery) {
      params.set('q', searchQuery);
    } else {
      params.delete('q');
    }

    const newPath = `${pathname}?${params.toString()}`;

    startTransition(() => {
      router.replace(newPath, { scroll: false });
    });
  }, [searchQuery, pathname, router]);

  // Effect to clear search when navigating to a new page
  useEffect(() => {
    setSearchQuery('');
  }, [pathname]);

  const handleLogout = async () => {
    try {
      // Clear session cookie on server
      await fetch('/api/auth/logout', { method: 'POST' });
      await signOut(auth);
      router.push('/');
    } catch (error) {
      console.error("Error signing out: ", error);
      toast({ title: 'Error', description: 'Failed to sign out. Please try again.', status: 'danger' });
    }
  };

  const handleResendVerification = async () => {
    if (!user) return;
    try {
      await sendEmailVerification(user);
      toast({ title: 'Verification Email Sent', description: 'Please check your inbox for the verification link.', status: 'success' });
    } catch (error: unknown) {
      toast({ title: 'Error', description: (error as Error).message || 'Failed to send verification email. Please try again.', status: 'danger' });
    }
  };

  if (isUserLoading || (user && isProfileLoading)) {
    return (
      <div className="flex h-screen items-center justify-center">
        <Spinner size="lg" color="current" className="text-primary" />
      </div>
    )
  }

  return (
    <div className="flex min-h-screen w-full flex-col bg-background">
      <AppHeader
        user={user}
        userProfile={userProfile}
        searchQuery={searchQuery}
        onSearchChange={setSearchQuery}
        onLogout={handleLogout}
      />


      <main className="flex flex-1 flex-col gap-4 p-4 md:gap-8 md:p-6 pb-24 md:pb-6">
        <EmailVerificationAlert
          user={user}
          onResend={handleResendVerification}
        />
        <BillingAlert userProfile={userProfile} />
        <AnnouncementBanner />
        {children}
      </main>
      <ClientOnly>
        {isMobile && !showHamburger && <MobileNav />}
      </ClientOnly>
    </div>
  );
}
