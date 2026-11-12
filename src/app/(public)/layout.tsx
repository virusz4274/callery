import { AuthProvider } from '@/lib/auth/client';
import type { Metadata, Viewport } from 'next';
import { Inter } from 'next/font/google';
import '../globals.css';
import { PublicHeader } from '@/components/public-header';
import styles from '@/components/marketing/marketing-shell.module.css';
import { ThemeProvider } from '@/components/theme-provider';
import { ToastProvider } from '@/components/toast-provider';
import { ServiceWorkerUnregister } from '@/components/service-worker-unregister';
import { createSiteMetadata, siteSeoConfig, siteViewport } from '@/lib/seo';
import { documentationHref, marketingPageHref, publicSitePolicy } from '@/lib/public-site-policy';

const inter = Inter({ subsets: ['latin'], display: 'swap' });

export const viewport: Viewport = siteViewport;
export const metadata: Metadata = createSiteMetadata(siteSeoConfig);
export const dynamic = 'force-dynamic';

/** Public account services belong to this app, independently of the Astro website. */
export default function PublicAppLayout({ children }: Readonly<{ children: React.ReactNode }>) {
  const { supportHref, marketingHref } = publicSitePolicy();
  const privacyHref = marketingPageHref('/privacy-policy');
  const termsHref = marketingPageHref('/terms-of-service');
  const updatesHref = marketingPageHref('/changelog');
  return (
    <html lang="en" suppressHydrationWarning data-scroll-behavior="smooth">
      <body className={inter.className}>
        <ThemeProvider attribute="class" defaultTheme="system" enableSystem disableTransitionOnChange>
          {process.env.NODE_ENV === 'development' && <ServiceWorkerUnregister />}
          <AuthProvider>
            <ToastProvider>
              <div className={styles.site}>
                <a href="#main-content" className={styles.skipLink}>Skip to content</a>
                <PublicHeader />
                <main id="main-content" tabIndex={-1} className={styles.main}>{children}</main>
                <footer className="border-t border-border bg-surface px-5 py-8 text-sm text-muted">
                  <nav aria-label="App information" className="mx-auto flex max-w-6xl flex-wrap items-center gap-x-6 gap-y-3">
                    <a href={documentationHref('integration-api')}>Documentation</a>
                    <a href={supportHref}>Support</a>
                    {privacyHref && <a href={privacyHref}>Privacy</a>}
                    {termsHref && <a href={termsHref}>Terms</a>}
                    {updatesHref && <a href={updatesHref}>Updates</a>}
                    {marketingHref && <a href={marketingHref}>Callery website</a>}
                    <a href={documentationHref('setup-guide')}>Self-hosting guide</a>
                  </nav>
                </footer>
              </div>
            </ToastProvider>
          </AuthProvider>
        </ThemeProvider>
      </body>
    </html>
  );
}
