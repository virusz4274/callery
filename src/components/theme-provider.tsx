
"use client"

import * as React from "react"
import { ThemeProvider as NextThemesProvider } from "next-themes"
import { RouterProvider } from "@heroui/react"
import { useRouter } from "next/navigation"

export function ThemeProvider({ children, ...props }: React.ComponentProps<typeof NextThemesProvider>) {
  const router = useRouter()
  return <NextThemesProvider {...props}><RouterProvider navigate={(href) => router.push(href)}>{children}</RouterProvider></NextThemesProvider>
}
