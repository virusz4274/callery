'use client';

import React, { Suspense } from 'react';
import { useUser } from '@/lib/firebase/provider';
import { Skeleton } from '@/components/ui-primitives';
import { LandingPage } from '@/components/pages/landing-page';
import { redirect } from 'next/navigation';

function HomePageContent() {
  const { user, isUserLoading } = useUser();

  // Show loading state while checking auth
  if (isUserLoading) {
    return (
      <div className="space-y-8 p-6">
        <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
          <Skeleton className="h-24 rounded-xl" />
          <Skeleton className="h-24 rounded-xl" />
          <Skeleton className="h-24 rounded-xl" />
          <Skeleton className="h-24 rounded-xl" />
        </div>
        <Skeleton className="h-96 rounded-xl" />
      </div>
    );
  }

  // Show landing page for unauthenticated users
  if (!user) {
    return <LandingPage />;
  }

  // Redirect to recordings for authenticated users
  redirect('/recordings');
}

export default function Home() {
  return <HomePageContent />;
}
