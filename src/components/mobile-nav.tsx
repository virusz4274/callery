"use client"

import React, { useState, useTransition, useEffect } from 'react';
import Link from "next/link"
import { usePathname, useRouter, useSearchParams } from "next/navigation"
import { cn } from "@/lib/utils"
import { useUser } from "@/lib/firebase/provider";
import { useUserProfile } from "@/hooks/firebase/use-user-profile";
import { navigationConfig } from '@/config/navigation';
import { LogIn, ArrowLeft } from 'lucide-react';

export function MobileNav() {
  const pathname = usePathname()
  const router = useRouter();
  const searchParams = useSearchParams();
  const { user } = useUser();
  const { userProfile } = useUserProfile(user);
  const [, startTransition] = useTransition();
  const [isCapacitor, setIsCapacitor] = useState(false);

  // Detect if running in Capacitor (Android app)
  useEffect(() => {
    async function checkCapacitor() {
      try {
        const { isCapacitorApp } = await import('@/lib/capacitor');
        setIsCapacitor(isCapacitorApp());
      } catch {
        setIsCapacitor(false);
      }
    }
    checkCapacitor();
  }, []);



  let navItems = [];

  if (pathname.startsWith('/admin')) {
    // Admin View - Limit to first 4 admin items + App button
    navItems = [
      ...navigationConfig.admin.slice(0, 4),
      { href: "/", name: "App", icon: ArrowLeft }
    ];
  } else if (user) {
    // Logged In User View (Bottom Bar handles main items)
    // We typically want limited items on the bottom bar for mobile
    // Let's use the main navigation items, but maybe limit to 4-5
    navItems = [...navigationConfig.main];

    // Add Android-specific navigation when running in Capacitor
    if (isCapacitor) {
      navItems.push(...navigationConfig.android);
    }

    if (userProfile?.role === 'admin') {
      // Append Admin link
      navItems.push(navigationConfig.adminLink);
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
  const displayItems = navItems.slice(0, 5);

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

        </nav>
      </div>
    </>
  )
}
