import SimpleHeader from '../../components/SimpleHeader';

export const metadata = { title: 'Clipping programs | Viral AI Clipper' };

const PROGRAMS = [
  { name: 'Whop Content Rewards', url: 'https://whop.com/content-rewards/', kind: 'Paid clipping campaigns',
    what: 'Streamers, creators and brands post campaigns that pay clippers per view for approved clips. Each campaign sets its own rate, rules and payout.' },
  { name: 'Vyro', url: 'https://vyro.com', kind: 'Paid clipping campaigns',
    what: 'A marketplace where creators and brands run clipping campaigns and pay clippers based on views. Read each campaign\u2019s rules before posting.' },
  { name: 'Streamer-run clip programs', url: null, kind: 'Direct from the streamer',
    what: 'Many big streamers run their own clip programs or clip contests, usually announced in their Discord server or on their socials. Only join through the streamer\u2019s official links, and log the terms on your Permissions page.' },
  { name: 'YouTube Partner Program', url: 'https://support.google.com/youtube/answer/72851', kind: 'Platform ad revenue',
    what: 'YouTube\u2019s revenue sharing for eligible channels. Clips only qualify when they add real value (commentary, editing, context) and you have the rights to use the footage.' },
  { name: 'YouTube Shorts monetization policies', url: 'https://support.google.com/youtube/answer/12504220', kind: 'Platform ad revenue',
    what: 'The rules for earning from Shorts. Unedited clips of other creators\u2019 content are not eligible for Shorts revenue sharing.' },
  { name: 'TikTok Creator Rewards Program', url: 'https://www.tiktok.com/creators/creator-portal/en-us/getting-paid-to-create/creator-rewards-program/', kind: 'Platform rewards',
    what: 'TikTok\u2019s program for eligible creators posting original videos over one minute. Reposted or unoriginal content doesn\u2019t qualify.' },
  { name: 'JoinBrands', url: 'https://joinbrands.com/', kind: 'Brand UGC',
    what: 'Brands hire creators for user-generated content and affiliate videos. A good way to use your editing skills on content you\u2019re fully allowed to post.' },
];

export default function ProgramsPage() {
  return (
    <main className="min-h-screen bg-ink text-fg">
      <SimpleHeader />
      <section className="mx-auto flex max-w-3xl flex-col gap-6 px-5 py-10">
        <span className="eyebrow">Get paid for clips</span>
        <h1 className="font-display text-3xl font-extrabold tracking-tight text-white md:text-[44px]">Clipping programs</h1>
        <p className="text-sm text-soft">Official ways clippers earn money. Payout rates change and are set by each program, so check the source before you start. We aren&apos;t affiliated with any of these.</p>
        <div className="flex flex-col gap-3">
          {PROGRAMS.map(p => (
            <div key={p.name} className="card flex flex-col gap-1.5 p-4">
              <div className="flex flex-wrap items-center justify-between gap-2">
                <span className="font-semibold text-white">{p.name}</span>
                <span className="text-[11px] font-semibold uppercase tracking-wide text-muted">{p.kind}</span>
              </div>
              <p className="text-sm text-soft">{p.what}</p>
              {p.url && <a href={p.url} target="_blank" rel="noreferrer" className="text-xs font-semibold text-lime">Open {new URL(p.url).hostname} →</a>}
            </div>
          ))}
        </div>
        <p className="text-xs text-muted">Read YouTube&apos;s <a className="text-lime" href="https://support.google.com/youtube/answer/1311392" target="_blank" rel="noreferrer">reused content policy</a> and <a className="text-lime" href="https://support.google.com/youtube/answer/2797370" target="_blank" rel="noreferrer">how Content ID works</a> before monetizing clips.</p>
      </section>
    </main>
  );
}
