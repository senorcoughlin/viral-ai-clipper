import SimpleHeader from './SimpleHeader';
export default function LegalPage({ title, updated, children }) {
  return (
    <main className="min-h-screen bg-ink text-fg">
      <SimpleHeader />
      <article className="mx-auto max-w-3xl px-5 py-12 text-[15px] leading-relaxed text-soft [&_h2]:mt-8 [&_h2]:mb-2 [&_h2]:font-display [&_h2]:text-xl [&_h2]:font-bold [&_h2]:text-fg [&_ul]:list-disc [&_ul]:pl-6 [&_li]:mt-1 [&_p]:mt-3 [&_a]:text-lime">
        <h1 className="font-display text-3xl font-extrabold tracking-tight text-fg">{title}</h1>
        <p className="text-muted">Last updated: {updated}</p>
        {children}
        <p className="mt-10 text-muted"><a href="/">Home</a> · <a href="/privacy">Privacy Policy</a> · <a href="/terms">Terms of Service</a> · <a href="/dmca">DMCA</a></p>
      </article>
    </main>
  );
}
