"use client";

import Link from "next/link";
import type { ReactNode } from "react";
import { Card, Chip, Surface } from "@heroui/react";
import { FileText, Search, Users } from "lucide-react";
import { Logo as BrandLogo } from "@/components/icons";
import { useIsMobile } from "@/hooks/use-mobile";

const authHighlights = [
  {
    icon: Search,
    title: "Search by meaning",
    description: "Find important calls without hunting through filenames.",
  },
  {
    icon: FileText,
    title: "Review with context",
    description: "Open audio, transcript, summary, and metadata in one place.",
  },
  {
    icon: Users,
    title: "Keep contacts connected",
    description: "Keep people, numbers, and conversations linked together.",
  },
];

type AuthShellProps = {
  badge: string;
  title: string;
  description: string;
  children: ReactNode;
  footer?: ReactNode;
  compactOnMobile?: boolean;
};

export function AuthShell({
  badge,
  title,
  description,
  children,
  footer,
  compactOnMobile = false,
}: AuthShellProps) {
  const isMobile = useIsMobile();
  const useCompactLayout = compactOnMobile && isMobile;

  return (
    <div className="min-h-dvh bg-[radial-gradient(circle_at_top_left,rgba(0,111,238,0.14),transparent_32%),radial-gradient(circle_at_bottom_right,rgba(148,82,255,0.1),transparent_28%),linear-gradient(180deg,rgba(255,255,255,0.98),rgba(245,247,250,1))] text-foreground dark:bg-[radial-gradient(circle_at_top_left,rgba(0,111,238,0.18),transparent_28%),radial-gradient(circle_at_bottom_right,rgba(148,82,255,0.12),transparent_24%),linear-gradient(180deg,rgba(18,18,22,1),rgba(12,12,16,1))]">
      <div className={`mx-auto flex min-h-dvh w-full max-w-6xl flex-col px-4 ${useCompactLayout ? 'py-3' : 'py-4'} sm:px-6 lg:grid lg:grid-cols-[minmax(0,0.95fr)_minmax(420px,1fr)] lg:gap-8 lg:px-8 lg:py-8`}>
        <div className={`flex items-center justify-between ${useCompactLayout ? 'py-1' : 'py-2'} lg:col-span-2`}>
          <Link
            href="/"
            className="inline-flex items-center gap-3 rounded-full px-1 py-1 text-sm font-medium text-foreground transition-colors hover:text-primary"
          >
            <span className={`flex items-center justify-center rounded-2xl bg-background/80 text-primary shadow-sm ring-1 ring-default-200/60 ${useCompactLayout ? 'size-9' : 'size-10'}`}>
              <BrandLogo className={useCompactLayout ? 'size-5.5' : 'size-6'} />
            </span>
            <span className="text-base font-semibold tracking-tight">Callery</span>
          </Link>

          <Link
            href="/"
            className={`rounded-full border border-default-200/70 bg-background/70 text-sm font-medium text-default-600 transition-colors hover:border-primary/25 hover:text-primary ${useCompactLayout ? 'px-3 py-1.5' : 'px-4 py-2'}`}
          >
            Back to site
          </Link>
        </div>

        <Surface
          variant="secondary"
          className="relative hidden overflow-hidden rounded-[2rem] border border-default-200/60 px-7 py-8 shadow-xl shadow-black/5 lg:flex lg:flex-col"
        >
          <div className="pointer-events-none absolute inset-0 bg-[linear-gradient(135deg,rgba(0,111,238,0.08),transparent_35%),linear-gradient(315deg,rgba(148,82,255,0.08),transparent_30%)]" />

          <div className="relative space-y-6">
            <Chip variant="soft" color="accent" className="w-fit">
              Callery workspace
            </Chip>

            <div className="space-y-4">
              <h2 className="max-w-xl text-3xl font-semibold tracking-tight text-foreground xl:text-4xl">
                Search, review, and organize calls without extra steps.
              </h2>
              <p className="max-w-xl text-sm leading-6 text-default-600 xl:text-base">
                Everything you need stays in one workspace, so signing in feels like getting back to work, not re-reading the product.
              </p>
            </div>

            <div className="grid gap-4">
              {authHighlights.map((item) => (
                <Surface
                  key={item.title}
                  variant="default"
                  className="grid grid-cols-[auto_1fr] gap-3 rounded-xl border border-default-200/60 bg-background/70 px-4 py-4 shadow-sm"
                >
                  <div className="flex size-10 items-center justify-center rounded-2xl bg-primary/10 text-primary">
                    <item.icon className="size-4.5" />
                  </div>
                  <div className="space-y-1">
                    <h3 className="text-sm font-semibold text-foreground">{item.title}</h3>
                    <p className="text-sm leading-6 text-default-500">{item.description}</p>
                  </div>
                </Surface>
              ))}
            </div>
          </div>
        </Surface>

        <Card className={`w-full border border-default-200/70 bg-background/95 shadow-2xl shadow-black/10 backdrop-blur-md ${useCompactLayout ? 'rounded-[1.5rem]' : 'rounded-[2rem]'}`}>
          <Card.Header className={`flex flex-col ${useCompactLayout ? 'gap-4 px-5 pt-5 sm:px-6 sm:pt-6' : 'gap-5 px-6 pt-6 sm:px-8 sm:pt-8'}`}>
            <div className={`flex items-center justify-center rounded-xl bg-primary/10 text-primary ring-1 ring-primary/10 ${useCompactLayout ? 'size-12' : 'size-14'}`}>
              <BrandLogo className={useCompactLayout ? 'size-7' : 'size-8'} />
            </div>

            <div className="space-y-3">
              <p className="text-[11px] font-semibold uppercase tracking-[0.24em] text-default-500">
                {badge}
              </p>
              <div className="space-y-2">
                <h1 className={`font-semibold tracking-tight text-foreground ${useCompactLayout ? 'text-2xl sm:text-3xl' : 'text-3xl sm:text-4xl'}`}>
                  {title}
                </h1>
                <p className="max-w-md text-sm leading-6 text-default-600 sm:text-base">{description}</p>
              </div>
            </div>
          </Card.Header>

          <Card.Content className={useCompactLayout ? 'px-5 pb-5 pt-4 sm:px-6' : 'px-6 pb-6 pt-6 sm:px-8'}>{children}</Card.Content>

          {footer ? (
            <Card.Footer className={`${useCompactLayout ? 'px-5 py-4 sm:px-6' : 'px-6 py-5 sm:px-8'} border-t border-default-100/80`}>
              {footer}
            </Card.Footer>
          ) : null}
        </Card>
      </div>
    </div>
  );
}
