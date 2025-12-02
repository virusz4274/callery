'use client';

import React, { Suspense } from 'react';
import { useUser } from '@/firebase';
import { useUserProfile } from '@/firebase/auth/use-user-profile';
import { useRouter } from 'next/navigation';
import { Loader2 } from 'lucide-react';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';

function AdminLayoutContent({ children }: { children: React.ReactNode }) {
  const { user, isUserLoading } = useUser();
  const { userProfile, isProfileLoading } = useUserProfile(user);
  const router = useRouter();

  React.useEffect(() => {
    // If user loading is finished and there's no user, redirect to login.
    if (!isUserLoading && !user) {
      router.replace('/login');
    }
    
    // If profile loading is finished and the user is not an admin, redirect home.
    if (!isProfileLoading && userProfile && userProfile.role !== 'admin') {
      router.replace('/');
    }
  }, [user, isUserLoading, userProfile, isProfileLoading, router]);

  const isLoading = isUserLoading || isProfileLoading;

  if (isLoading) {
    return (
      <div className="flex h-[calc(100vh-8rem)] items-center justify-center">
        <Loader2 className="h-16 w-16 animate-spin text-primary" />
        <span className="sr-only">Loading Admin Section...</span>
      </div>
    );
  }

  // If user is logged in and is an admin, show the content.
  if (user && userProfile?.role === 'admin') {
    return <>{children}</>;
  }

  // Fallback for edge cases, e.g., user is logged out after initial check
  // or profile exists but role is missing (should not happen with proper setup)
  return (
     <div className="flex h-[calc(100vh-8rem)] items-center justify-center">
        <Card className="w-full max-w-md">
            <CardHeader>
                <CardTitle className="text-center">Access Denied</CardTitle>
            </CardHeader>
            <CardContent>
                <p className="text-center text-muted-foreground">
                    You do not have permission to view this page.
                </p>
            </CardContent>
        </Card>
     </div>
  );
}


export default function AdminLayout({ children }: { children: React.ReactNode }) {
  return (
    <Suspense>
        <AdminLayoutContent>{children}</AdminLayoutContent>
    </Suspense>
  );
}
