"use client"

import Link from "next/link"
import { usePathname } from "next/navigation"
import { Settings, Shield, Users, LayoutDashboard, Upload, CreditCard, Megaphone } from 'lucide-react';
import { cn } from "@/lib/utils"
import { useUser } from "@/lib/firebase/provider";
import { useUserProfile } from "@/hooks/firebase/use-user-profile";

export function MobileNav() {
  const pathname = usePathname()
  const { user } = useUser();
  const { userProfile } = useUserProfile(user);

  const loggedInNavItems = [
    { href: "/", name: "Recordings", icon: LayoutDashboard },
    { href: "/contacts", name: "Contacts", icon: Users },
    { href: "/upload", name: "Upload", icon: Upload },
    { href: "/settings", name: "Settings", icon: Settings },
  ]

  if (userProfile?.role === 'admin') {
    loggedInNavItems.splice(2, 0, { href: "/admin", name: "Admin", icon: Shield });
  }

  const adminNavItems = [
    { name: 'Dashboard', href: '/admin', icon: LayoutDashboard },
    { name: 'Users', href: '/admin/users', icon: Users },
    { name: 'Plans', href: '/admin/plans', icon: CreditCard },
    { name: 'Announcements', href: '/admin/announcements', icon: Megaphone },
    { name: 'Settings', href: '/admin/settings', icon: Settings },
  ];

  const loggedOutNavItems = [
    { href: "/", name: "Home", icon: LayoutDashboard },
    { href: "/#features", name: "Features", icon: Users },
    { href: "/#pricing", name: "Pricing", icon: CreditCard },
    { href: "/login", name: "Login", icon: Settings },
  ];

  let navItems = user ? loggedInNavItems : loggedOutNavItems.slice(0, 5);

  if (pathname.startsWith('/admin')) {
    navItems = adminNavItems;
  }


  return (
    <div className="fixed inset-x-0 bottom-0 z-50 border-t bg-background/80 backdrop-blur-lg md:hidden pb-[env(safe-area-inset-bottom)]">
      <nav className="flex items-center justify-around px-2 pt-3 pb-3">
        {navItems.map((item) => {
          // For admin dashboard (/admin), exact match is preferred to avoid highlighting it for all admin routes
          // For other admin routes, startsWith is better to keep the tab active on sub-pages
          const isAdminRoute = pathname.startsWith('/admin');
          const isActive = isAdminRoute
            ? (item.href === '/admin' ? pathname === '/admin' : pathname.startsWith(item.href))
            : pathname === item.href;

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
  )
}
