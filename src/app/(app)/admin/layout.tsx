'use client';

import React, { Suspense } from 'react';
import { useUser } from '@/lib/auth/client';
import { useUserProfile } from '@/hooks/use-user-profile';
import { useRouter, usePathname } from 'next/navigation';
import { Card } from '@/components/ui-primitives';
import Link from 'next/link';
import {
  LayoutDashboard,
  Users,
  Settings,
  CreditCard,
  Megaphone,
  ShieldCheck,
  ScrollText,
} from 'lucide-react';
import { Button, Chip } from '@heroui/react';
import { AdminLoadingState } from '@/components/loading-shells';

function AdminLayoutContent({ children }: { children: React.ReactNode }) {
  const { user, isUserLoading } = useUser();
  const { userProfile, isProfileLoading } = useUserProfile(user);
  const router = useRouter();
  const pathname = usePathname();

  React.useEffect(() => {
    // If user loading is finished and there's no user, redirect to login.
    if (!isUserLoading && !user) {
      router.replace('/login');
    }

    // If profile loading is finished and the user is not an admin, redirect home.
    if (!isProfileLoading && userProfile && userProfile.role !== 'admin') {
      router.replace('/');
    }
  }, [user, isUserLoading, userProfile, isProfileLoading, router]);

  const isLoading = isUserLoading || isProfileLoading;

  if (isLoading) {
    return <AdminLoadingState />;
  }

  // If user is logged in and is an admin, show the content with Layout.
    if (user && userProfile?.role === 'admin') {
      const navItems = [
        { name: 'Dashboard', href: '/admin', icon: LayoutDashboard },
        { name: 'Users', href: '/admin/users', icon: Users },
        { name: 'Plans', href: '/admin/plans', icon: CreditCard },
        { name: 'Audit', href: '/admin/audit', icon: ScrollText },
        { name: 'Announcements', href: '/admin/announcements', icon: Megaphone },
        { name: 'Settings', href: '/admin/settings', icon: Settings },
      ];

      return (
      <div className="relative min-h-[calc(100vh-8rem)]">
        <div className="pointer-events-none absolute inset-x-0 top-0 -z-10 h-[560px] bg-[radial-gradient(circle_at_top_left,rgba(38,132,255,0.12),transparent_32%),radial-gradient(circle_at_top_right,rgba(13,148,136,0.10),transparent_28%)]" />

        <div className="space-y-6">
          <section className="overflow-hidden rounded-[2rem] border border-default-200/80 bg-background/90 shadow-[0_24px_64px_-48px_rgba(15,23,42,0.45)]">
            <div className="grid gap-8 px-5 py-6 md:px-8 md:py-8 xl:grid-cols-[minmax(0,1.05fr)_320px] xl:items-start">
              <div className="space-y-4">
                <Chip variant="soft" color="accent" className="rounded-full px-3 py-1 text-xs font-medium">
                  Admin console
                </Chip>
                <div className="space-y-3">
                  <div className="flex items-center gap-3">
                    <div className="flex h-14 w-14 items-center justify-center rounded-[1.25rem] bg-accent/10 text-accent">
                      <ShieldCheck className="h-6 w-6" />
                    </div>
                    <div>
                      <h1 className="text-4xl font-black tracking-[-0.05em] text-foreground md:text-5xl">
                        Administration
                      </h1>
                    </div>
                  </div>
                  <p className="max-w-2xl text-base leading-7 text-default-600 md:text-lg">
                    Manage plans, users, announcements, system settings, and audit visibility from one controlled workspace.
                  </p>
                </div>
                <div className="flex flex-wrap items-center gap-2">
                  <Chip variant="soft" color="success">
                    Role: {userProfile.role}
                  </Chip>
                  <Chip variant="soft" color="default">
                    {navItems.length} admin sections
                  </Chip>
                </div>
              </div>

              <div className="grid gap-3">
                <Card className="rounded-[1.5rem] border border-default-200/80 bg-background/70 p-4 shadow-none">
                  <div className="space-y-2">
                    <div className="text-xs font-semibold uppercase tracking-[0.24em] text-default-400">
                      Current access
                    </div>
                    <div className="text-lg font-semibold text-foreground">
                      {userProfile.firstName || user?.email || 'Admin account'}
                    </div>
                    <p className="text-sm leading-6 text-default-500">
                      Use the navigation map to move between operational, billing, and moderation tasks without leaving admin.
                    </p>
                  </div>
                </Card>
              </div>
            </div>
          </section>

          <div className="grid gap-6 xl:grid-cols-[280px_minmax(0,1fr)] xl:items-start">
            <aside className="space-y-3 xl:sticky xl:top-6">
              <Card className="overflow-hidden rounded-[1.9rem] border border-default-200/80 bg-background/95 shadow-[0_20px_54px_-42px_rgba(15,23,42,0.45)]">
                <Card.Header className="flex flex-col items-start gap-1 border-b border-default-100/70 px-5 py-5">
                  <div className="text-xs font-semibold uppercase tracking-[0.24em] text-default-400">Admin map</div>
                  <div className="text-xl font-bold tracking-[-0.03em] text-foreground">Navigation</div>
                  <p className="text-sm leading-6 text-default-500">
                    Switch between management surfaces without losing context.
                  </p>
                </Card.Header>
                <Card.Content className="space-y-2 p-3">
                  {navItems.map((item) => {
                    const isActive = pathname === item.href || (item.href !== '/admin' && pathname.startsWith(item.href));
                    return (
                      <Link key={item.href} href={item.href} className="w-full">
                        <Button
                          variant={isActive ? 'secondary' : 'ghost'}
                          className={`w-full justify-start gap-3 rounded-[1.2rem] px-4 py-6 ${
                            isActive ? 'font-semibold shadow-[0_20px_44px_-36px_rgba(38,132,255,0.45)]' : 'text-default-600'
                          }`}
                        >
                          <item.icon size={18} />
                          {item.name}
                        </Button>
                      </Link>
                    );
                  })}
                </Card.Content>
              </Card>
            </aside>

            <main className="min-w-0 py-1">
              {children}
            </main>
          </div>
        </div>
      </div>
      );
    }

  if (user && userProfile && userProfile.role !== 'admin') {
    return null; // Redirecting
  }

  // Fallback for edge cases
  return (
    <div className="flex h-[calc(100vh-8rem)] items-center justify-center">
      <Card className="w-full max-w-md">
        <Card.Header className="justify-center">
          <h3 className="text-xl font-semibold text-center">Access Denied</h3>
        </Card.Header>
        <Card.Content>
          <p className="text-center text-muted-foreground">
            You do not have permission to view this page. Redirecting...
          </p>
        </Card.Content>
      </Card>
    </div>
  );
}

export default function AdminLayout({ children }: { children: React.ReactNode }) {
  return (
    <Suspense>
      <AdminLayoutContent>{children}</AdminLayoutContent>
    </Suspense>
  );
}
