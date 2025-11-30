import type {Metadata} from 'next';
import './globals.css';
import { Toaster } from "@/components/ui/toaster"
import { AppLayout } from '@/components/app-layout';
import { Suspense } from 'react';
import { ThemeProvider } from '@/components/theme-provider';


export const metadata: Metadata = {
  title: 'CallOrganizer',
  description: 'Organize, search, and manage your call recordings effortlessly.',
};

function RootLayoutContent({ children }: { children: React.ReactNode }) {
  return (
    <AppLayout>
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
        <ThemeProvider
            attribute="class"
            defaultTheme="dark"
            enableSystem
            disableTransitionOnChange
        >
          <Suspense>
            <RootLayoutContent>
              {children}
            </RootLayoutContent>
          </Suspense>
          <Toaster />
        </ThemeProvider>
      </body>
    </html>
  );
}
