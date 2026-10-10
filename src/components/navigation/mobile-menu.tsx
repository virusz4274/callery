'use client';

import React from 'react';
import Link from 'next/link';
import { usePathname } from 'next/navigation';
import { Button, Modal } from '@heroui/react';
import { CircleHelp, Menu, Settings } from 'lucide-react';
import { Logo } from '@/components/icons';
import { cn } from '@/lib/utils';
import { navigationConfig } from '@/config/navigation';
import { publicSitePolicy } from '@/lib/public-site-policy';
import type { User as UserProfile } from '@/lib/types';
import type { AppUser as User } from '@/lib/auth/types';

type MobileMenuProps = { user: User | null; userProfile: UserProfile | null };

export function MobileMenu({ user, userProfile }: MobileMenuProps) {
  const pathname = usePathname();
  const [isOpen, setIsOpen] = React.useState(false);
  const items = user
    ? [...navigationConfig.main, { href: '/settings', name: 'Settings', icon: Settings }, { href: publicSitePolicy().supportHref, name: 'Help & support', icon: CircleHelp },
        ...(userProfile?.role === 'admin' ? [navigationConfig.adminLink] : [])]
    : navigationConfig.public;

  return (
    <>
      <Button variant="ghost" isIconOnly className="size-11 rounded-lg md:hidden" onPress={() => setIsOpen(true)} aria-label="Toggle navigation menu">
        <Menu className="size-5" />
      </Button>
      <Modal.Backdrop isOpen={isOpen} onOpenChange={setIsOpen}>
        <Modal.Container className="items-stretch justify-start p-0">
          <Modal.Dialog aria-label="Navigation" className="m-0 h-dvh max-h-dvh w-80 max-w-[90vw] rounded-none bg-surface">
            <Modal.CloseTrigger aria-label="Close navigation" />
            <Modal.Header className="border-b border-border px-5 py-5">
              <div className="flex items-center gap-2.5 text-lg font-semibold"><Logo className="size-7" />Callery</div>
            </Modal.Header>
            <Modal.Body className="gap-6 p-3">
              <nav aria-label="Mobile workspace" className="space-y-1">
                {items.map((item) => {
                  const active = pathname === item.href || pathname.startsWith(item.href + '/');
                  return (
                    <Link key={item.href} href={item.href} onClick={() => setIsOpen(false)} aria-current={active ? 'page' : undefined}
                      className={cn('flex min-h-12 items-center gap-3 rounded-lg px-3 text-sm font-medium transition-colors',
                        active ? 'bg-accent/10 text-accent' : 'text-muted hover:bg-surface-secondary hover:text-foreground')}>
                      <item.icon className="size-[18px]" aria-hidden="true" />{item.name}
                    </Link>
                  );
                })}
              </nav>
              {!user && (
                <div className="mt-auto space-y-3 px-2 pb-4">
                  <Link href="/login" className="button button--secondary w-full" onClick={() => setIsOpen(false)}>Log in</Link>
                  <Link href="/signup" className="button button--primary w-full" onClick={() => setIsOpen(false)}>Sign up</Link>
                </div>
              )}
            </Modal.Body>
          </Modal.Dialog>
        </Modal.Container>
      </Modal.Backdrop>
    </>
  );
}
