'use client';

import React from 'react';
import { Dropdown, Avatar } from '@heroui/react';
import { Settings, LogOut, HelpCircle, FileText, Shield } from 'lucide-react';
import type { AppUser as User } from '@/lib/auth/types';
import type { User as UserProfile } from '@/lib/types';

interface UserDropdownProps {
    user: User;
    userProfile: UserProfile | null;
    onLogout: () => void;
}

export function UserDropdown({ user, onLogout }: UserDropdownProps) {
    return (
        <Dropdown>
            <Dropdown.Trigger className="ml-2 cursor-pointer">
                <Avatar
                    className="transition-transform"
                    color="accent"
                    size="sm"
                >
                    <Avatar.Image src={user.image || undefined} />
                    <Avatar.Fallback>{(user.name || user.email || "U").charAt(0).toUpperCase()}</Avatar.Fallback>
                </Avatar>
            </Dropdown.Trigger>
            <Dropdown.Popover placement="bottom end">
                <Dropdown.Menu aria-label="Profile Actions">
                    <Dropdown.Item key="profile" className="h-14 gap-2" textValue={`Signed in as ${user.email}`}>
                        <p className="font-semibold">Signed in as</p>
                        <p className="font-semibold">{user.email}</p>
                    </Dropdown.Item>
                    <Dropdown.Item key="settings" href="/settings" textValue="Settings">
                        <div className="flex items-center gap-2">
                            <Settings className="h-4 w-4" />
                            <p>Settings</p>
                        </div>
                    </Dropdown.Item>
                    <Dropdown.Item key="support" href="/support" textValue="Help & Feedback">
                        <div className="flex items-center gap-2">
                            <HelpCircle className="h-4 w-4" />
                            <p>Help & Support</p>
                        </div>
                    </Dropdown.Item>
                    <Dropdown.Item key="terms" href="/terms-of-service" textValue="Terms">
                        <div className="flex items-center gap-2">
                            <Shield className="h-4 w-4" />
                            <p>Terms of Service</p>
                        </div>
                    </Dropdown.Item>
                    <Dropdown.Item key="privacy" href="/privacy-policy" textValue="Privacy">
                        <div className="flex items-center gap-2">
                            <FileText className="h-4 w-4" />
                            <p>Privacy Policy</p>
                        </div>
                    </Dropdown.Item>
                    <Dropdown.Item key="logout" variant="danger" onPress={onLogout} textValue="Log Out">
                        <div className="flex items-center gap-2">
                            <LogOut className="h-4 w-4" />
                            <p>Log Out</p>
                        </div>
                    </Dropdown.Item>
                </Dropdown.Menu>
            </Dropdown.Popover>
        </Dropdown>
    );
}
