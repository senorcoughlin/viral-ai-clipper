import LegalPage from '../../../components/LegalPage';

export const metadata = { title: 'Monthly Raffle Official Rules', alternates: { canonical: '/raffle/rules' } };

export default function RaffleRules() {
  return (
    <LegalPage title="Monthly Raffle: Official Rules" updated="November 19, 2026">
      <p><b>NO PURCHASE OR PAYMENT OF ANY KIND IS NECESSARY TO ENTER OR WIN. A PURCHASE OR PAYMENT WILL NOT INCREASE YOUR CHANCES OF WINNING BEYOND THE ENTRIES IT PROVIDES, AND A FREE ENTRY HAS EXACTLY THE SAME CHANCE AS A PAID ENTRY. VOID WHERE PROHIBITED.</b></p>

      <h2>1. Sponsor</h2>
      <p>The Viral AI Clipper Monthly Raffle (the "Raffle") is sponsored by Nathan Coughlin, doing business as Viral AI Clipper (viralaiclipper.com) (the "Sponsor"). Contact: <a href="mailto:support@viralaiclipper.com">support@viralaiclipper.com</a>.</p>

      <h2>2. Eligibility</h2>
      <p>Open to individuals who are at least 18 years old (or the age of majority where they live, if higher) at the time of entry, where permitted by law. Void where prohibited or restricted. The Sponsor and members of the Sponsor's immediate household are not eligible. You are responsible for following the laws that apply to you.</p>

      <h2>3. Entry period</h2>
      <p>The Raffle runs every calendar month. Each monthly entry period begins at 12:00 AM Eastern Time (ET) on the first day of the month and ends at 10:00 PM ET on the last day of the month. Entries received after 10:00 PM ET on the last day count toward the next month's drawing. The Sponsor's server clock is the official timekeeper. Entries do not carry over from one month to the next.</p>

      <h2>4. How to enter</h2>
      <ul>
        <li><b>Free entry (no purchase necessary):</b> visit <a href="/raffle#free">viralaiclipper.com/raffle</a>, enter your name and email address, confirm you are 18+ and agree to these rules, and select "Get my free entry." Limit: 1 free entry per person and email address per monthly entry period.</li>
        <li><b>Paid entries:</b> on the same page, enter your name and email address and choose 1 entry for US $1 or 5 entries for US $4, paid securely through Stripe. Paid entries are counted once payment is confirmed.</li>
      </ul>
      <p>The words "entry" and "vote" mean the same thing: one chance in the drawing. Each entry, paid or free, has an equal chance of being drawn. You must give your real name and a working email address. Entries made by bots, scripts, fake or disposable identities, or any attempt to get around the limits are void, and the Sponsor may disqualify anyone who tampers with the Raffle.</p>

      <h2>5. Payments are not donations</h2>
      <p>Payments for paid entries go to the Sponsor's business. They are not charitable donations, are not tax-deductible, and are not refundable unless required by law or the Raffle is canceled. Paying does not create any other obligation or benefit.</p>

      <h2>6. Drawing</h2>
      <p>On the last day of each month, after the entry period closes at 10:00 PM ET, the Sponsor draws one winning entry at random from all eligible entries received for that month. The drawing is weighted by number of entries: a person with 5 entries is 5 times as likely to win as a person with 1 entry. The draw uses a cryptographically secure random number. The Sponsor records the random seed, the drawing time and a fingerprint of the entry list so the result can be checked. If the drawing cannot run on the last day for technical reasons, it runs as soon as possible after that and still uses only that month's entries.</p>

      <h2>7. Odds</h2>
      <p>Your odds of winning depend on the total number of eligible entries received for that month. For example, if there are 100 entries in total and you have 5, your odds are 5 in 100.</p>

      <h2>8. Prize</h2>
      <p>One prize each month: 1 month (31 days) of Viral AI Clipper Pro on the winner's email address, including unlimited clipping under Pro's fair-use limit (currently 200 generations a day) and every Pro feature available during that time. Approximate retail value: US $19.99. The prize does not renew, is never charged, cannot be exchanged for cash and cannot be transferred. If the winner already has Pro, the Sponsor may add the month to the end of their current access or give an equivalent benefit. Pro features may change over time.</p>

      <h2>9. Winner notification</h2>
      <p>The winner is notified by email at the address they entered, normally within 24 hours of the drawing, and Pro is turned on for that email address. To use it, the winner signs in at viralaiclipper.com with that email. If the winner can't be reached, doesn't meet these rules, or doesn't respond to a request to confirm eligibility within 14 days, the prize may be forfeited and an alternate winner may be drawn from the same month's entries. The Sponsor may publicly show the winner's first name and last initial.</p>

      <h2>10. Privacy</h2>
      <p>Your name and email are used to run the Raffle, contact the winner and keep a record of entries and payments, as described in our <a href="/privacy">Privacy Policy</a>. Entering does not sign you up for marketing emails.</p>

      <h2>11. General conditions</h2>
      <p>The Sponsor is not responsible for lost, late, incomplete or misdirected entries, or for technical failures. The Sponsor may cancel, change or suspend the Raffle if it cannot run as planned (for example due to fraud, technical problems or legal requirements), and in that case may draw from eligible entries received before the change. By entering, you agree to these rules and to the Sponsor's decisions, which are final. To the extent allowed by law, entrants release the Sponsor from claims arising from the Raffle or the prize. These rules are governed by the laws of the State of Georgia, USA.</p>

      <h2>12. Winner list</h2>
      <p>To ask for the name of a month's winner, email <a href="mailto:support@viralaiclipper.com">support@viralaiclipper.com</a> within 60 days after that month's drawing.</p>
    </LegalPage>
  );
}
