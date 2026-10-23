import { ImageResponse } from 'next/og';

export const runtime = 'edge';
export const alt = 'Viral AI Clipper — turn one video into ten viral clips';
export const size = { width: 1200, height: 630 };
export const contentType = 'image/png';

export default function OgImage() {
  return new ImageResponse(
    (
      <div style={{ width: '100%', height: '100%', display: 'flex', flexDirection: 'column', justifyContent: 'center', padding: 80, background: '#0A0A0F', color: '#fff', fontFamily: 'sans-serif' }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 20, marginBottom: 40 }}>
          <div style={{ width: 72, height: 72, borderRadius: 18, background: '#C6FF3D', display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: 44, color: '#0A0A0F' }}>⚡</div>
          <div style={{ fontSize: 40, fontWeight: 800 }}>Viral AI Clipper</div>
        </div>
        <div style={{ fontSize: 76, fontWeight: 800, lineHeight: 1.05, display: 'flex', flexWrap: 'wrap' }}>
          Turn one video into&nbsp;<span style={{ color: '#C6FF3D' }}>ten clips</span>&nbsp;that go viral.
        </div>
        <div style={{ fontSize: 30, color: '#B9B9C8', marginTop: 36 }}>Hooks, captions and viral scores for TikTok, Reels and Shorts.</div>
      </div>
    ),
    size,
  );
}
