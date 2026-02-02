'use client';

import React from 'react';
import Link from 'next/link';
import { usePathname } from 'next/navigation';
import { Button, Modal, Input } from "@heroui/react";
import { Search, Menu } from 'lucide-react';
import { Logo } from '@/components/icons';
import { cn } from '@/lib/utils';
import { navigationConfig } from '@/config/navigation';
import type { User as UserProfile } from '@/lib/types';
import type { User } from 'firebase/auth';

interface MobileMenuProps {
    user: User | null;
    userProfile: UserProfile | null;
    searchQuery: string;
    onSearchChange: (query: string) => void;
    isSearchablePage: boolean;
    getSearchPlaceholder: () => string;
}

export function MobileMenu({
    user,
    userProfile,
    searchQuery,
    onSearchChange,
    isSearchablePage,
    getSearchPlaceholder
}: MobileMenuProps) {
    const pathname = usePathname();
    const [isOpen, setIsOpen] = React.useState(false);

    const handleClose = () => setIsOpen(false);

    // Combine items based on auth state
    let items = user ? [...navigationConfig.main] : [...navigationConfig.public];

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
                                    <span className="font-bold text-lg">VoSift</span>
                                </div>
                            </Modal.Header>
                            <Modal.Body className="p-4 gap-6">
                                {user && isSearchablePage && (
                                    <div className="relative">
                                        <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-default-400 z-10" />
                                        <Input
                                            className="w-full h-10 text-small font-normal text-default-500 bg-default-100 dark:bg-default-50/20 shadow-none border-none focus:ring-2 focus:ring-primary rounded-md px-9"
                                            placeholder={getSearchPlaceholder()}
                                            type="search"
                                            value={searchQuery}
                                            onChange={(e) => onSearchChange(e.target.value)}
                                        />
                                    </div>
                                )}

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
                                            <Button color="primary" fullWidth size="lg">Sign Up</Button>
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
