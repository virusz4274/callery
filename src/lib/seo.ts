import type { Metadata, Viewport } from 'next';
import type { PublicPlan } from '@/app/actions/plans';
import { getConfiguredPublicAppOrigin } from '@/lib/public-url';
import { siteProfile } from '@/lib/site-profile';

export const siteOrigin = getConfiguredPublicAppOrigin();

export type SiteSeoConfig = {
  siteName: string;
  siteTagline: string;
  siteDescription: string;
  supportEmail: string;
  salesEmail: string;
  twitterHandle?: string;
  xUrl?: string;
  linkedInUrl?: string;
  siteOrigin: string;
};

type SchemaNode = Record<string, unknown>;

type MarketingMetadataInput = {
  title: string;
  description: string;
  path: string;
  keywords?: string[];
  type?: 'website' | 'article';
  noIndex?: boolean;
};

const defaultRobots = {
  index: true,
  follow: true,
  googleBot: {
    index: true,
    follow: true,
    'max-snippet': -1,
    'max-image-preview': 'large' as const,
    'max-video-preview': -1,
  },
};

export const siteSeoConfig: SiteSeoConfig = {
  ...siteProfile,
  siteOrigin,
};

export function createSiteMetadata(config: SiteSeoConfig): Metadata {
  return {
    metadataBase: new URL(config.siteOrigin),
    title: {
      default: `${config.siteName}: ${config.siteTagline}`,
      template: `%s | ${config.siteName}`,
    },
    description: config.siteDescription,
    applicationName: config.siteName,
    creator: config.siteName,
    publisher: config.siteName,
    manifest: '/manifest.json',
    appleWebApp: {
      capable: true,
      statusBarStyle: 'default',
      title: config.siteName,
    },
    icons: {
      icon: '/icons/android-chrome-192x192.png',
      apple: '/icons/android-chrome-192x192.png',
      shortcut: '/icons/android-chrome-192x192.png',
    },
    referrer: 'strict-origin-when-cross-origin',
    formatDetection: {
      telephone: false,
    },
    category: 'technology',
    openGraph: {
      title: `${config.siteName}: ${config.siteTagline}`,
      description: config.siteDescription,
      siteName: config.siteName,
      url: config.siteOrigin,
      locale: 'en_US',
      type: 'website',
      images: '/opengraph-image',
    },
    twitter: {
      card: 'summary_large_image',
      title: `${config.siteName}: ${config.siteTagline}`,
      description: config.siteDescription,
      images: '/twitter-image',
      site: config.twitterHandle || undefined,
      creator: config.twitterHandle || undefined,
    },
  };
}

export const siteViewport: Viewport = {
  width: 'device-width',
  initialScale: 1,
  viewportFit: 'cover',
  themeColor: '#ffffff',
};

export function absoluteUrl(
  pathname: string,
  configOrOrigin?: Pick<SiteSeoConfig, 'siteOrigin'> | string
): string {
  const origin =
    typeof configOrOrigin === 'string'
      ? configOrOrigin
      : configOrOrigin?.siteOrigin || siteOrigin;

  return new URL(pathname, origin).toString();
}

export function createMarketingMetadata({
  config,
  title,
  description,
  path,
  keywords = [],
  type = 'website',
  noIndex = false,
}: MarketingMetadataInput & { config: SiteSeoConfig }): Metadata {
  const robots = noIndex
    ? {
        index: false,
        follow: false,
        googleBot: {
          index: false,
          follow: false,
          'max-snippet': 0,
          'max-image-preview': 'none' as const,
          'max-video-preview': 0,
        },
      }
    : defaultRobots;

  return {
    metadataBase: new URL(config.siteOrigin),
    title,
    description,
    keywords,
    alternates: {
      canonical: path,
    },
    robots,
    openGraph: {
      title,
      description,
      url: absoluteUrl(path, config),
      siteName: config.siteName,
      locale: 'en_US',
      type,
      images: '/opengraph-image',
    },
    twitter: {
      card: 'summary_large_image',
      title,
      description,
      images: '/twitter-image',
      site: config.twitterHandle || undefined,
      creator: config.twitterHandle || undefined,
    },
  };
}

export function serializeJsonLd(data: unknown): string {
  return JSON.stringify(data).replace(/</g, '\\u003c');
}

export function jsonLdGraph(...nodes: SchemaNode[]): SchemaNode {
  return {
    '@context': 'https://schema.org',
    '@graph': nodes,
  };
}

export function buildOrganizationSchema(config: SiteSeoConfig): SchemaNode {
  const sameAs = [config.xUrl, config.linkedInUrl].filter(Boolean);

  return {
    '@type': 'Organization',
    name: config.siteName,
    url: config.siteOrigin,
    logo: absoluteUrl('/icons/android-chrome-512x512.png', config),
    email: config.supportEmail,
    sameAs: sameAs.length > 0 ? sameAs : undefined,
    contactPoint: [
      {
        '@type': 'ContactPoint',
        contactType: 'customer support',
        email: config.supportEmail,
        url: absoluteUrl('/support', config),
        availableLanguage: 'English',
      },
      {
        '@type': 'ContactPoint',
        contactType: 'sales',
        email: config.salesEmail,
        url: absoluteUrl('/pricing', config),
        availableLanguage: 'English',
      },
    ],
  };
}

export function buildSoftwareApplicationSchema(
  config: SiteSeoConfig,
  {
    name,
    description,
    path,
    featureList = [],
    offers = [],
  }: {
    name: string;
    description: string;
    path: string;
    featureList?: string[];
    offers?: SchemaNode[];
  }
): SchemaNode {
  return {
    '@type': 'SoftwareApplication',
    name,
    description,
    url: absoluteUrl(path, config),
    applicationCategory: 'UtilitiesApplication',
    operatingSystem: 'Web',
    brand: {
      '@type': 'Brand',
      name: config.siteName,
    },
    featureList,
    offers: offers.length > 0 ? offers : undefined,
  };
}

export function buildFaqPageSchema(
  entries: Array<{ question: string; answer: string }>
): SchemaNode {
  return {
    '@type': 'FAQPage',
    mainEntity: entries.map((entry) => ({
      '@type': 'Question',
      name: entry.question,
      acceptedAnswer: {
        '@type': 'Answer',
        text: entry.answer,
      },
    })),
  };
}

export function buildContactPageSchema(
  config: SiteSeoConfig,
  {
    name,
    description,
  }: {
    name: string;
    description: string;
  }
): SchemaNode {
  return {
    '@type': 'ContactPage',
    name,
    description,
    url: absoluteUrl('/support', config),
    mainEntity: buildOrganizationSchema(config),
  };
}

export function buildCollectionPageSchema({
  config,
  name,
  description,
  path,
  items,
}: {
  config: SiteSeoConfig;
  name: string;
  description: string;
  path: string;
  items: Array<{ name: string; description: string; datePublished: string }>;
}): SchemaNode {
  return {
    '@type': 'CollectionPage',
    name,
    description,
    url: absoluteUrl(path, config),
    hasPart: items.map((item) => ({
      '@type': 'CreativeWork',
      name: item.name,
      description: item.description,
      datePublished: item.datePublished,
    })),
  };
}

export function buildOfferSchemas(config: SiteSeoConfig, plans: PublicPlan[]): SchemaNode[] {
  const freePlan: SchemaNode = {
    '@type': 'Offer',
    name: 'Free',
    price: '0',
    priceCurrency: 'USD',
    availability: 'https://schema.org/InStock',
    url: absoluteUrl('/pricing', config),
    seller: {
      '@type': 'Organization',
      name: config.siteName,
    },
  };

  const paidPlans = plans.map<SchemaNode>((plan) => ({
    '@type': 'Offer',
    name: plan.name,
    description: plan.description || undefined,
    price: String(plan.price),
    priceCurrency: plan.currency || 'USD',
    category: plan.interval,
    availability: 'https://schema.org/InStock',
    url: absoluteUrl('/pricing', config),
    seller: {
      '@type': 'Organization',
      name: config.siteName,
    },
  }));

  return [freePlan, ...paidPlans];
}
