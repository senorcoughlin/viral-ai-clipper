import LegalPage from '../../components/LegalPage';
export const metadata = { title: 'Terms of Service – Viral AI Clipper' };
const EMAIL = 'senorcoughlin@gmail.com';
export default function Terms() {
  return (
    <LegalPage title="Terms of Service" updated="October 24, 2026">
      <p>By using Viral AI Clipper at viralaiclipper.com (the “Service”), you agree to these Terms.</p>
      <h2>The Service</h2>
      <p>Viral AI Clipper uses AI to turn long videos into short clips with captions, and can optionally upload clips you choose to your YouTube channel.</p>
      <h2>Your account</h2>
      <p>You are responsible for activity under your account and for keeping access to your email secure. You must be at least 13 years old (or the minimum age in your country).</p>
      <h2>Your content and rights</h2>
      <ul>
        <li>You may only clip content you own or have permission to use. You retain whatever rights you have in content you submit and the clips you create; we claim no ownership.</li>
        <li>You must respect copyright and other laws, and comply with the <a href="https://www.youtube.com/t/terms">YouTube Terms of Service</a> and community guidelines.</li>
        <li>You grant us a limited license to process your content solely to provide the Service.</li>
        <li>We may remove content or suspend accounts that infringe rights or violate these Terms. Copyright notices can be sent to the contact below.</li>
      </ul>
      <h2>Acceptable use</h2>
      <p>Do not misuse the Service, including attempting to bypass limits, abuse, reverse engineer, overload, or use it for unlawful, harmful, or spam content.</p>
      <h2>Payments</h2>
      <p>Subscriptions and credit top-ups are processed by Stripe. Subscriptions renew automatically until cancelled; you can cancel anytime and keep access until the end of the paid period. Except where required by law, payments are non-refundable. Prices may change with notice.</p>
      <h2>Third-party services</h2>
      <p>The Service relies on third parties (such as YouTube, Google, Stripe, and our processing providers). Your use of YouTube features is also subject to Google’s terms and <a href="https://policies.google.com/privacy">Privacy Policy</a>.</p>
      <h2>Disclaimers</h2>
      <p>The Service is provided “as is” without warranties. AI output may be imperfect, and we do not guarantee views, revenue, or monetization results.</p>
      <h2>Limitation of liability</h2>
      <p>To the fullest extent permitted by law, our total liability is limited to the amount you paid us in the 12 months before the claim, and we are not liable for indirect or consequential damages.</p>
      <h2>Termination</h2>
      <p>You may stop using the Service at any time. We may suspend or end access for violations of these Terms.</p>
      <h2>Changes</h2>
      <p>We may update these Terms; continued use means you accept the updated version.</p>
      <h2>Contact</h2>
      <p><a href={`mailto:${EMAIL}`}>{EMAIL}</a> · See also our <a href="/privacy">Privacy Policy</a>.</p>
    </LegalPage>
  );
}
