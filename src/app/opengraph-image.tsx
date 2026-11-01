import { ImageResponse } from 'next/og';
import { MarketingSocialPreview } from '@/components/marketing/social-preview';

export const alt = 'Callery: Find the details in your recorded calls.';
export const size = { width: 1200, height: 630 };
export const contentType = 'image/png';

export default function OpenGraphImage() {
  return new ImageResponse(<MarketingSocialPreview />, size);
}
