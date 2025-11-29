import type {Metadata} from 'next';
import './globals.css';
import { Toaster } from "@/components/ui/toaster"
import { AppLayout } from '@/components/app-layout';
import { recordings, contacts } from '@/lib/data';
import { Suspense } from 'react';


export const metadata: Metadata = {
  title: 'CallOrganizer',
  description: 'Organize, search, and manage your call recordings effortlessly.',
};

function RootLayoutContent({ children }: { children: React.ReactNode }) {
  return (
    <AppLayout allRecordings={recordings} allContacts={contacts}>
      {children}
    </AppLayout>
  );
}

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="en" suppressHydrationWarning>
      <head>
        <link rel="preconnect" href="https://fonts.googleapis.com" />
        <link rel="preconnect" href="https://fonts.gstatic.com" crossOrigin="anonymous" />
        <link href="https://fonts.googleapis.com/css2?family=Inter:wght@400;500;600;700&display=swap" rel="stylesheet" />
      </head>
      <body className="font-body antialiased">
        <Suspense fallback={<div>Loading...</div>}>
          <RootLayoutContent>
            {children}
          </RootLayoutContent>
        </Suspense>
        <Toaster />
      </body>
    </html>
  );
}
