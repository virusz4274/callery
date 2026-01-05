
import type { Metadata } from 'next';
import { Inter } from 'next/font/google';
import { Suspense } from 'react';
import './globals.css';
import { ThemeProvider } from '@/components/theme-provider';
import { AppLayout } from '@/components/app-layout';
import { ToastProvider } from '@/components/toast-provider';

import { FirebaseClientProvider } from '@/lib/firebase/client-provider';

const inter = Inter({ subsets: ['latin'] });

export const metadata: Metadata = {
  title: 'CallGent',
  description: 'AI-powered call analysis and management',
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="en" suppressHydrationWarning>
      <body className={inter.className}>
        <ThemeProvider
          attribute="class"
          defaultTheme="system"
          enableSystem
          disableTransitionOnChange
        >


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
