
"use client";
import { useToast } from '@/components/toast-provider';
import React, { useEffect, useState } from 'react';
import { usePathname, useRouter, useSearchParams } from 'next/navigation';
import { AppHeader } from '@/components/app-header';
import { MobileNav } from './mobile-nav';
import { useIsMobile } from '@/hooks/use-mobile';
import { ClientOnly } from './client-only';
import { useUser, useAuth } from '@/lib/firebase/provider';
import { useUserProfile } from '@/hooks/firebase/use-user-profile';
import { signOut, sendEmailVerification } from 'firebase/auth';
import { Spinner } from '@heroui/react';
import { InstallPwaPrompt } from '@/components/pwa/install-prompt';
import { PublicHeader } from '@/components/public-header';
import { ProductSidebar } from '@/components/navigation/product-sidebar';
import { WorkspaceStatusRail } from '@/components/workspace-status-rail';
import { clearPrivatePwaCaches } from '@/lib/pwa-cache';
import { signOutNativeGoogle } from '@/lib/firebase/google-sign-in';
import { buildCurrentPath, buildLoginRedirectHref } from '@/lib/auth-redirect';

type AppLayoutProps = {
  children: React.ReactNode;
};

const AUTH_PATHS = new Set(['/login', '/signup', '/forgot-password', '/reset-password']);
const MAINTENANCE_ALLOWED_PATHS = new Set(['/login', '/maintenance']);
const MINIMAL_LAYOUT_PATHS = new Set([...AUTH_PATHS, '/maintenance', '/~offline']);
const MARKETING_LAYOUT_PATHS = new Set([
  '/',
  '/pricing',
  '/support',
  '/changelog',
  '/privacy-policy',
  '/terms-of-service',
]);
const PROTECTED_PATH_PREFIXES = ['/recordings', '/upload', '/contacts', '/files', '/settings'];

export function AppLayout({ children }: AppLayoutProps) {
  const { toast } = useToast();

  const router = useRouter();
  const pathname = usePathname();
  const searchParams = useSearchParams();
  const isMobile = useIsMobile();

  // Data fetching and auth logic is now in the layout container
  const { user, isUserLoading } = useUser();
  const { userProfile, isProfileLoading } = useUserProfile(user);
  const auth = useAuth();
  const [maintenanceMode, setMaintenanceMode] = useState(false);

  useEffect(() => {
    if (isUserLoading) {
      return;
    }

    if (user && pathname === '/') {
      router.replace('/recordings');
    }
  }, [isUserLoading, pathname, router, user]);

  useEffect(() => {
    const isProtectedProductRoute = PROTECTED_PATH_PREFIXES.some(
      (prefix) => pathname === prefix || pathname.startsWith(`${prefix}/`)
    );

    if (!isUserLoading && !user && isProtectedProductRoute) {
      router.replace(buildLoginRedirectHref(buildCurrentPath(pathname, searchParams.toString())));
    }
  }, [isUserLoading, pathname, router, searchParams, user]);

  useEffect(() => {
    let isMounted = true;

    async function loadPublicSettings() {
      try {
        const response = await fetch('/api/system-settings/public', {
          cache: 'no-store',
        });

        if (!response.ok) {
          if (isMounted) {
            setMaintenanceMode(false);
          }
          return;
        }

        const data = (await response.json()) as { maintenanceMode?: boolean };
        if (isMounted) {
          setMaintenanceMode(Boolean(data.maintenanceMode));
        }
      } catch (error) {
        void error;
        if (isMounted) {
          setMaintenanceMode(false);
        }
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

  const showHamburger = process.env.NEXT_PUBLIC_SHOW_MOBILE_BURGER_MENU === 'true';
  const isMinimalLayoutRoute = MINIMAL_LAYOUT_PATHS.has(pathname);
  const isMarketingLayoutRoute = MARKETING_LAYOUT_PATHS.has(pathname);
  const isProtectedProductRoute = PROTECTED_PATH_PREFIXES.some(
    (prefix) => pathname === prefix || pathname.startsWith(`${prefix}/`)
  );
  const showProductChrome = Boolean(user) && !isMinimalLayoutRoute;
  const showPublicHeader = !user && !isMinimalLayoutRoute;
  const showAppHeader = Boolean(user) && !isMinimalLayoutRoute;
  const showDesktopSidebar = showProductChrome && !pathname.startsWith('/admin');
  const showBottomNav = showProductChrome && isMobile && !showHamburger && !pathname.startsWith('/admin');
  const showInstallPrompt = showProductChrome && !pathname.startsWith('/admin');
  const mainClassName = isMinimalLayoutRoute || isMarketingLayoutRoute
    ? 'flex flex-1 flex-col'
    : `flex flex-1 flex-col gap-3 px-3 py-3 md:gap-8 md:px-6 md:py-6 ${
        showBottomNav
          ? 'pb-[calc(5rem+env(safe-area-inset-bottom))] md:pb-6'
          : 'pb-6'
      }`;
  const desktopProductMainClassName = `flex flex-1 flex-col gap-3 px-3 py-3 md:gap-8 md:px-8 md:py-6 ${
    showBottomNav
      ? 'pb-[calc(5rem+env(safe-area-inset-bottom))] md:pb-6'
      : 'pb-6'
  }`;

  const handleLogout = async () => {
    try {
      // Clear session cookie on server
      await fetch('/api/auth/logout', { method: 'POST' });
      await signOutNativeGoogle(user);
      await signOut(auth);
      await clearPrivatePwaCaches();
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

  if (user && pathname === '/') {
    return (
      <div className="flex h-screen items-center justify-center">
        <Spinner size="lg" color="current" className="text-primary" />
      </div>
    );
  }

  if (!isUserLoading && !user && isProtectedProductRoute) {
    return (
      <div className="flex min-h-dvh w-full flex-col bg-background">
        <PublicHeader />
        <main className="flex flex-1 items-center justify-center px-4 py-12">
          <Spinner size="lg" color="current" className="text-primary" />
        </main>
      </div>
    );
  }

  if (showDesktopSidebar) {
    return (
      <div className="flex min-h-dvh w-full bg-background">
        <ProductSidebar userProfile={userProfile} />
        <div className="flex min-h-dvh flex-1 flex-col">
          {showAppHeader && (
            <AppHeader
              user={user}
              userProfile={userProfile}
              onLogout={handleLogout}
              showPrimaryNav={false}
              compact
            />
          )}
          <main className={desktopProductMainClassName}>
            {showProductChrome && (
              <WorkspaceStatusRail
                user={user}
                userProfile={userProfile}
                onResendVerification={handleResendVerification}
              />
            )}
            {children}
          </main>
        </div>
        <ClientOnly>
          {showInstallPrompt && <InstallPwaPrompt />}
          {showBottomNav && <MobileNav />}
        </ClientOnly>
      </div>
    );
  }

  return (
    <div className="flex min-h-dvh w-full flex-col bg-background">
      {showPublicHeader && <PublicHeader />}

      {showAppHeader && (
        <AppHeader
          user={user}
          userProfile={userProfile}
          onLogout={handleLogout}
        />
      )}

      <main className={mainClassName}>
        {showProductChrome && (
          <WorkspaceStatusRail
            user={user}
            userProfile={userProfile}
            onResendVerification={handleResendVerification}
          />
        )}
        {children}
      </main>
      <ClientOnly>
        {showInstallPrompt && <InstallPwaPrompt />}
        {showBottomNav && <MobileNav />}
      </ClientOnly>
    </div>
  );
}
