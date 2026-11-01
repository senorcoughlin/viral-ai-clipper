import LegalPage from '../../components/LegalPage';
export const metadata = { title: 'Privacy Policy – Viral AI Clipper' };
const EMAIL = 'support@viralaiclipper.com';
export default function Privacy() {
  return (
    <LegalPage title="Privacy Policy" updated="November 1, 2026">
      <p>This policy explains how Viral AI Clipper (“we”, “us”), available at viralaiclipper.com, collects, uses, and protects your information.</p>
      <h2>Information we collect</h2>
      <ul>
        <li><b>Account information:</b> your email address, used to sign you in with a one-time magic link sent by our email provider, Resend.</li>
        <li><b>Content you submit:</b> YouTube links or channels you paste, and the clips, transcripts, and settings generated from them.</li>
        <li><b>Billing information:</b> plan, credit balance, and purchase records. Card details are handled entirely by Stripe; we never see or store your full card number.</li>
        <li><b>Basic technical data:</b> IP address and usage counts used for rate limiting and abuse prevention.</li>
      </ul>
      <h2>Google user data</h2>
      <p>We do not connect to your Google or YouTube account and do not request any Google OAuth scopes. Earlier versions offered an optional YouTube upload connection; it has been removed and no YouTube tokens are used.</p>
      <h2>Where data is stored and who processes it</h2>
      <ul>
        <li><b>Upstash Redis</b> – account, session, and credit records.</li>
        <li><b>Vercel Blob</b> (private storage) and <b>Vercel</b> hosting – generated clips and the website itself.</li>
        <li><b>RenderIO</b> – downloads source video and renders clips with ffmpeg.</li>
        <li><b>Groq (Whisper)</b> – transcribes audio to create captions.</li>
        <li><b>Google Gemini</b> – analyzes transcripts to choose and score clip moments.</li>
        <li><b>Stripe</b> – processes subscriptions and credit top-ups.</li>
        <li><b>Resend</b> – delivers sign-in emails.</li>
      </ul>
      <p>These providers process data only to deliver the service to you.</p>
      <h2>Analytics, advertising and cookies</h2>
      <ul>
        <li><b>Vercel Analytics and Speed Insights</b> – privacy-friendly, cookie-less page view and performance measurement (pages visited, referrer, country, device type).</li>
        <li><b>Google Ads conversion tracking</b> – if you arrive from one of our ads, Google’s tag (gtag.js) may set cookies so we can measure whether the ad led to a sign-up, checkout or purchase. We report only the event and purchase amount to Google and never send your clip content.</li>
        <li><b>Attribution cookie</b> – a first-party cookie (<code>vac_attr</code>, 90 days) stores ad click IDs (such as <code>gclid</code>) and campaign UTM tags from the link you arrived on. They are attached to your Stripe checkout so we know which campaign led to a purchase.</li>
        <li><b>Essential cookies</b> – a signed session cookie keeps you signed in.</li>
      </ul>
      <p>You can block or delete cookies in your browser settings, and manage Google ad personalization at <a href="https://adssettings.google.com">adssettings.google.com</a>. Blocking them does not affect how the app works.</p>
      <h2>We do not sell your data</h2>
      <p>We do not sell, rent, or trade your personal information to anyone.</p>
      <h2>Retention and security</h2>
      <p>We keep data only as long as needed to provide the service. Data is transmitted over HTTPS, sessions use signed cookies, and stored files are private.</p>
      <h2>Revoking access and deleting your data</h2>
      <ul>
        <li>If you connected YouTube in an earlier version, you can remove that old access from your <a href="https://myaccount.google.com/permissions">Google Account permissions</a> page.</li>
        <li>To request deletion of your account and clips, email <a href={`mailto:${EMAIL}`}>{EMAIL}</a>. We will process requests within 30 days.</li>
      </ul>
      <h2>Children</h2>
      <p>The service is not directed to children under 13, and we do not knowingly collect their data.</p>
      <h2>Changes</h2>
      <p>We may update this policy; the date above shows the latest version.</p>
      <h2>Contact</h2>
      <p>Questions: <a href={`mailto:${EMAIL}`}>{EMAIL}</a></p>
    </LegalPage>
  );
}
