
"use client"

import Link from "next/link"
import { usePathname } from "next/navigation"
import { Users, LayoutDashboard, Folder, Upload, Settings } from "lucide-react"
import { cn } from "@/lib/utils"

export function MobileNav() {
  const pathname = usePathname()
  const navItems = [
    { href: "/", name: "Recordings", icon: LayoutDashboard },
    { href: "/contacts", name: "Contacts", icon: Users },
    { href: "/files", name: "Files", icon: Folder },
    { href: "/upload", name: "Upload", icon: Upload },
    { href: "/settings", name: "Settings", icon: Settings },
  ]

  return (
    <div className="fixed inset-x-0 bottom-0 z-50 border-t bg-background/95 backdrop-blur-sm md:hidden">
      <nav className="flex items-center justify-around p-2">
        {navItems.map((item) => (
          <Link
            key={item.name}
            href={item.href}
            className={cn(
              "flex flex-col items-center gap-1 rounded-md p-2 text-muted-foreground transition-colors hover:bg-accent hover:text-accent-foreground",
              pathname === item.href && "text-primary bg-accent"
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
