
import {
    Users,
    LayoutDashboard,
    Folder,
    Upload,
    Shield,
    Sparkles,
    CreditCard,
    Settings,
    Megaphone
} from 'lucide-react';

export const navigationConfig = {
    main: [
        { href: '/recordings', name: 'Recordings', icon: LayoutDashboard },
        { href: '/contacts', name: 'Contacts', icon: Users },
        { href: '/files', name: 'Files', icon: Folder },
        { href: '/upload', name: 'Upload', icon: Upload },
    ],
    admin: [
        { href: '/admin', name: 'Dashboard', icon: LayoutDashboard },
        { href: '/admin/users', name: 'Users', icon: Users },
        { href: '/admin/plans', name: 'Plans', icon: CreditCard },
        { href: '/admin/announcements', name: 'Announcements', icon: Megaphone },
        { href: '/admin/settings', name: 'Settings', icon: Settings },
    ],
    public: [
        { href: '/#features', name: 'Features', icon: Sparkles },
        { href: '/#pricing', name: 'Pricing', icon: CreditCard },
    ],
    adminLink: { href: '/admin', name: 'Admin', icon: Shield },
};
