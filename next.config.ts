
import type {NextConfig} from 'next';

const nextConfig: NextConfig = {
  /* config options here */
  typescript: {
    ignoreBuildErrors: true,
  },
  webpack: (config, { isServer, nextRuntime }) => {
    // For the middleware, which runs in the Edge Runtime, we need to
    // tell webpack to ignore the 'os' module, which is not available.
    if (nextRuntime === 'nodejs' && config.resolve) {
      if (Array.isArray(config.resolve.alias)) {
        config.resolve.alias.push({ name: 'os', alias: false });
      } else if (config.resolve.alias) {
        (config.resolve.alias as Record<string, any>)['os'] = false;
      }
    }
    
    // For client-side builds, we also provide a fallback.
    if (!isServer && config.resolve) {
        config.resolve.fallback = {
            ...config.resolve.fallback,
            os: false,
        };
    }
    return config;
  },
  async headers() {
    return [
      {
        source: '/(.*)',
        headers: [
          {
            key: 'Cross-Origin-Opener-Policy',
            value: 'same-origin-allow-popups',
          },
          {
            key: 'Cross-Origin-Embedder-Policy',
            value: 'unsafe-none',
          },
        ],
      },
    ];
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
      }
    ]
  }
}

export default nextConfig;
