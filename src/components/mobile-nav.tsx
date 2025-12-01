
"use client"

import Link from "next/link"
import { usePathname } from "next/navigation"
import { Users, LayoutDashboard, Folder, Upload, Settings, CreditCard, Shield } from "lucide-react"
import { cn } from "@/lib/utils"

export function MobileNav() {
  const pathname = usePathname()
  const isAdminMode = process.env.NEXT_PUBLIC_ADMIN_MODE_ENABLED === 'true';

  const navItems = [
    { href: "/", name: "Recordings", icon: LayoutDashboard },
    { href: "/contacts", name: "Contacts", icon: Users },
    { href: "/upload", name: "Upload", icon: Upload },
    { href: "/pricing", name: "Pricing", icon: CreditCard },
    { href: "/settings", name: "Settings", icon: Settings },
  ]
  
  if (isAdminMode) {
    navItems.splice(2, 0, { href: "/admin", name: "Admin", icon: Shield });
  }

  return (
    <div className="fixed inset-x-0 bottom-0 z-50 border-t bg-background md:hidden">
      <nav className="flex items-center justify-between px-2 pt-2 pb-1">
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
            <span className="text-xs font-medium">{item.name}</span>
          </Link>
        ))}
      </nav>
    </div>
  )
}
