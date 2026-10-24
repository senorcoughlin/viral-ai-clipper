import LegalPage from '../../components/LegalPage';
export const metadata = { title: 'DMCA & Copyright Policy – Viral AI Clipper' };
const EMAIL = 'dmca@viralaiclipper.com';
export default function Dmca() {
  return (
    <LegalPage title="DMCA & Copyright Policy" updated="October 24, 2026">
      <p>Viral AI Clipper respects the intellectual property rights of others and expects users to clip only content they own or have permission to use. We respond to notices of alleged copyright infringement under the Digital Millennium Copyright Act (DMCA).</p>
      <h2>Filing a takedown notice</h2>
      <p>If you believe content processed or hosted by the Service infringes your copyright, email <a href={`mailto:${EMAIL}`}>{EMAIL}</a> with:</p>
      <ul>
        <li>Your physical or electronic signature.</li>
        <li>Identification of the copyrighted work you claim is infringed.</li>
        <li>Identification of the infringing material and enough information to locate it (for example, a URL or clip link).</li>
        <li>Your name, address, telephone number, and email address.</li>
        <li>A statement that you have a good-faith belief the use is not authorized by the copyright owner, its agent, or the law.</li>
        <li>A statement, under penalty of perjury, that the information in the notice is accurate and that you are the owner or authorized to act on the owner’s behalf.</li>
      </ul>
      <h2>What happens next</h2>
      <p>On receiving a valid notice we will promptly remove or disable access to the material and make a reasonable effort to notify the user who submitted it.</p>
      <h2>Counter-notification</h2>
      <p>If you believe material was removed by mistake or misidentification, send a counter-notice to <a href={`mailto:${EMAIL}`}>{EMAIL}</a> including your signature, identification of the removed material and its prior location, a statement under penalty of perjury that you have a good-faith belief it was removed by mistake, and your name, address, phone number, and consent to the jurisdiction of the federal court for your district. We may restore the material in 10–14 business days unless the complainant notifies us of a court action.</p>
      <h2>Repeat infringers</h2>
      <p>We terminate, in appropriate circumstances, the accounts of users who are repeat infringers.</p>
      <h2>Content on YouTube</h2>
      <p>Clips uploaded to YouTube are hosted by YouTube. For those, you can also use <a href="https://support.google.com/youtube/answer/2807622">YouTube’s copyright removal process</a>.</p>
    </LegalPage>
  );
}
