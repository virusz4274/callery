
import "@/instrumentation-client";

import type { Metadata, Viewport } from 'next';
import { Inter } from 'next/font/google';
import { Suspense } from 'react';
import './globals.css';
import { ThemeProvider } from '@/components/theme-provider';
import { AppLayout } from '@/components/app-layout';
import { ToastProvider } from '@/components/toast-provider';
import { ServiceWorkerUnregister } from '@/components/service-worker-unregister';

import { AuthProvider } from '@/lib/auth/client';

const inter = Inter({ subsets: ['latin'] });

export const metadata: Metadata = {
  title: 'VoSift',
  description: 'VoSift - Search deeper than words.',
  manifest: '/manifest.json',
  appleWebApp: {
    capable: true,
    statusBarStyle: 'default',
    title: 'VoSift',
  },
  formatDetection: {
    telephone: false,
  },
};

export const viewport: Viewport = {
  width: 'device-width',
  initialScale: 1,
  maximumScale: 1,
  userScalable: false,
  themeColor: '#ffffff',
};



import { getSystemSettings } from '@/app/actions/admin-settings';

export default async function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  // Fetch system settings on the server
  console.log('[RootLayout] Calling getSystemSettings...');
  const settings = await getSystemSettings();
  console.log('[RootLayout] getSystemSettings returned.');

  return (
    <html lang="en" suppressHydrationWarning>
      <body className={inter.className}>
        <ThemeProvider
          attribute="class"
          defaultTheme="system"
          enableSystem
          disableTransitionOnChange
        >
          {process.env.NODE_ENV === 'development' && <ServiceWorkerUnregister />}


          <AuthProvider>
            <Suspense>
              <ToastProvider>
                <AppLayout systemSettings={settings}>{children}</AppLayout>
              </ToastProvider>
            </Suspense>
          </AuthProvider>
        </ThemeProvider>
      </body>
    </html>
  );
}
