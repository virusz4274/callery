import { ImageResponse } from 'next/og';
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
        <div style={{ fontSize: 32, fontWeight: 700 }}>{siteProfile.siteName}</div>
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
