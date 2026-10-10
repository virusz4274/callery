'use client';

import { ActionLink } from '@/components/action-link';
import React, { Suspense } from 'react';
import { useUser } from '@/lib/auth/client';
import { useUserProfile } from '@/hooks/use-user-profile';
import { useRouter, usePathname } from 'next/navigation';
import {
  LayoutDashboard,
  Users,
  Settings,
  CreditCard,
  Megaphone,
  ShieldCheck,
  ScrollText,
} from 'lucide-react';
import { Card, Label, ListBox, Select } from '@heroui/react';
import { AdminLoadingState } from '@/components/loading-shells';
import { useTeamPolicy } from '@/hooks/use-team-policy';

function AdminLayoutContent({ children }: { children: React.ReactNode }) {
  const { user, isUserLoading } = useUser();
  const { userProfile, isProfileLoading } = useUserProfile(user);
  const router = useRouter();
  const pathname = usePathname();
  const team = useTeamPolicy();

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
        { name: team ? 'Employees' : 'Users', href: '/admin/users', icon: Users },
        ...(team ? [{ name: 'Company recordings', href: '/admin/recordings', icon: ScrollText }] : [{ name: 'Plans', href: '/admin/plans', icon: CreditCard }]),
        { name: 'Audit', href: '/admin/audit', icon: ScrollText },
        { name: 'Announcements', href: '/admin/announcements', icon: Megaphone },
        { name: 'Settings', href: '/admin/settings', icon: Settings },
      ];

      const selectedSection = navItems.find(item => item.href === pathname || (item.href !== '/admin' && pathname.startsWith(`${item.href}/`)))?.href || '/admin';
      return (
        <div className="mx-auto w-full max-w-[1600px] min-w-0 xl:grid xl:grid-cols-[224px_minmax(0,1fr)] xl:items-start xl:gap-6">
          <aside className="hidden xl:sticky xl:top-6 xl:block">
            <Card className="gap-3 p-3">
              <div className="flex items-center gap-2 px-3 py-2 font-semibold"><ShieldCheck className="size-5 text-accent" />Admin console</div>
              <nav aria-label="Admin sections" className="space-y-1">
                {navItems.map(item => <ActionLink key={item.href} href={item.href} aria-current={selectedSection === item.href ? 'page' : undefined} variant={selectedSection === item.href ? 'secondary' : 'ghost'} className="min-h-11 w-full justify-start gap-3">
                  <item.icon aria-hidden="true" className="size-4 shrink-0" />{item.name}
                </ActionLink>)}
              </nav>
            </Card>
          </aside>
          <div className="min-w-0 space-y-5">
            <Select aria-label="Admin section" selectedKey={selectedSection} onSelectionChange={key => { if (key && key !== selectedSection) router.push(String(key)); }} className="w-full xl:hidden">
              <Label>Admin console</Label>
              <Select.Trigger className="min-h-11"><Select.Value /><Select.Indicator /></Select.Trigger>
              <Select.Popover><ListBox>{navItems.map(item => <ListBox.Item key={item.href} id={item.href} textValue={item.name}><span className="flex items-center gap-2"><item.icon aria-hidden="true" className="size-4 shrink-0" /><span>{item.name}</span></span></ListBox.Item>)}</ListBox></Select.Popover>
            </Select>
            <div className="min-w-0">{children}</div>
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
