import SimpleHeader from './SimpleHeader';

export const GUIDES = [
  ['/free-ai-clip-maker', 'Free AI clip maker'],
  ['/youtube-shorts-clip-maker', 'YouTube Shorts clip maker'],
  ['/podcast-to-shorts', 'Podcast to Shorts'],
  ['/how-to-clip-twitch-streams', 'How to clip Twitch streams'],
  ['/opus-clip-alternative', 'Opus Clip alternative'],
];

const SITE = 'https://viralaiclipper.com';

export function guideMetadata({ path, title, description }) {
  return {
    title,
    description,
    alternates: { canonical: path },
    openGraph: { type: 'article', url: `${SITE}${path}`, siteName: 'Viral AI Clipper', title, description },
    twitter: { card: 'summary_large_image', title, description },
  };
}

// Static long-form guide with FAQ + SoftwareApplication JSON-LD and a CTA.
export default function GuidePage({ path, h1, intro, sections, faqs }) {
  const ld = [
    {
      '@context': 'https://schema.org', '@type': 'SoftwareApplication', name: 'Viral AI Clipper', url: SITE,
      applicationCategory: 'MultimediaApplication', operatingSystem: 'Web',
      offers: [
        { '@type': 'Offer', price: '0', priceCurrency: 'USD', name: 'Free' },
        { '@type': 'Offer', price: '19.99', priceCurrency: 'USD', name: 'Pro (monthly)' },
      ],
    },
    {
      '@context': 'https://schema.org', '@type': 'FAQPage',
      mainEntity: faqs.map(([q, a]) => ({ '@type': 'Question', name: q, acceptedAnswer: { '@type': 'Answer', text: a } })),
    },
  ];
  return (
    <main className="min-h-screen bg-ink text-fg">
      <script type="application/ld+json" dangerouslySetInnerHTML={{ __html: JSON.stringify(ld) }} />
      <SimpleHeader />
      <article className="mx-auto max-w-2xl px-5 py-12">
        <p className="eyebrow">Guide</p>
        <h1 className="mt-2 font-display text-3xl font-extrabold leading-tight tracking-tight text-white md:text-[42px]">{h1}</h1>
        <p className="mt-4 text-[16px] leading-relaxed text-soft">{intro}</p>
        <Cta />
        {sections.map(([h, body]) => (
          <section key={h} className="mt-10">
            <h2 className="font-display text-2xl font-extrabold tracking-tight text-white">{h}</h2>
            {body.map((b, i) => Array.isArray(b)
              ? <ul key={i} className="mt-3 list-disc space-y-2 pl-5 text-[15px] leading-relaxed text-soft">{b.map(li => <li key={li}>{li}</li>)}</ul>
              : <p key={i} className="mt-3 text-[15px] leading-relaxed text-soft">{b}</p>)}
          </section>
        ))}
        <section className="mt-10">
          <h2 className="font-display text-2xl font-extrabold tracking-tight text-white">FAQ</h2>
          {faqs.map(([q, a]) => (
            <div key={q} className="mt-4">
              <h3 className="font-semibold text-fg">{q}</h3>
              <p className="mt-1 text-[15px] leading-relaxed text-soft">{a}</p>
            </div>
          ))}
        </section>
        <Cta />
        <nav className="mt-12 border-t border-line/60 pt-6 text-sm">
          <div className="mb-2 font-semibold text-muted">More guides</div>
          <div className="flex flex-wrap gap-x-5 gap-y-2">
            {GUIDES.filter(([p]) => p !== path).map(([p, l]) => <a key={p} href={p} className="text-lime">{l}</a>)}
            <a href="/#pricing" className="text-lime">Pricing</a>
          </div>
        </nav>
      </article>
    </main>
  );
}

function Cta() {
  return (
    <div className="mt-8 rounded-2xl border border-line2 bg-surface p-5">
      <div className="font-display text-lg font-extrabold text-white">Try it on your next video</div>
      <p className="mt-1 text-sm text-soft">Paste a YouTube link or upload an MP4. 3 free generations a day, no card needed.</p>
      <a href="/#top" className="btn-lime mt-4 inline-flex h-11 items-center px-5 no-underline">Make clips free</a>
    </div>
  );
}
