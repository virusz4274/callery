import { brandLogoSrc } from '@/lib/brand-image';

/** Kept in HTML styles supported by the metadata image renderer. */
export function MarketingSocialPreview() {
  return (
    <div style={{ width: '100%', height: '100%', display: 'flex', flexDirection: 'column', justifyContent: 'space-between', padding: '52px 60px', background: '#f6f8fc', color: '#152541' }}>
      <div style={{ display: 'flex', alignItems: 'center', gap: 12, fontSize: 30, fontWeight: 700 }}>
        {/* The metadata renderer uses HTML images directly. */}
        {/* eslint-disable-next-line @next/next/no-img-element */}
        <img src={brandLogoSrc} alt="" width={60} height={60} />
        <span>Callery</span>
      </div>
      <div style={{ display: 'flex', alignItems: 'center', gap: 64, paddingBottom: 32 }}>
        <div style={{ display: 'flex', flexDirection: 'column', width: 600, gap: 26 }}>
          <div style={{ fontSize: 68, lineHeight: 1.08, fontWeight: 700, letterSpacing: '-3px' }}>Find the details in your recorded calls.</div>
          <div style={{ fontSize: 25, lineHeight: 1.5, color: '#52637a' }}>Your recordings, transcripts, and summaries. Together and searchable.</div>
        </div>
        <div style={{ width: 390, display: 'flex', flexDirection: 'column', padding: 28, background: '#ffffff', border: '1px solid #dce3ee', borderRadius: 18 }}>
          <div style={{ display: 'flex', fontSize: 18, color: '#52637a', paddingBottom: 24 }}>Example call</div>
          <div style={{ display: 'flex', fontSize: 25, fontWeight: 700 }}>Delivery confirmation</div>
          <div style={{ display: 'flex', flexDirection: 'column', gap: 14, marginTop: 24, padding: 22, borderRadius: 10, background: '#eaf0ff' }}>
            <div style={{ display: 'flex', fontSize: 16, color: '#245be8' }}>Summary</div>
            <div style={{ display: 'flex', fontSize: 26, lineHeight: 1.4 }}>Order 248 arrives Friday before noon.</div>
          </div>
          <div style={{ display: 'flex', marginTop: 24, color: '#52637a', fontSize: 17 }}>Original audio included</div>
        </div>
      </div>
    </div>
  );
}
