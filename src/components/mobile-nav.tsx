"use client"

import { useState } from 'react';
import Link from "next/link"
import { usePathname } from "next/navigation"
import { Button, Modal } from "@heroui/react";
import { cn } from "@/lib/utils"
import { useUser } from "@/lib/firebase/provider";
import { useUserProfile } from "@/hooks/firebase/use-user-profile";
import { useIsCapacitor } from '@/hooks/use-is-capacitor';
import { navigationConfig } from '@/config/navigation';
import { Ellipsis, LogIn, ArrowLeft, Settings, type LucideIcon } from 'lucide-react';

type NavItem = {
  href: string;
  name: string;
  icon: LucideIcon;
};

export function MobileNav() {
  const pathname = usePathname()
  const { user } = useUser();
  const { userProfile } = useUserProfile(user);
  const isCapacitor = useIsCapacitor();
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
    if (isCapacitor) {
      navItems = [
        navigationConfig.main[0],
        navigationConfig.main[1],
        navigationConfig.android[0],
        navigationConfig.main[2],
      ];

      secondaryItems = [
        navigationConfig.main[3],
        { href: "/settings", name: "Settings", icon: Settings },
      ];
    } else {
      // Logged In User View (non-Capacitor)
      navItems = [...navigationConfig.main];
      secondaryItems.unshift({ href: "/files", name: "Files", icon: navigationConfig.main[2].icon });
      navItems = navItems.filter((item) => item.href !== '/files');
      navItems.push({ href: "/settings", name: "Settings", icon: Settings });
    }

    if (userProfile?.role === 'admin') {
      secondaryItems.push(navigationConfig.adminLink);
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
  const displayItems = user ? navItems.slice(0, 4) : navItems.slice(0, 5);
  const isMoreActive = secondaryItems.some((item) => pathname.startsWith(item.href));

  return (
    <>
      <div className="fixed inset-x-0 bottom-0 z-50 border-t bg-background/80 backdrop-blur-lg md:hidden pb-[env(safe-area-inset-bottom)]">
        <nav className="flex items-center justify-around px-2 pt-3 pb-3">
          {displayItems.map((item) => {
            const isAdminRoute = pathname.startsWith('/admin');
            let isActive = false;
            if (isAdminRoute && userProfile?.role === 'admin') {
              isActive = item.href === '/admin' ? pathname === '/admin' : pathname.startsWith(item.href);
            } else {
              isActive = pathname === item.href;
            }

            return (
              <Link
                key={item.name}
                href={item.href}
                className={cn(
                  "flex flex-col items-center gap-1.5 rounded-xl p-2 min-w-[64px] transition-all duration-200",
                  isActive
                    ? "text-primary bg-primary/10"
                    : "text-default-500 hover:text-foreground hover:bg-default-100/50"
                )}
              >
                <item.icon className={cn("h-5 w-5", isActive && "fill-current")} />
                <span className="text-[10px] font-medium text-center leading-none">{item.name}</span>
              </Link>
            )
          })}

          {user && secondaryItems.length > 0 && (
            <Button
              variant="ghost"
              onPress={() => setIsMoreOpen(true)}
              className={cn(
                "flex min-w-[64px] flex-col items-center gap-1.5 rounded-xl p-2 text-[10px] font-medium leading-none transition-all duration-200",
                isMoreActive
                  ? "text-primary bg-primary/10"
                  : "text-default-500 hover:text-foreground hover:bg-default-100/50"
              )}
            >
              <Ellipsis className="h-5 w-5" />
              <span className="text-[10px] font-medium text-center leading-none">More</span>
            </Button>
          )}
        </nav>
      </div>

      {user && secondaryItems.length > 0 && (
        <Modal isOpen={isMoreOpen} onOpenChange={setIsMoreOpen}>
          <Modal.Backdrop>
            <Modal.Container>
              <Modal.Dialog className="mx-0 mt-auto w-full max-w-full rounded-t-[1.75rem] rounded-b-none">
                <Modal.Header className="border-b border-default-100 px-5 py-4">
                  <div className="text-sm font-semibold text-foreground">More tools</div>
                </Modal.Header>
                <Modal.Body className="space-y-2 px-4 py-4">
                  {secondaryItems.map((item) => (
                    <Link
                      key={item.href}
                      href={item.href}
                      onClick={() => setIsMoreOpen(false)}
                      className={cn(
                        "flex items-center gap-3 rounded-xl border px-4 py-3 text-sm font-medium transition-colors",
                        pathname.startsWith(item.href)
                          ? "border-primary/25 bg-primary/10 text-primary"
                          : "border-default-200 text-default-700 hover:bg-default-50"
                      )}
                    >
                      <item.icon className="h-4 w-4" />
                      {item.name}
                    </Link>
                  ))}
                </Modal.Body>
              </Modal.Dialog>
            </Modal.Container>
          </Modal.Backdrop>
        </Modal>
      )}
    </>
  )
}
