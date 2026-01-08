'use client';

import React, { Suspense } from 'react';
import { useUser } from '@/lib/firebase/provider';
import { useUserProfile } from '@/hooks/firebase/use-user-profile';
import { useRouter, usePathname } from 'next/navigation';
import { Spinner, Card, Button } from '@heroui/react';
import Link from 'next/link';
import {
  LayoutDashboard,
  Users,
  Settings,
  CreditCard,
  Megaphone // Added
} from 'lucide-react';

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
    return (
      <div className="flex flex-col h-[calc(100vh-8rem)] items-center justify-center gap-4">
        <Spinner size="lg" color="current" className="text-primary" />
        <p className="text-default-500 font-medium">Loading Admin Section...</p>
      </div>
    );
  }

  // If user is logged in and is an admin, show the content with Layout.
  if (user && userProfile?.role === 'admin') {
    const navItems = [
      { name: 'Dashboard', href: '/admin', icon: LayoutDashboard },
      { name: 'Users', href: '/admin/users', icon: Users },
      { name: 'Plans', href: '/admin/plans', icon: CreditCard },
      { name: 'Announcements', href: '/admin/announcements', icon: Megaphone },
      { name: 'Settings', href: '/admin/settings', icon: Settings },
    ];

    return (
      <div className="grid grid-cols-1 md:grid-cols-[240px_1fr] gap-6 min-h-[calc(100vh-8rem)]">
        <aside className="hidden md:flex flex-col gap-2 py-4 border-r border-default-200 pr-4">
          <div className="px-3 mb-2">
            <h3 className="font-semibold text-default-500 text-sm uppercase tracking-wider">Admin</h3>
          </div>
          {navItems.map((item) => {
            const isActive = pathname === item.href || (item.href !== '/admin' && pathname.startsWith(item.href));
            return (
              <Link key={item.href} href={item.href} className="w-full">
                <Button
                  variant={isActive ? "secondary" : "ghost"}
                  className={`w-full justify-start gap-3 ${isActive ? 'font-semibold' : 'text-default-600'}`}
                >
                  <item.icon size={18} />
                  {item.name}
                </Button>
              </Link>
            );
          })}
        </aside>
        <main className="py-4">
          {children}
        </main>
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
