
'use client';

import React, { Suspense } from 'react';
import { useUser } from '@/lib/firebase/provider';
import { useUserProfile } from '@/hooks/firebase/use-user-profile';
import { useRouter } from 'next/navigation';
import { Spinner, Card } from '@heroui/react';

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
      <div className="flex flex-col h-[calc(100vh-8rem)] items-center justify-center gap-4">
        <Spinner size="lg" color="current" className="text-primary" />
        <p className="text-default-500 font-medium">Loading Admin Section...</p>
      </div>
    );
  }

  // If user is logged in and is an admin, show the content.
  if (user && userProfile?.role === 'admin') {
    return <>{children}</>;
  }

  if (user && userProfile && userProfile.role !== 'admin') {
    // This state is handled by the useEffect redirect, but as a fallback,
    // we can return null or a message while redirecting.
    return null;
  }


  // Fallback for edge cases, e.g., user is logged out after initial check
  // or profile exists but role is missing (should not happen with proper setup)
  return (
    <div className="flex h-[calc(100vh-8rem)] items-center justify-center">
      <Card className="w-full max-w-md">
        <Card.Header className="justify-center">
          <h3 className="text-xl font-semibold text-center">Access Denied</h3>
        </Card.Header>
        <Card.Content>
          <p className="text-center text-muted-foreground">
            You do not have permission to view this page. Redirecting...
          </p>
        </Card.Content>
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
