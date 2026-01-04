
"use client";
import React, { useState, useEffect, useTransition } from 'react';
import { usePathname, useRouter, useSearchParams } from 'next/navigation';
import { AppHeader } from '@/components/app-header';
import { MobileNav } from './mobile-nav';
import { useIsMobile } from '@/hooks/use-mobile';
import { ClientOnly } from './client-only';
import { EmailVerificationAlert } from './email-verification-alert';
import { useUser, useAuth, useUserProfile } from '@/firebase';
import { signOut, sendEmailVerification } from 'firebase/auth';
import { useToast } from '@/hooks/use-toast';
import { Loader2 } from 'lucide-react';


type AppLayoutProps = {
  children: React.ReactNode;
};

export function AppLayout({ children }: AppLayoutProps) {
    const router = useRouter();
    const pathname = usePathname();
    const searchParams = useSearchParams();
    const [isPending, startTransition] = useTransition();
    const isMobile = useIsMobile();
    const { toast } = useToast();

    // Data fetching and auth logic is now in the layout container
    const { user, isUserLoading } = useUser();
    const { userProfile } = useUserProfile(user);
    const auth = useAuth();
    
    // State for search query
    const [searchQuery, setSearchQuery] = useState(searchParams.get('q') || '');
    const showHamburger = process.env.NEXT_PUBLIC_SHOW_MOBILE_BURGER_MENU === 'true';
    
    // Effect to update URL when searchQuery changes
    useEffect(() => {
        const params = new URLSearchParams(window.location.search);
        if (searchQuery) {
            params.set('q', searchQuery);
        } else {
            params.delete('q');
        }

        const newPath = `${pathname}?${params.toString()}`;
        
        startTransition(() => {
            router.replace(newPath, { scroll: false });
        });
    }, [searchQuery, pathname, router]);

    // Effect to clear search when navigating to a new page
    useEffect(() => {
        setSearchQuery('');
    }, [pathname]);

    const handleLogout = async () => {
        try {
          await signOut(auth);
          toast({
            title: "Signed Out",
            description: "You have been successfully signed out.",
          });
          router.push('/');
        } catch (error) {
          console.error("Error signing out: ", error);
          toast({
            variant: "destructive",
            title: "Error",
            description: "Failed to sign out. Please try again.",
          });
        }
    };
    
    const handleResendVerification = async () => {
        if (!user) return;
        try {
          await sendEmailVerification(user);
          toast({
            title: 'Verification Email Sent',
            description: 'Please check your inbox for the verification link.',
          });
        } catch (error: any) {
          toast({
            variant: 'destructive',
            title: 'Error Sending Email',
            description: error.message || 'Failed to send verification email. Please try again.',
          });
        }
    };

    if (isUserLoading) {
        return (
             <div className="flex h-screen items-center justify-center">
                <Loader2 className="h-16 w-16 animate-spin text-primary" />
            </div>
        )
    }

    return (
        <div className="flex min-h-screen w-full flex-col bg-background">
            <AppHeader 
                user={user}
                userProfile={userProfile}
                searchQuery={searchQuery}
                onSearchChange={setSearchQuery}
                onLogout={handleLogout}
            />
            <main className="flex flex-1 flex-col gap-4 p-4 md:gap-8 md:p-6 pb-24 md:pb-6">
                <EmailVerificationAlert 
                    user={user}
                    onResend={handleResendVerification}
                />
                {children}
            </main>
            <ClientOnly>
              {isMobile && !showHamburger && <MobileNav />}
            </ClientOnly>
        </div>
    );
}
