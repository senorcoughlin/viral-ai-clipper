import SimpleHeader from '../../components/SimpleHeader';
import FeedbackForm from '../../components/FeedbackForm';
export const metadata = { title: 'Feedback – Viral AI Clipper', description: 'Tell us what to fix or build next.' };
export default function Feedback() {
  return (
    <main className="min-h-screen bg-ink text-fg">
      <SimpleHeader />
      <section className="mx-auto max-w-xl px-5 py-12">
        <h1 className="font-display text-3xl font-extrabold tracking-tight text-fg">Help shape Viral AI Clipper</h1>
        <p className="mt-3 text-[15px] leading-relaxed text-soft">Found a bug? Wish it did something it doesn’t? Every message is read by the person building this, and the best ideas ship fast.</p>
        <FeedbackForm />
        <p className="mt-10 text-sm text-muted"><a href="/" className="text-lime">Home</a> · <a href="/privacy" className="text-lime">Privacy</a> · <a href="/terms" className="text-lime">Terms</a></p>
      </section>
    </main>
  );
}
