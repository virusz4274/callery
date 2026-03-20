import { withSentryConfig } from '@sentry/nextjs';
import type { NextConfig } from 'next';
import './src/lib/env'; // Trigger environment validation at build time
import {
  getContentSecurityPolicyHeader,
  getFirebaseAuthHelperOrigin,
  shouldWarnAboutMissingFirebaseAuthHelper,
} from './src/lib/firebase-auth-helper-config';

const securityHeaders = [
  {
    key: 'X-Content-Type-Options',
    value: 'nosniff',
  },
  {
    key: 'Referrer-Policy',
    value: 'strict-origin-when-cross-origin',
  },
  {
    key: 'X-Frame-Options',
    value: 'DENY',
  },
  {
    key: 'Permissions-Policy',
    value: 'camera=(), microphone=(), geolocation=()',
  },
];

const contentSecurityPolicyHeader = getContentSecurityPolicyHeader();
if (contentSecurityPolicyHeader) {
  securityHeaders.push(contentSecurityPolicyHeader);
}

const firebaseAuthHelperOrigin = getFirebaseAuthHelperOrigin();
if (shouldWarnAboutMissingFirebaseAuthHelper()) {
  console.warn(
    '[next.config] Firebase auth helper rewrite disabled because FIREBASE_AUTH_HELPER_ORIGIN or NEXT_PUBLIC_FIREBASE_AUTH_DOMAIN is not configured.'
  );
}

if (process.env.NODE_ENV === 'production') {
  securityHeaders.push({
    key: 'Strict-Transport-Security',
    value: 'max-age=63072000; includeSubDomains; preload',
  });
}

const nextConfig: NextConfig = {
  output: 'standalone',
  experimental: {
    serverActions: {
      bodySizeLimit: '20mb',
    },
    proxyClientMaxBodySize: '20mb',
  },

  images: {
    remotePatterns: [
      {
        protocol: 'https' as const,
        hostname: 'placehold.co',
        port: '',
        pathname: '/**',
      },
      {
        protocol: 'https' as const,
        hostname: 'images.unsplash.com',
        port: '',
        pathname: '/**',
      },
    ],
  },
  async rewrites() {
    if (!firebaseAuthHelperOrigin) {
      return [];
    }

    return [
      {
        source: '/__/auth/:path*',
        destination: `${firebaseAuthHelperOrigin}/__/auth/:path*`,
      },
    ];
  },
  async headers() {
    return [
      {
        source: '/:path*',
        headers: securityHeaders,
      },
      {
        source: '/push-sw.js',
        headers: [
          {
            key: 'Cache-Control',
            value: 'no-cache, no-store, must-revalidate',
          },
          {
            key: 'X-Content-Type-Options',
            value: 'nosniff',
          },
        ],
      },
      {
        source: '/manifest.json',
        headers: [
          {
            key: 'Content-Type',
            value: 'application/manifest+json; charset=UTF-8',
          },
          {
            key: 'Cache-Control',
            value: 'public, max-age=0, must-revalidate',
          },
          {
            key: 'X-Content-Type-Options',
            value: 'nosniff',
          },
        ],
      },
    ];
  },
};

export default withSentryConfig(nextConfig, {
  org: 'harisankar',
  project: 'javascript-nextjs',
  silent: !process.env.CI,
  widenClientFileUpload: true,
  webpack: {
    automaticVercelMonitors: true,
    treeshake: {
      removeDebugLogging: true,
    },
  },
});
