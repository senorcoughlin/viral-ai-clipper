import Link from 'next/link';

export const metadata = {
  title: 'Tutorial · Viral AI Clipper',
  description: 'How to turn a YouTube video into clips in four steps.',
};

const STEPS = [
  { n: '01', title: 'Paste a YouTube link', desc: 'Copy any public YouTube URL and paste it in the box on the home page. It works with long videos, Shorts, and interviews.' },
  { n: '02', title: 'Pick length and how many clips', desc: 'Choose 15, 30, or 60 seconds. Then pick 1 clip if you want it fast, or up to 8 if you want more options.' },
  { n: '03', title: 'Hit Clip and wait for the first one', desc: 'The AI finds the best moments, cuts them, and burns a caption. The first clip appears as soon as it is ready. You do not have to wait for all of them.' },
  { n: '04', title: 'Download and post', desc: 'Play the clip, hit Download, then use TikTok, Reels, Shorts, or X. The caption is copied for you. Create a free account so your clips stay saved.' },
];

export default function Tutorial() {
  return (
    <main className="mx-auto flex min-h-screen max-w-3xl flex-col gap-8 px-5 py-16">
      <Link href="/" className="text-sm text-lime hover:underline">← Back home</Link>
      <div className="flex flex-col gap-3">
        <span className="eyebrow">Tutorial</span>
        <h1 className="font-display text-4xl font-extrabold tracking-tight text-white">New here? Start here.</h1>
        <p className="text-base leading-relaxed text-soft">Four steps. No editing skills needed. Your first clip is ready in about a minute.</p>
      </div>
      <div className="grid gap-4">
        {STEPS.map(s => (
          <article key={s.n} className="card flex flex-col gap-2 p-6">
            <div className="flex items-center gap-3">
              <span className="grid h-8 w-8 place-items-center rounded-full bg-lime text-sm font-bold text-ink">{s.n}</span>
              <h2 className="font-display text-lg font-extrabold text-white">{s.title}</h2>
            </div>
            <p className="text-sm leading-relaxed text-soft">{s.desc}</p>
          </article>
        ))}
      </div>
      <div className="card flex flex-col gap-3 p-6">
        <h2 className="font-display text-lg font-extrabold text-white">Beginner tips</h2>
        <ul className="grid gap-2 text-sm text-soft">
          <li>• Start with 1 clip and 15 seconds if you want the fastest result.</li>
          <li>• Longer videos give the AI more moments to choose from.</li>
          <li>• You get a few free clips a day. Credits never expire.</li>
          <li>• Pro removes the daily cap and the watermark.</li>
          <li>• Your clips also show up on the Assets page.</li>
          <li>• The publish buttons open the app with your caption already copied.</li>
        </ul>
      </div>
      <Link href="/" className="btn-lime h-12 no-underline">Start clipping</Link>
    </main>
  );
}
