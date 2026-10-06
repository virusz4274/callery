import withSerwistInit from '@serwist/next';
import { withSentryConfig } from '@sentry/nextjs/config';
import type { NextConfig } from 'next';
import {
  getContentSecurityPolicyHeader,
} from './src/lib/security-headers';

const sentryAuthToken = process.env.SENTRY_AUTH_TOKEN;
const sentryOrg = process.env.SENTRY_ORG;
const sentryProject = process.env.SENTRY_PROJECT;
const sentryUrl = process.env.SENTRY_URL;
const shouldEnableSentryBuildPlugin = Boolean(sentryAuthToken && sentryOrg && sentryProject);
const publicAppUrl = process.env.NEXT_PUBLIC_APP_URL
  ? new URL(process.env.NEXT_PUBLIC_APP_URL)
  : undefined;

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

if (process.env.NODE_ENV === 'production') {
  securityHeaders.push({
    key: 'Strict-Transport-Security',
    value: 'max-age=63072000; includeSubDomains; preload',
  });
}

const nextConfig: NextConfig = {
  output: 'standalone',
  // Allow the configured public host when developing through a tunnel.
  allowedDevOrigins: publicAppUrl ? [publicAppUrl.hostname] : undefined,
  // Bundle the S3 SDK so standalone tracing retains its checksum subpath imports.
  transpilePackages: ['@aws-sdk/client-s3', '@aws-sdk/s3-request-presigner'],
  experimental: {
    serverActions: {
      bodySizeLimit: '1mb',
      allowedOrigins: publicAppUrl ? [publicAppUrl.host] : undefined,
    },
    proxyClientMaxBodySize: '1mb',
  },

  images: {
    remotePatterns: [
      {
        protocol: 'https' as const,
        hostname: '*.googleusercontent.com',
        port: '',
        pathname: '/**',
      },
    ],
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

const sentryBuildConfig = {
  org: sentryOrg!,
  project: sentryProject!,
  authToken: sentryAuthToken!,
  url: sentryUrl,
  silent: !process.env.CI,
  // Source map upload is an operator concern. Self-hosters can opt in by setting
  // their own Sentry build env vars without changing the shared app config contract.
  widenClientFileUpload: true,
  tunnelRoute: "/monitoring",
  webpack: {
    automaticVercelMonitors: true,
    treeshake: {
      removeDebugLogging: true,
    },
  },
};

const withSerwist = withSerwistInit({
  swSrc: 'src/app/sw.ts',
  swDest: 'public/sw.js',
  disable: process.env.NODE_ENV !== 'production',
});
const pwaConfig = withSerwist(nextConfig);

export default shouldEnableSentryBuildPlugin
  ? withSentryConfig(pwaConfig, sentryBuildConfig)
  : pwaConfig;
