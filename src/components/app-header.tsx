"use client";

import React, { useState } from 'react';
import Link from 'next/link';
import { usePathname } from 'next/navigation';
import {
  Button,
  Avatar,
  Modal,
  Input,
  Dropdown,
} from "@heroui/react";
import { Users, LayoutDashboard, Search, Folder, Upload, Menu, CreditCard, Shield, Sparkles, Settings, LogOut, HelpCircle } from 'lucide-react';
import { Logo } from './icons';
import { cn } from '@/lib/utils';
import { ThemeSwitcher } from './theme-switcher';
import type { User } from 'firebase/auth';
import type { User as UserProfile } from '@/lib/types';

type AppHeaderProps = {
  user: User | null;
  userProfile: UserProfile | null;
  searchQuery: string;
  onSearchChange: (query: string) => void;
  onLogout: () => void;
};

export function AppHeader({ user, userProfile, searchQuery, onSearchChange, onLogout }: AppHeaderProps) {
  const pathname = usePathname();
  const [isMenuOpen, setIsMenuOpen] = useState(false);

  const loggedInNavItems = [
    { href: '/', name: 'Recordings', icon: LayoutDashboard },
    { href: '/contacts', name: 'Contacts', icon: Users },
    { href: '/files', name: 'Files', icon: Folder },
    { href: '/upload', name: 'Upload', icon: Upload },
  ];

  if (userProfile?.role === 'admin') {
    loggedInNavItems.push({ href: '/admin', name: 'Admin', icon: Shield });
  }

  const loggedOutNavItems = [
    { href: '/#features', name: 'Features', icon: Sparkles },
    { href: '/#pricing', name: 'Pricing', icon: CreditCard },
  ];


  const getSearchPlaceholder = () => {
    if (pathname === '/contacts') {
      return 'Search contacts...';
    }
    return 'Search recordings...';
  }

  const isSearchablePage = ['/', '/contacts'].includes(pathname);
  const navItems = user ? loggedInNavItems : loggedOutNavItems;

  const handleCloseMenu = () => {
    setIsMenuOpen(false);
  };

  return (
    <header className="sticky top-0 z-40 w-full border-b border-default-200/50 bg-background/70 backdrop-blur-xl supports-[backdrop-filter]:bg-background/60">
      <div className="w-full max-w-full mx-auto flex h-16 items-center px-4 md:px-6">
        {/* Mobile Menu Modal Trigger & Content */}
        <Modal isOpen={isMenuOpen} onOpenChange={setIsMenuOpen}>
          <Button variant="ghost" isIconOnly className="md:hidden mr-2">
            <Menu className="h-5 w-5" />
            <span className="sr-only">Toggle navigation menu</span>
          </Button>
          <Modal.Backdrop>
            <Modal.Container>
              <Modal.Dialog className="h-[100dvh] max-h-[100dvh] w-screen max-w-full rounded-none m-0">
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
                        className="w-full h-10 px-9 text-small font-normal text-default-500 bg-default-100 rounded-md shadow-none border-none focus:ring-2 focus:ring-primary"
                        placeholder={getSearchPlaceholder()}
                        type="search"
                        value={searchQuery}
                        onChange={(e) => onSearchChange(e.target.value)}
                      />
                    </div>
                  )}

                  <div className="flex flex-col gap-2">
                    {navItems.map((item) => (
                      <Link
                        key={item.href}
                        href={item.href}
                        className={cn(
                          "flex items-center gap-4 p-4 rounded-xl transition-all",
                          pathname === item.href
                            ? "bg-primary/10 text-primary font-semibold"
                            : "text-foreground hover:bg-default-100"
                        )}
                        onClick={handleCloseMenu}
                      >
                        <item.icon className="h-5 w-5" />
                        {item.name}
                      </Link>
                    ))}
                  </div>

                  {!user && (
                    <div className="flex flex-col gap-3 mt-auto mb-6">
                      <Link href="/login" className="w-full">
                        <Button variant="ghost" fullWidth size="lg">Login</Button>
                      </Link>
                      <Link href="/signup" className="w-full">
                        <Button variant="primary" fullWidth size="lg">Sign Up</Button>
                      </Link>
                    </div>
                  )}
                </Modal.Body>
              </Modal.Dialog>
            </Modal.Container>
          </Modal.Backdrop>
        </Modal>

        {/* Logo */}
        <div className="mr-4 flex">
          <Link href="/" className="flex items-center gap-2">
            <Logo className="h-8 w-8 text-primary" />
            <span className="font-bold text-xl tracking-tight hidden xs:block">VoSift</span>
          </Link>
        </div>

        {/* Desktop Navigation */}
        <nav className="hidden md:flex items-center gap-1 mx-6">
          {navItems.map((item) => (
            <Link
              key={item.href}
              href={item.href}
              className={cn(
                "flex items-center gap-2 py-2 px-3 rounded-full text-sm font-medium transition-all duration-200",
                pathname === item.href
                  ? "text-primary bg-primary/10"
                  : "text-default-500 hover:text-foreground hover:bg-default-100"
              )}
            >
              <item.icon className={cn("h-4 w-4", pathname === item.href && "text-primary")} />
              {item.name}
            </Link>
          ))}
        </nav>

        <div className="flex flex-1 items-center justify-end gap-2 md:gap-4">
          {/* Search Bar */}
          {user && isSearchablePage && (
            <div className="hidden lg:flex w-full max-w-[240px]">
              <div className="relative w-full">
                <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-default-400 z-10" />
                <Input
                  className="h-9 w-full rounded-md px-9 text-small font-normal text-default-500 bg-default-100 dark:bg-default-50/10 shadow-none border-none focus:ring-2 focus:ring-primary"
                  placeholder={getSearchPlaceholder()}
                  type="search"
                  value={searchQuery}
                  onChange={(e) => onSearchChange(e.target.value)}
                  aria-label="Search"
                />
              </div>
            </div>
          )}

          <ThemeSwitcher />

          {user ? (
            <Dropdown>
              <Dropdown.Trigger className="ml-2">
                <Avatar
                  className="transition-transform"
                  color="accent"
                  size="sm"
                >
                  <Avatar.Image src={user.photoURL || undefined} alt={user.displayName || "User"} />
                  <Avatar.Fallback>{(user.displayName || user.email || "U").charAt(0)}</Avatar.Fallback>
                </Avatar>
              </Dropdown.Trigger>
              <Dropdown.Popover placement="bottom end">
                <Dropdown.Menu aria-label="Profile Actions">
                  <Dropdown.Item key="profile" id="profile" className="h-14 gap-2" textValue={`Signed in as ${user.email}`}>
                    <p className="font-semibold">Signed in as</p>
                    <p className="font-semibold">{user.email}</p>
                  </Dropdown.Item>
                  <Dropdown.Item key="settings" id="settings" href="/settings" textValue="Settings">
                    <div className="flex items-center gap-2">
                      <Settings className="h-4 w-4" />
                      <p>Settings</p>
                    </div>
                  </Dropdown.Item>
                  <Dropdown.Item key="help_and_feedback" id="help_and_feedback" href="/support" textValue="Help & Feedback">
                    <div className="flex items-center gap-2">
                      <HelpCircle className="h-4 w-4" />
                      <p>Help & Feedback</p>
                    </div>
                  </Dropdown.Item>
                  <Dropdown.Item key="logout" id="logout" variant="danger" onPress={onLogout} textValue="Log Out">
                    <div className="flex items-center gap-2">
                      <LogOut className="h-4 w-4" />
                      <p>Log Out</p>
                    </div>
                  </Dropdown.Item>
                </Dropdown.Menu>
              </Dropdown.Popover>
            </Dropdown>
          ) : (
            <div className="flex items-center gap-2">
              <Link href="/login" className="hidden sm:flex text-sm font-medium text-foreground hover:text-primary transition-colors px-4 py-2">
                Login
              </Link>
              <Link href="/signup">
                <Button variant="primary" size="sm" className="font-medium rounded-full px-6">
                  Sign Up
                </Button>
              </Link>
            </div>
          )}
        </div>
      </div>


    </header>
  );
}
