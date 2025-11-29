
"use client";

import React, { useMemo } from 'react';
import Link from 'next/link';
import { usePathname } from 'next/navigation';
import { SidebarTrigger } from '@/components/ui/sidebar';
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu';
import { Button } from '@/components/ui/button';
import { Avatar, AvatarFallback, AvatarImage } from '@/components/ui/avatar';
import { ChevronRight, Users, LayoutDashboard } from 'lucide-react';
import { PlaceHolderImages } from '@/lib/placeholder-images';
import type { Contact as ContactType } from '@/lib/types';
import { useRouter } from 'next/navigation';

type AppHeaderProps = {
  allContacts: ContactType[];
};

export function AppHeader({ allContacts }: AppHeaderProps) {
  const userAvatar = PlaceHolderImages.find(img => img.id === 'user1');
  const pathname = usePathname();
  const router = useRouter();

  const breadcrumbs = useMemo(() => {
    const pathSegments = pathname.split('/').filter(Boolean);
    const crumbs = pathSegments.map((segment, index) => {
      const href = '/' + pathSegments.slice(0, index + 1).join('/');
      const name = segment.charAt(0).toUpperCase() + segment.slice(1);
      const isLast = index === pathSegments.length - 1;
      let Icon = null;
      if (name === 'Contacts') Icon = Users;

      return { href, name, isLast, Icon };
    });
    return [
      { href: '/', name: 'Dashboard', isLast: pathname === '/', Icon: LayoutDashboard },
      ...crumbs
    ];
  }, [pathname]);

  return (
    <header className="sticky top-0 z-10 flex h-16 items-center gap-4 border-b bg-background px-4 sm:px-6">
      <SidebarTrigger className="md:hidden" />

      <nav className="hidden md:flex items-center gap-2 text-sm text-muted-foreground">
        {breadcrumbs.map((crumb, index) => (
          <React.Fragment key={crumb.href}>
            {index > 0 && <ChevronRight className="h-4 w-4" />}
            <Link
              href={crumb.href}
              className={`flex items-center gap-2 ${
                crumb.isLast ? 'font-semibold text-foreground' : 'hover:text-foreground'
              }`}
            >
              {crumb.Icon && <crumb.Icon className="h-4 w-4" />}
              {crumb.name}
            </Link>
          </React.Fragment>
        ))}
      </nav>

      <div className="ml-auto flex items-center gap-4">
        {/* Global Search can be implemented here if needed */}
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
            <DropdownMenuItem>Settings</DropdownMenuItem>
            <DropdownMenuItem>Support</DropdownMenuItem>
            <DropdownMenuSeparator />
            <DropdownMenuItem>Logout</DropdownMenuItem>
          </DropdownMenuContent>
        </DropdownMenu>
      </div>
    </header>
  );
}
