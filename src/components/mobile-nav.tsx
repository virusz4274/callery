"use client"

import React, { useState, useTransition, useEffect } from 'react';
import Link from "next/link"
import { usePathname, useRouter, useSearchParams } from "next/navigation"
import { cn } from "@/lib/utils"
import { useUser } from "@/lib/firebase/provider";
import { useUserProfile } from "@/hooks/firebase/use-user-profile";
import { navigationConfig } from '@/config/navigation';
import { LogIn, Search, X, ArrowLeft } from 'lucide-react';
import { Modal, Input } from "@heroui/react";

export function MobileNav() {
  const pathname = usePathname()
  const router = useRouter();
  const searchParams = useSearchParams();
  const { user } = useUser();
  const { userProfile } = useUserProfile(user);
  const [isSearchOpen, setIsSearchOpen] = useState(false);
  const [searchQuery, setSearchQuery] = useState(searchParams.get('q') || '');
  const [, startTransition] = useTransition();

  // Update local search state when URL changes
  useEffect(() => {
    setSearchQuery(searchParams.get('q') || '');
  }, [searchParams]);

  const handleSearch = (value: string) => {
    setSearchQuery(value);

    const params = new URLSearchParams(window.location.search);
    if (value) {
      params.set('q', value);
    } else {
      params.delete('q');
    }

    // If we are not on the dashboard or contacts page, navigate to dashboard
    let targetPath = pathname;
    if (!['/', '/contacts'].includes(pathname)) {
      targetPath = '/';
    }

    startTransition(() => {
      router.replace(`${targetPath}?${params.toString()}`);
    });
  };

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

          {/* Add Search Button for Logged In Users */}
          {user && !pathname.startsWith('/admin') && (
            <button
              onClick={() => setIsSearchOpen(true)}
              className="flex flex-col items-center gap-1.5 rounded-xl p-2 min-w-[64px] transition-all duration-200 text-default-500 hover:text-foreground hover:bg-default-100/50"
            >
              <Search className="h-5 w-5" />
              <span className="text-[10px] font-medium text-center leading-none">Search</span>
            </button>
          )}

          {user && !pathname.startsWith('/admin') && isSearchOpen && (
            <Modal isOpen={isSearchOpen} onOpenChange={setIsSearchOpen}>
              <Modal.Backdrop className="bg-background/20 backdrop-blur-sm">
                <Modal.Container placement="top">
                  <Modal.Dialog className="m-0 max-w-full rounded-none rounded-b-2xl shadow-lg bg-background/95 backdrop-blur-xl border-b border-default-100">
                    <Modal.Body className="p-4">
                      <div className="flex items-center gap-2 w-full">
                        <Search className="w-5 h-5 text-default-400" />
                        <input
                          autoFocus
                          type="search"
                          placeholder="Search recordings..."
                          className="flex-1 bg-transparent border-none outline-none text-base h-10 placeholder:text-default-400"
                          value={searchQuery}
                          onChange={(e) => handleSearch(e.target.value)}
                        />
                        <button onClick={() => setIsSearchOpen(false)} className="p-2 -mr-2 text-default-500">
                          <X className="w-5 h-5" />
                        </button>
                      </div>
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
