
import type { Metadata, Viewport } from 'next';
import { Inter } from 'next/font/google';
import { Suspense } from 'react';
import '../globals.css';
import { ThemeProvider } from '@/components/theme-provider';
import { AppLayout } from '@/components/app-layout';
import { ToastProvider } from '@/components/toast-provider';
import { PushServiceWorkerRegister } from '@/components/push-service-worker-register';
import { ServiceWorkerUnregister } from '@/components/service-worker-unregister';
import { FirebaseClientProvider } from '@/lib/firebase/client-provider';
import { env } from '@/lib/env';
import { createSiteMetadata, siteSeoConfig, siteViewport } from '@/lib/seo';

const inter = Inter({ subsets: ['latin'] });

export const viewport: Viewport = siteViewport;
export const metadata: Metadata = createSiteMetadata(siteSeoConfig);

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
          {env.NODE_ENV === 'development' && <ServiceWorkerUnregister />}
          {env.NODE_ENV === 'production' && <PushServiceWorkerRegister />}
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
