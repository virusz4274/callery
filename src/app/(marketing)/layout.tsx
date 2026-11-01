import { AuthProvider } from '@/lib/auth/client';
import type { Metadata, Viewport } from 'next';
import { Manrope } from 'next/font/google';
import '../globals.css';
import { MarketingHeader } from '@/components/marketing/marketing-header';
import { MarketingFooter } from '@/components/marketing/marketing-footer';
import styles from '@/components/marketing/marketing-shell.module.css';
import { ThemeProvider } from '@/components/theme-provider';
import { ToastProvider } from '@/components/toast-provider';
import { ServiceWorkerUnregister } from '@/components/service-worker-unregister';
import { createSiteMetadata, siteSeoConfig, siteViewport } from '@/lib/seo';

const manrope = Manrope({ subsets: ['latin'], display: 'swap' });

export const viewport: Viewport = siteViewport;
export const metadata: Metadata = createSiteMetadata(siteSeoConfig);

export default function MarketingLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="en" suppressHydrationWarning data-scroll-behavior="smooth">
      <body className={manrope.className}>
        <ThemeProvider
          attribute="class"
          defaultTheme="system"
          enableSystem
          disableTransitionOnChange
        >
          {process.env.NODE_ENV === 'development' && <ServiceWorkerUnregister />}
          <AuthProvider>
            <ToastProvider>
              <div className={styles.site}>
                <a href="#main-content" className={styles.skipLink}>Skip to content</a>
                <MarketingHeader />
                <main id="main-content" tabIndex={-1} className={styles.main}>{children}</main>
                <MarketingFooter />
              </div>
            </ToastProvider>
          </AuthProvider>
        </ThemeProvider>
      </body>
    </html>
  );
}
