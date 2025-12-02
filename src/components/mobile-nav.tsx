
"use client"

import Link from "next/link"
import { usePathname } from "next/navigation"
import { Users, LayoutDashboard, Folder, Upload, Settings, CreditCard, Shield } from "lucide-react"
import { cn } from "@/lib/utils"
import { useUser } from "@/firebase"

export function MobileNav() {
  const pathname = usePathname()
  const { user } = useUser();
  const isAdminMode = process.env.NEXT_PUBLIC_ADMIN_MODE_ENABLED === 'true';

  const loggedInNavItems = [
    { href: "/", name: "Recordings", icon: LayoutDashboard },
    { href: "/contacts", name: "Contacts", icon: Users },
    { href: "/upload", name: "Upload", icon: Upload },
    { href: "/settings", name: "Settings", icon: Settings },
  ]
  
  if (isAdminMode) {
    loggedInNavItems.splice(2, 0, { href: "/admin", name: "Admin", icon: Shield });
  }

  const loggedOutNavItems = [
      { href: "/", name: "Home", icon: LayoutDashboard },
      { href: "/#features", name: "Features", icon: Users },
      { href: "/#pricing", name: "Pricing", icon: CreditCard },
      { href: "/login", name: "Login", icon: Settings },
  ];

  const navItems = user ? loggedInNavItems : loggedOutNavItems.slice(0, 5);


  return (
    <div className="fixed inset-x-0 bottom-0 z-50 border-t bg-background md:hidden">
      <nav className="flex items-center justify-around px-2 pt-2 pb-1">
        {navItems.map((item) => (
          <Link
            key={item.name}
            href={item.href}
            className={cn(
              "flex flex-col items-center gap-1 rounded-md p-2 text-muted-foreground transition-colors hover:bg-accent hover:text-accent-foreground w-1/5",
              pathname === item.href && "text-primary bg-accent/50"
            )}
          >
            <item.icon className="h-5 w-5" />
            <span className="text-xs font-medium text-center">{item.name}</span>
          </Link>
        ))}
      </nav>
    </div>
  )
}
