"use client"

import Link from "next/link"
import { usePathname } from "next/navigation"
import { cn } from "@/lib/utils"
import { useUser } from "@/lib/auth/client";
import { useUserProfile } from "@/hooks/firebase/use-user-profile";
import { navigationConfig } from '@/config/navigation';

export function MobileNav() {
  const pathname = usePathname()
  const { user } = useUser();
  const { userProfile } = useUserProfile(user);

  let navItems = [];

  if (pathname.startsWith('/admin')) {
    // Admin View
    navItems = [...navigationConfig.admin];
  } else if (user) {
    // Logged In User View (Bottom Bar handles main items)
    // We typically want limited items on the bottom bar for mobile
    // Let's use the main navigation items, but maybe limit to 4-5
    navItems = [...navigationConfig.main];
    if (userProfile?.role === 'admin') {
      // Insert Admin link
      // Ideally keeping bottom bar to 4-5 items max. 
      // Let's replace 'File' or 'Upload' or just append if space?
      // Current design had 4 items + Admin. Let's just append Admin.
      navItems = [
        ...navigationConfig.main.slice(0, 2), // Recordings, Contacts
        navigationConfig.adminLink,           // Admin
        ...navigationConfig.main.slice(2)     // Files, Upload
      ];
    }
  } else {
    // Public View
    // Usually standard mobile menu handles this, but if we want a bottom bar for public:
    navItems = [
      { href: "/", name: "Home", icon: navigationConfig.main[0].icon }, // Reusing dashboard icon for Home
      ...navigationConfig.public
    ];
    // Add Login for public bottom bar
    navItems.push({ href: "/login", name: "Login", icon: navigationConfig.adminLink.icon }); // Using shield/lock icon type for Login placeholder
  }

  // Limit to 5 items max for bottom bar to avoid crowding
  const displayItems = navItems.slice(0, 5);

  return (
    <div className="fixed inset-x-0 bottom-0 z-50 border-t bg-background/80 backdrop-blur-lg md:hidden pb-[env(safe-area-inset-bottom)]">
      <nav className="flex items-center justify-around px-2 pt-3 pb-3">
        {displayItems.map((item) => {
          const isAdminRoute = pathname.startsWith('/admin');
          // Logic to highlight active tab
          // For Admin: /admin should highlight Dashboard, /admin/users -> Users
          // For User: / -> Recordings, /contacts -> Contacts

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
  )
}
