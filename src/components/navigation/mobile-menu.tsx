'use client';

import React from 'react';
import Link from 'next/link';
import { usePathname } from 'next/navigation';
import { Button, Modal } from "@heroui/react";
import { Menu } from 'lucide-react';
import { Logo } from '@/components/icons';
import { cn } from '@/lib/utils';
import { navigationConfig } from '@/config/navigation';
import { useIsCapacitor } from '@/hooks/use-is-capacitor';
import type { User as UserProfile } from '@/lib/types';
import type { User } from 'firebase/auth';

interface MobileMenuProps {
    user: User | null;
    userProfile: UserProfile | null;
}

export function MobileMenu({
    user,
    userProfile,
}: MobileMenuProps) {
    const pathname = usePathname();
    const [isOpen, setIsOpen] = React.useState(false);
    const isCapacitor = useIsCapacitor();

    const handleClose = () => setIsOpen(false);

    // Combine items based on auth state
    let items = user ? [...navigationConfig.main] : [...navigationConfig.public];

    if (user && isCapacitor) {
        items.push(...navigationConfig.android);
    }

    if (user && userProfile?.role === 'admin') {
        items.push(navigationConfig.adminLink);
    }

    return (
        <>
            <Button variant="ghost" isIconOnly className="md:hidden mr-2" onPress={() => setIsOpen(true)}>
                <Menu className="h-5 w-5" />
                <span className="sr-only">Toggle navigation menu</span>
            </Button>

            <Modal isOpen={isOpen} onOpenChange={setIsOpen}>
                <Modal.Backdrop>
                    <Modal.Container>
                        <Modal.Dialog className="h-[100dvh] max-h-[100dvh] w-screen max-w-full rounded-none m-0 bg-background">
                            <Modal.CloseTrigger />
                            <Modal.Header className="flex flex-row items-center justify-between p-4 border-b border-default-100">
                                <div className="flex items-center gap-2">
                                    <Logo className="h-6 w-6 text-primary" />
                                    <span className="font-bold text-lg">Callery</span>
                                </div>
                            </Modal.Header>
                            <Modal.Body className="p-4 gap-6">
                                <div className="flex flex-col gap-2">
                                    {items.map((item) => (
                                        <Link
                                            key={item.href}
                                            href={item.href}
                                            className={cn(
                                                "flex items-center gap-4 p-4 rounded-xl transition-all",
                                                pathname === item.href
                                                    ? "bg-primary/10 text-primary font-semibold"
                                                    : "text-foreground hover:bg-default-100"
                                            )}
                                            onClick={handleClose}
                                        >
                                            <item.icon className="h-5 w-5" />
                                            {item.name}
                                        </Link>
                                    ))}
                                </div>

                                {!user && (
                                    <div className="flex flex-col gap-3 mt-auto mb-6">
                                        <Link href="/login" className="w-full" onClick={handleClose}>
                                            <Button variant="ghost" fullWidth size="lg">Login</Button>
                                        </Link>
                                        <Link href="/signup" className="w-full" onClick={handleClose}>
                                            <Button fullWidth size="lg" className="bg-primary text-white">Sign Up</Button>
                                        </Link>
                                    </div>
                                )}
                            </Modal.Body>
                        </Modal.Dialog>
                    </Modal.Container>
                </Modal.Backdrop>
            </Modal>
        </>
    );
}
