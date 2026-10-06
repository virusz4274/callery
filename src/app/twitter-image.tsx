import { ImageResponse } from 'next/og';
import { brandLogoSrc } from '@/lib/brand-image';
import { siteProfile } from '@/lib/site-profile';

export const alt = 'Site preview';
export const size = {
  width: 1200,
  height: 630,
};
export const contentType = 'image/png';

export default function TwitterImage() {
  return new ImageResponse(
    (
      <div
        style={{
          width: '100%',
          height: '100%',
          display: 'flex',
          flexDirection: 'column',
          justifyContent: 'space-between',
          padding: '56px',
          background: '#f8fafc',
          color: '#0f172a',
          border: '16px solid #0ea5a4',
        }}
      >
        <div style={{ display: 'flex', alignItems: 'center', gap: '18px', fontSize: 32, fontWeight: 700 }}>
          <div style={{ width: '64px', height: '64px', display: 'flex', alignItems: 'center', justifyContent: 'center', overflow: 'hidden' }}>
            {/* ImageResponse renders HTML images directly. */}
            {/* eslint-disable-next-line @next/next/no-img-element */}
            <img src={brandLogoSrc} alt="" width={96} height={96} style={{ flexShrink: 0 }} />
          </div>
          <span>{siteProfile.siteName}</span>
        </div>
        <div style={{ display: 'flex', flexDirection: 'column', gap: '18px', maxWidth: '940px' }}>
          <div style={{ fontSize: 70, lineHeight: 1.05, fontWeight: 800, letterSpacing: '-0.05em' }}>
            Turn call recordings into a searchable archive.
          </div>
          <div style={{ fontSize: 30, lineHeight: 1.35, color: '#334155' }}>
            {siteProfile.siteDescription}
          </div>
        </div>
      </div>
    ),
    size
  );
}
