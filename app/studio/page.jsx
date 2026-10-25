import Home from '../page';

export const metadata = {
  title: 'Clipping Studio · Viral AI Clipper',
  description: 'Paste links or upload a video, generate viral clips, edit them for monetization and publish to Shorts, TikTok and Reels.',
  alternates: { canonical: '/studio' },
};

export default function StudioPage() {
  return <Home studio />;
}
