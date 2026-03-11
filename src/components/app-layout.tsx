
"use client";
import { useToast } from '@/components/toast-provider';
import React, { useCallback, useEffect, useState, useTransition } from 'react';
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
import { InstallPwaPrompt } from '@/components/pwa/install-prompt';

type AppLayoutProps = {
  children: React.ReactNode;
};

const MAINTENANCE_ALLOWED_PATHS = new Set(['/login', '/maintenance']);

export function AppLayout({ children }: AppLayoutProps) {
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
  const [maintenanceMode, setMaintenanceMode] = useState(false);

  useEffect(() => {
    let isMounted = true;

    async function loadPublicSettings() {
      try {
        const response = await fetch('/api/system-settings/public', {
          cache: 'no-store',
        });

        if (!response.ok) {
          throw new Error(`Failed to load public system settings: ${response.status}`);
        }

        const data = (await response.json()) as { maintenanceMode?: boolean };
        if (isMounted) {
          setMaintenanceMode(Boolean(data.maintenanceMode));
        }
      } catch (error) {
        console.error('Failed to load public system settings:', error);
      }
    }

    void loadPublicSettings();

    return () => {
      isMounted = false;
    };
  }, []);

  // Maintenance Mode Check
  useEffect(() => {
    if (maintenanceMode) {
      if (MAINTENANCE_ALLOWED_PATHS.has(pathname)) {
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
  }, [maintenanceMode, pathname, isUserLoading, isProfileLoading, userProfile, router]);

  const searchQuery = searchParams.get('q') || '';
  const showHamburger = process.env.NEXT_PUBLIC_SHOW_MOBILE_BURGER_MENU === 'true';

  const handleSearchChange = useCallback((value: string) => {
    const params = new URLSearchParams(searchParams.toString());
    if (value) {
      params.set('q', value);
    } else {
      params.delete('q');
    }
    const queryString = params.toString();
    const newPath = queryString ? `${pathname}?${queryString}` : pathname;

    startTransition(() => {
      router.replace(newPath, { scroll: false });
    });
  }, [pathname, router, searchParams]);

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
    <div className="flex min-h-dvh w-full flex-col bg-background">
      <AppHeader
        user={user}
        userProfile={userProfile}
        searchQuery={searchQuery}
        onSearchChange={handleSearchChange}
        onLogout={handleLogout}
      />


      <main className="flex flex-1 flex-col gap-3 px-3 py-3 md:gap-8 md:px-6 md:py-6 pb-[calc(5rem+env(safe-area-inset-bottom))] md:pb-6">
        <EmailVerificationAlert
          user={user}
          onResend={handleResendVerification}
        />
        <BillingAlert userProfile={userProfile} />
        <AnnouncementBanner />
        {children}
      </main>
      <ClientOnly>
        <InstallPwaPrompt />
        {isMobile && !showHamburger && <MobileNav />}
      </ClientOnly>
    </div>
  );
}
