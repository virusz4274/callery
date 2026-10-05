import { AuthProvider } from '@/lib/auth/client';
import type { Metadata, Viewport } from 'next';
import { Inter } from 'next/font/google';
import '../globals.css';
import { PublicHeader } from '@/components/public-header';
import { ThemeProvider } from '@/components/theme-provider';
import { ToastProvider } from '@/components/toast-provider';
import { createSiteMetadata, siteSeoConfig, siteViewport } from '@/lib/seo';

const inter = Inter({ subsets: ['latin'] });

export const viewport: Viewport = siteViewport;
export const metadata: Metadata = createSiteMetadata(siteSeoConfig);

export default function MarketingLayout({
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
          <AuthProvider>
          <ToastProvider>
            <div className="flex min-h-dvh w-full flex-col bg-background">
              <PublicHeader />
              <main className="flex flex-1 flex-col px-4 py-6 md:px-6 md:py-8">{children}</main>
            </div>
          </ToastProvider>
          </AuthProvider>
        </ThemeProvider>
      </body>
    </html>
  );
}
