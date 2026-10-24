import LegalPage from '../../components/LegalPage';
export const metadata = { title: 'Privacy Policy – Viral AI Clipper' };
const EMAIL = 'senorcoughlin@gmail.com';
export default function Privacy() {
  return (
    <LegalPage title="Privacy Policy" updated="October 24, 2026">
      <p>This policy explains how Viral AI Clipper (“we”, “us”), available at viralaiclipper.com, collects, uses, and protects your information.</p>
      <h2>Information we collect</h2>
      <ul>
        <li><b>Account information:</b> your email address, used to sign you in with a one-time magic link sent by our email provider, Resend.</li>
        <li><b>Google / YouTube connection:</b> if you choose to connect YouTube, we receive an OAuth token for the <code>https://www.googleapis.com/auth/youtube.upload</code> scope.</li>
        <li><b>Content you submit:</b> YouTube links or channels you paste, and the clips, transcripts, and settings generated from them.</li>
        <li><b>Billing information:</b> plan, credit balance, and purchase records. Card details are handled entirely by Stripe; we never see or store your full card number.</li>
        <li><b>Basic technical data:</b> IP address and usage counts used for rate limiting and abuse prevention.</li>
      </ul>
      <h2>How we use Google user data</h2>
      <p>We request only the <code>youtube.upload</code> scope. We use it solely to upload the specific clips you choose to post to your own YouTube channel, when you tap the post button. We do not read, modify, or delete your existing videos, and we do not access any other Google data.</p>
      <p>Viral AI Clipper’s use and transfer of information received from Google APIs to any other app will adhere to the <a href="https://developers.google.com/terms/api-services-user-data-policy">Google API Services User Data Policy</a>, including the Limited Use requirements. We do not use Google user data for advertising, do not sell it, do not use it to train AI models, and do not allow humans to read it except with your consent, for security purposes, or as required by law.</p>
      <h2>Where data is stored and who processes it</h2>
      <ul>
        <li><b>Upstash Redis</b> – account, session, credit, and connection records.</li>
        <li><b>Vercel Blob</b> (private storage) and <b>Vercel</b> hosting – generated clips and the website itself.</li>
        <li><b>RenderIO</b> – downloads source video and renders clips with ffmpeg.</li>
        <li><b>Groq (Whisper)</b> – transcribes audio to create captions.</li>
        <li><b>Google Gemini</b> – analyzes transcripts to choose and score clip moments.</li>
        <li><b>Stripe</b> – processes subscriptions and credit top-ups.</li>
        <li><b>Resend</b> – delivers sign-in emails.</li>
      </ul>
      <p>These providers process data only to deliver the service to you. Google user data (your YouTube token) is not shared with these AI or rendering providers.</p>
      <h2>We do not sell your data</h2>
      <p>We do not sell, rent, or trade your personal information to anyone.</p>
      <h2>Retention and security</h2>
      <p>We keep data only as long as needed to provide the service. Data is transmitted over HTTPS, sessions use signed cookies, and stored files are private.</p>
      <h2>Revoking access and deleting your data</h2>
      <ul>
        <li>You can revoke Viral AI Clipper’s YouTube access at any time from your <a href="https://myaccount.google.com/permissions">Google Account permissions</a> page.</li>
        <li>To request deletion of your account, clips, and stored tokens, email <a href={`mailto:${EMAIL}`}>{EMAIL}</a>. We will process requests within 30 days.</li>
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
