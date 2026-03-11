
import "@/instrumentation-client";

import type { Metadata, Viewport } from 'next';
import { Inter } from 'next/font/google';
import { Suspense } from 'react';
import './globals.css';
import { ThemeProvider } from '@/components/theme-provider';
import { AppLayout } from '@/components/app-layout';
import { ToastProvider } from '@/components/toast-provider';
import { ServiceWorkerUnregister } from '@/components/service-worker-unregister';

import { FirebaseClientProvider } from '@/lib/firebase/client-provider';

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
  icons: {
    icon: '/icons/android-chrome-192x192.png',
    apple: '/icons/android-chrome-192x192.png',
    shortcut: '/icons/android-chrome-192x192.png',
  },
  formatDetection: {
    telephone: false,
  },
};

export const viewport: Viewport = {
  width: 'device-width',
  initialScale: 1,
  viewportFit: 'cover',
  themeColor: '#ffffff',
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="en" suppressHydrationWarning data-scroll-behavior="smooth">
      <body className={inter.className}>
        <ThemeProvider
          attribute="class"
          defaultTheme="system"
          enableSystem
          disableTransitionOnChange
        >
          {process.env.NODE_ENV === 'development' && <ServiceWorkerUnregister />}


          <FirebaseClientProvider>
            <Suspense>
              <ToastProvider>
                <AppLayout>{children}</AppLayout>
              </ToastProvider>
            </Suspense>
          </FirebaseClientProvider>
        </ThemeProvider>
      </body>
    </html>
  );
}
