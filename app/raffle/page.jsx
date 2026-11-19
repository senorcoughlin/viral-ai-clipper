import SimpleHeader from '../../components/SimpleHeader';
import RaffleClient from '../../components/RaffleClient';

export const metadata = {
  title: 'Win Pro for a Month: Monthly Raffle',
  description: 'Enter the Viral AI Clipper monthly raffle to win 1 month of Pro: unlimited clipping and every Pro feature. $1 for 1 entry, $4 for 5 entries, or enter free every day. Drawn on the last day of every month.',
  alternates: { canonical: '/raffle' },
  openGraph: { title: 'Win Viral AI Clipper Pro for a month', description: 'Unlimited clipping + every Pro feature. Drawn the last day of every month. Enter from $1 or free.', url: '/raffle' },
};

export default function RafflePage() {
  return (
    <div className="relative min-h-screen overflow-hidden bg-ink">
      <div aria-hidden className="pointer-events-none absolute inset-0 bg-dots [background-size:28px_28px] opacity-60" />
      <div aria-hidden className="pointer-events-none absolute left-1/2 top-[-360px] h-[900px] w-[1100px] -translate-x-1/2 rounded-full bg-spotlight blur-2xl" />
      <div aria-hidden className="pointer-events-none absolute right-[-240px] top-[520px] h-[700px] w-[700px] rounded-full bg-spotlight-violet blur-2xl" />
      <SimpleHeader />
      <main className="relative mx-auto max-w-6xl px-5 pb-20">
        <RaffleClient />
      </main>
      <footer className="relative border-t border-[#1E1E29] bg-[#0D0D14]">
        <div className="mx-auto flex max-w-6xl flex-wrap justify-between gap-4 px-5 py-7 text-[13px] text-muted">
          <span>Viral AI Clipper © {new Date().getFullYear()}</span>
          <span className="flex flex-wrap gap-x-5 gap-y-2"><a href="/" className="hover:text-fg">Make clips</a><a href="/raffle/rules" className="hover:text-fg">Official Rules</a><a href="/terms" className="hover:text-fg">Terms</a><a href="/privacy" className="hover:text-fg">Privacy</a><a href="mailto:support@viralaiclipper.com" className="hover:text-fg">Support</a></span>
        </div>
      </footer>
    </div>
  );
}
