import { ImageResponse } from 'next/og';
import { brandLogoSrc } from '@/lib/brand-image';
import { siteProfile } from '@/lib/site-profile';

export const alt = 'Site preview';
export const size = {
  width: 1200,
  height: 630,
};
export const contentType = 'image/png';

export default function OpenGraphImage() {
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
          background:
            'linear-gradient(135deg, rgba(38,132,255,1) 0%, rgba(13,148,136,1) 100%)',
          color: 'white',
        }}
      >
        <div
          style={{
            display: 'flex',
            alignItems: 'center',
            gap: '18px',
            fontSize: 34,
            fontWeight: 700,
            letterSpacing: '-0.04em',
          }}
        >
          <div
            style={{
              width: '64px',
              height: '64px',
              borderRadius: '18px',
              background: 'white',
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
              overflow: 'hidden',
            }}
          >
            {/* ImageResponse renders HTML images directly. */}
            {/* eslint-disable-next-line @next/next/no-img-element */}
            <img src={brandLogoSrc} alt="" width={96} height={96} style={{ flexShrink: 0 }} />
          </div>
          <span>{siteProfile.siteName}</span>
        </div>

        <div style={{ display: 'flex', flexDirection: 'column', gap: '18px', maxWidth: '920px' }}>
          <div style={{ fontSize: 72, lineHeight: 1.05, fontWeight: 800, letterSpacing: '-0.06em' }}>
            Search your call recordings like an archive, not a folder dump.
          </div>
          <div style={{ fontSize: 30, lineHeight: 1.35, opacity: 0.92 }}>
            {`${siteProfile.siteTagline} for Samsung users and anyone with folder-based recordings.`}
          </div>
        </div>
      </div>
    ),
    size
  );
}
