"use client"

import { useState } from 'react';
import { usePathname } from "next/navigation"
import { Button, Link, Modal } from "@heroui/react";
import { cn } from "@/lib/utils"
import { useUser } from "@/lib/auth/client";
import { useUserProfile } from "@/hooks/use-user-profile";
import { navigationConfig } from '@/config/navigation';
import { Ellipsis, LogIn, ArrowLeft, ChevronRight, CircleHelp, Settings, type LucideIcon } from 'lucide-react';

type NavItem = {
  href: string;
  name: string;
  icon: LucideIcon;
  description?: string;
};

export function MobileNav() {
  const pathname = usePathname()
  const { user } = useUser();
  const { userProfile } = useUserProfile(user);
  const [isMoreOpen, setIsMoreOpen] = useState(false);

  let navItems: NavItem[] = [];
  let secondaryItems: NavItem[] = [];

  if (pathname.startsWith('/admin')) {
    // Admin View - Limit to first 4 admin items + App button
    navItems = [
      ...navigationConfig.admin.slice(0, 4),
      { href: "/", name: "App", icon: ArrowLeft }
    ];
  } else if (user) {
    navItems = [...navigationConfig.main];
    secondaryItems = [
      { href: '/settings', name: 'Settings', icon: Settings, description: 'Profile, preferences and sources' },
      { href: '/support', name: 'Help & support', icon: CircleHelp, description: 'Get help with your workspace' },
    ];

    if (userProfile?.role === 'admin') {
      secondaryItems.push({ ...navigationConfig.adminLink, description: 'Manage users, plans and system settings' });
    }
  } else {
    // Public View
    // Usually standard mobile menu handles this, but if we want a bottom bar for public:
    navItems = [
      { href: "/", name: "Home", icon: navigationConfig.main[0].icon }, // Reusing dashboard icon for Home
      ...navigationConfig.public
    ];
    // Add Login for public bottom bar
    navItems.push({ href: "/login", name: "Login", icon: LogIn });
  }

  // Limit to 5 items max for bottom bar to avoid crowding
  const displayItems = user && !pathname.startsWith('/admin') ? navItems.slice(0, 4) : navItems.slice(0, 5);
  const isMoreActive = secondaryItems.some((item) => pathname === item.href || pathname.startsWith(`${item.href}/`));

  return (
    <>
      <div data-mobile-bottom-nav className="fixed inset-x-0 bottom-0 z-50 border-t border-border bg-surface/95 backdrop-blur-md md:hidden pb-[env(safe-area-inset-bottom)]">
        <nav aria-label="Mobile workspace" className="flex items-center justify-around gap-1 px-2 py-2">
          {displayItems.map((item) => {
            const isAdminRoute = pathname.startsWith('/admin');
            let isActive = false;
            if (isAdminRoute && userProfile?.role === 'admin') {
              isActive = item.href === '/admin' ? pathname === '/admin' : pathname.startsWith(item.href);
            } else {
              isActive = pathname === item.href || pathname.startsWith(`${item.href}/`);
            }

            return (
              <Link
                key={item.name}
                href={item.href}
                aria-current={isActive ? 'page' : undefined}
                className={cn(
                  "no-underline flex flex-col items-center gap-1.5 rounded-xl p-2 min-w-0 flex-1 h-14 transition-colors",
                  isActive
                    ? "text-accent bg-accent/10"
                    : "text-muted hover:text-foreground hover:bg-surface-secondary"
                )}
              >
                <item.icon className="h-5 w-5" aria-hidden="true" />
                <span className="max-w-full break-words text-xs font-medium text-center leading-tight">{item.name}</span>
              </Link>
            )
          })}

          {user && secondaryItems.length > 0 && (
            <Modal isOpen={isMoreOpen} onOpenChange={setIsMoreOpen}>
              <Button
                variant="ghost"
                aria-haspopup="dialog"
                className={cn(
                  "flex min-w-0 flex-1 h-14 flex-col items-center gap-1.5 rounded-xl p-2 text-xs font-medium leading-none transition-colors",
                  isMoreActive || isMoreOpen
                    ? "text-accent bg-accent/10"
                    : "text-muted hover:text-foreground hover:bg-surface-secondary"
                )}
              >
                <Ellipsis className="h-5 w-5" aria-hidden="true" />
                <span className="text-xs font-medium text-center leading-none">More</span>
              </Button>
              <Modal.Backdrop>
                <Modal.Container placement="bottom" size="sm" scroll="inside" className="p-3 pb-[max(0.75rem,env(safe-area-inset-bottom))] sm:w-full sm:p-3 sm:pb-[max(0.75rem,env(safe-area-inset-bottom))]">
                  <Modal.Dialog className="p-4">
                    <Modal.CloseTrigger aria-label="Close more tools" className="size-11" />
                    <Modal.Header className="min-h-11 justify-center pr-12">
                      <Modal.Heading className="text-lg font-semibold">More tools</Modal.Heading>
                    </Modal.Header>
                    <Modal.Body>
                      <nav aria-label="More workspace tools" className="space-y-2">
                        {secondaryItems.map(item => {
                          const active = pathname === item.href || pathname.startsWith(`${item.href}/`);
                          return <Link key={item.href} href={item.href} onPress={() => setIsMoreOpen(false)}
                            aria-label={item.name} aria-current={active ? 'page' : undefined}
                            className={cn('flex min-h-16 w-full items-center gap-3 rounded-xl p-3 no-underline transition-colors',
                              active ? 'bg-accent/10 text-accent' : 'text-foreground hover:bg-surface-secondary')}>
                            <span className={cn('flex size-10 shrink-0 items-center justify-center rounded-xl', active ? 'bg-accent/10 text-accent' : 'bg-surface-secondary text-muted')}>
                              <item.icon className="size-5" aria-hidden="true" />
                            </span>
                            <span className="min-w-0 flex-1">
                              <span className="block text-base font-medium">{item.name}</span>
                              <span className="mt-0.5 block text-xs leading-5 text-muted">{item.description}</span>
                            </span>
                            <ChevronRight className="size-4 shrink-0 text-muted" aria-hidden="true" />
                          </Link>;
                        })}
                      </nav>
                    </Modal.Body>
                  </Modal.Dialog>
                </Modal.Container>
              </Modal.Backdrop>
            </Modal>
          )}
        </nav>
      </div>
    </>
  )
}
