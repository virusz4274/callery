'use client';

import { Dropdown, Avatar } from '@heroui/react';
import { Settings, LogOut, HelpCircle, FileText, Shield } from 'lucide-react';
import type { AppUser as User } from '@/lib/auth/types';
import type { User as UserProfile } from '@/lib/types';
import { marketingPageHref, publicSitePolicy } from '@/lib/public-site-policy';

interface UserDropdownProps {
    user: User;
    userProfile: UserProfile | null;
    onLogout: () => void;
}

export function UserDropdown({ user, onLogout }: UserDropdownProps) {
    const { supportHref } = publicSitePolicy();
    const termsHref = marketingPageHref('/terms-of-service');
    const privacyHref = marketingPageHref('/privacy-policy');
    return (
        <Dropdown>
            <Dropdown.Trigger aria-label="Open account menu" className="flex size-11 cursor-pointer items-center justify-center rounded-full">
                <Avatar
                    className="transition-transform"
                    color="accent"
                    size="sm"
                >
                    <Avatar.Image src={user.image || undefined} alt={user.name || 'Your avatar'} />
                    <Avatar.Fallback>{(user.name || user.email || "U").charAt(0).toUpperCase()}</Avatar.Fallback>
                </Avatar>
            </Dropdown.Trigger>
            <Dropdown.Popover placement="bottom end">
                <Dropdown.Menu aria-label="Profile Actions">
                    <Dropdown.Item key="profile" className="gap-2" textValue={`Signed in as ${user.email}`}>
                        <p className="text-xs text-default-500 truncate max-w-[200px]">{user.email}</p>
                    </Dropdown.Item>
                    <Dropdown.Item key="settings" href="/settings" textValue="Settings">
                        <div className="flex items-center gap-2">
                            <Settings className="h-4 w-4" />
                            <p>Settings</p>
                        </div>
                    </Dropdown.Item>
                    <Dropdown.Item key="support" href={supportHref} textValue="Help & Feedback">
                        <div className="flex items-center gap-2">
                            <HelpCircle className="h-4 w-4" />
                            <p>Help & Feedback</p>
                        </div>
                    </Dropdown.Item>
                    {termsHref && <Dropdown.Item key="terms" href={termsHref} textValue="Terms">
                        <div className="flex items-center gap-2">
                            <Shield className="h-4 w-4" />
                            <p>Terms of Service</p>
                        </div>
                    </Dropdown.Item>}
                    {privacyHref && <Dropdown.Item key="privacy" href={privacyHref} textValue="Privacy">
                        <div className="flex items-center gap-2">
                            <FileText className="h-4 w-4" />
                            <p>Privacy Policy</p>
                        </div>
                    </Dropdown.Item>}
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
