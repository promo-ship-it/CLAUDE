import { SITE } from "@/lib/config";
import { formatCents } from "@/lib/format";
import {
  CHECK_IN_TIME,
  CHECK_OUT_TIME,
  DAMAGE_MAX_CENTS,
  DAMAGE_NOTICE_HOURS,
  DEPOSIT_PLACE_DAYS_BEFORE,
  DEPOSIT_RELEASE_DAYS,
  DEPOSIT_TIERS,
  PET_FEE_CENTS,
  SMOKING_FEE_CENTS,
  GRACE_MIN_DAYS_BEFORE_CHECKIN,
  LONG_STAY_DISCOUNT_PERCENT,
  LONG_STAY_NIGHTS,
  LONG_TERM_FULL_REFUND_DAYS,
  LONG_TERM_NOTICE_NIGHTS,
  MODERATE_FULL_REFUND_DAYS,
  MODERATE_GRACE_HOURS,
  NON_REFUNDABLE_DISCOUNT_PERCENT,
  NON_REFUNDABLE_GRACE_HOURS,
  NON_REFUNDABLE_MAX_DAYS_TO_CHECKOUT,
  NON_REFUNDABLE_MIN_DAYS_BEFORE_CHECKIN,
  TERMS_VERSION
} from "@/lib/policy";

/** "$350" for one tier; otherwise "$350 for stays of 1–6 nights, $500 for 7+ nights". */
function depositDescription(): string {
  const tiers = [...DEPOSIT_TIERS].filter((t) => t.cents > 0).sort((a, b) => a.minNights - b.minNights);
  if (tiers.length === 0) return "";
  if (tiers.length === 1 && tiers[0].minNights <= 1) return formatCents(tiers[0].cents);
  return tiers
    .map((t, i) => {
      const next = tiers[i + 1];
      const range = next
        ? next.minNights - 1 === t.minNights
          ? `${t.minNights} night${t.minNights === 1 ? "" : "s"}`
          : `${t.minNights}–${next.minNights - 1} nights`
        : `${t.minNights}+ nights`;
      return `${formatCents(t.cents)} for stays of ${range}`;
    })
    .join(", ");
}

// DRAFT — have a lawyer review before launch. Every number below comes from
// src/lib/policy.ts, which is also what the refund calculator uses, so the
// terms and the actual refunds can't drift apart.
export default function TermsPage() {
  return (
    <div className="max-w-3xl mx-auto px-6 py-16">
      <p className="label-eyebrow mb-3">Legal</p>
      <h1 className="text-3xl md:text-4xl mb-10">Terms &amp; Conditions</h1>

      <div className="prose prose-sm text-ink/80 space-y-8">
        <section>
          <h2 className="text-xl font-display mb-3">1. Booking &amp; Payment</h2>
          <ul className="list-disc list-inside space-y-2 text-sm">
            <li>By completing a booking, you (&ldquo;Guest&rdquo;) enter into a rental agreement with {SITE.name} (&ldquo;Host&rdquo;) for the specified property and dates.</li>
            <li>All prices are in USD. The total shown before you book includes the nightly rate, cleaning fee, and taxes, and is the amount you pay.</li>
            <li>For stays under {LONG_STAY_NIGHTS} nights, full payment is collected at the time of booking.</li>
            <li>For stays of {LONG_STAY_NIGHTS} nights or more, a {LONG_STAY_DISCOUNT_PERCENT}% long-stay discount applies and payment is collected monthly: the first payment (first 30 nights plus the cleaning fee) at booking, then automatic payments on the dates shown in your payment schedule. By booking a long stay, you authorize these charges to the card you provide. Billing stops automatically after the final payment.</li>
            <li>Your card is saved securely by our payment processor (Stripe) for the scheduled payments and for any charges described in Section 5.</li>
            <li>Prepaid cards are not accepted.</li>
            <li>Bookings are confirmed only after successful payment (or host approval in Request-to-Book mode).</li>
          </ul>
        </section>

        <section>
          <h2 className="text-xl font-display mb-3">2. Cancellation Policy</h2>
          <p className="text-sm mb-3">
            &ldquo;Days before check-in&rdquo; means calendar days before the check-in date. The policy that applies is the one shown when you booked and in your confirmation email.
          </p>

          <h3 className="text-base font-display mb-2">Standard rate — Moderate (stays under {LONG_STAY_NIGHTS} nights)</h3>
          <ul className="list-disc list-inside space-y-2 text-sm mb-4">
            <li><strong>Grace period:</strong> full refund if you cancel within {MODERATE_GRACE_HOURS} hours of booking, as long as check-in is at least {GRACE_MIN_DAYS_BEFORE_CHECKIN} days away.</li>
            <li><strong>{MODERATE_FULL_REFUND_DAYS} or more days before check-in:</strong> full refund.</li>
            <li><strong>Less than {MODERATE_FULL_REFUND_DAYS} days before check-in:</strong> the first night plus 50% of the remaining nights are non-refundable; the rest is refunded. The cleaning fee and taxes are refunded in the same proportion.</li>
            <li><strong>After check-in:</strong> nights already stayed plus one additional night are non-refundable, and 50% of the remaining unused nights are refunded.</li>
          </ul>

          <h3 className="text-base font-display mb-2">Non-refundable rate (stays under {LONG_STAY_NIGHTS} nights)</h3>
          <ul className="list-disc list-inside space-y-2 text-sm mb-4">
            <li>An optional rate {NON_REFUNDABLE_DISCOUNT_PERCENT}% below the standard nightly rate (the discount does not apply to the cleaning fee).</li>
            <li>Offered only when check-in is at least {NON_REFUNDABLE_MIN_DAYS_BEFORE_CHECKIN} days away and checkout is within {NON_REFUNDABLE_MAX_DAYS_TO_CHECKOUT} days of booking, and only when paying online.</li>
            <li><strong>Grace period:</strong> full refund if you cancel within {NON_REFUNDABLE_GRACE_HOURS} hours of booking, as long as check-in is at least {GRACE_MIN_DAYS_BEFORE_CHECKIN} days away.</li>
            <li><strong>After the grace period:</strong> no refund of any part of the booking, including the cleaning fee and taxes.</li>
          </ul>

          <h3 className="text-base font-display mb-2">Long stays — Firm ({LONG_STAY_NIGHTS}+ nights)</h3>
          <ul className="list-disc list-inside space-y-2 text-sm mb-4">
            <li><strong>{LONG_TERM_FULL_REFUND_DAYS} or more days before check-in:</strong> full refund.</li>
            <li><strong>Less than {LONG_TERM_FULL_REFUND_DAYS} days before check-in, or during the stay:</strong> you owe the nights already stayed plus {LONG_TERM_NOTICE_NIGHTS} additional nights (or the rest of the stay, if fewer nights remain), plus the cleaning fee and applicable taxes. Remaining scheduled payments stop. Anything you have paid beyond that is refunded; if you have paid less, the difference is charged to your card on file.</li>
          </ul>

          <h3 className="text-base font-display mb-2">All bookings</h3>
          <ul className="list-disc list-inside space-y-2 text-sm">
            <li>Cancel any time from the link in your booking email; the exact refund is shown before you confirm.</li>
            <li>If the Host cancels, you receive a full refund.</li>
            <li>Refunds are returned to the original card, usually within 5–10 business days.</li>
          </ul>
        </section>

        <section>
          <h2 className="text-xl font-display mb-3">3. Check-In &amp; Check-Out</h2>
          <ul className="list-disc list-inside space-y-2 text-sm">
            <li>Check-in time: {CHECK_IN_TIME} (or as specified in the property listing).</li>
            <li>Check-out time: {CHECK_OUT_TIME} (or as specified in the property listing).</li>
            <li>Early check-in or late check-out may be available upon request but is not guaranteed.</li>
            <li>Keys/access codes will be provided prior to arrival via email or message.</li>
          </ul>
        </section>

        <section>
          <h2 className="text-xl font-display mb-3">4. House Rules</h2>
          <ul className="list-disc list-inside space-y-2 text-sm">
            <li>Each property has specific house rules that are displayed on the property page and must be followed during your stay.</li>
            <li>Violation of house rules may result in immediate termination of your stay without refund.</li>
            <li>Maximum occupancy must not be exceeded. Only registered guests are permitted to stay overnight.</li>
            <li>Quiet hours are observed from 10:00 PM to 8:00 AM unless otherwise noted.</li>
          </ul>
        </section>

        <section>
          <h2 className="text-xl font-display mb-3">5. Property Care &amp; Damages</h2>
          <ul className="list-disc list-inside space-y-2 text-sm">
            <li>Guest agrees to treat the property and its contents with reasonable care.</li>
            <li>Guest is responsible for any damage to the property, furnishings, appliances, or linens beyond normal wear and tear.</li>
            <li>If damage is discovered after check-out, Host will email Guest a description, the amount, and photos at least {DAMAGE_NOTICE_HOURS} hours before charging. Guest authorizes Host to then charge the payment method on file for the reasonable cost of repair or replacement, up to a maximum of {formatCents(DAMAGE_MAX_CENTS)} per booking in total. Guest can respond during that time through the messaging system.</li>
            <li>If the payment method on file can&apos;t be charged, or there isn&apos;t one, Guest will be emailed a secure payment link. Host may also ask Guest to save a card for this purpose; nothing is charged when a card is saved.</li>
            {depositDescription() && (
              <li>
                <strong>Security hold:</strong> for bookings paid online, a refundable authorization hold of {depositDescription()} is placed on Guest&apos;s card {DEPOSIT_PLACE_DAYS_BEFORE} day{DEPOSIT_PLACE_DAYS_BEFORE === 1 ? "" : "s"} before check-in. It is not a charge. For longer stays the hold is renewed automatically before it expires. It is released {DEPOSIT_RELEASE_DAYS} days after check-out, or when Host closes any damage claim, whichever is later. Damage charges under this Section are taken from the hold first, and any remainder is charged as described above. If the hold can&apos;t be placed, Guest will be emailed a link to provide a working card, and Host may withhold check-in instructions until a hold is in place.
              </li>
            )}
            <li>Guest agrees to report any damage or maintenance issues immediately via the messaging system or by contacting the Host directly.</li>
            <li>Smoking inside any property is strictly prohibited. A {formatCents(SMOKING_FEE_CENTS)} cleaning surcharge will be assessed if evidence of smoking is found.</li>
            <li>Unauthorized pets may result in a {formatCents(PET_FEE_CENTS)} cleaning surcharge.</li>
          </ul>
        </section>

        <section>
          <h2 className="text-xl font-display mb-3">6. Liability &amp; Safety</h2>
          <ul className="list-disc list-inside space-y-2 text-sm">
            <li>Host provides the property in a clean, safe, and habitable condition. Guest acknowledges that they use the property at their own risk.</li>
            <li>Host is not liable for personal injury, illness, theft, or loss of personal belongings during the stay.</li>
            <li>Guest is responsible for supervising children and ensuring the safety of all members of their party.</li>
            <li>Guest should familiarize themselves with emergency exits, fire extinguishers, and first-aid supplies upon arrival.</li>
          </ul>
        </section>

        <section>
          <h2 className="text-xl font-display mb-3">7. Privacy &amp; Communication</h2>
          <ul className="list-disc list-inside space-y-2 text-sm">
            <li>Guest information (name, email, phone) is collected solely for booking management and communication purposes.</li>
            <li>Card details are handled by Stripe and are never stored on this website.</li>
            <li>Guest may receive booking-related emails including confirmations, reminders, and post-stay follow-ups.</li>
            <li>Guest information is never sold to third parties.</li>
            <li>The messaging feature is for stay-related communication only.</li>
          </ul>
        </section>

        <section>
          <h2 className="text-xl font-display mb-3">8. Force Majeure</h2>
          <ul className="list-disc list-inside space-y-2 text-sm">
            <li>Neither party shall be liable for failure to perform due to circumstances beyond their reasonable control, including natural disasters, government actions, pandemics, or utility failures.</li>
            <li>In such cases, Host will offer either alternative dates or a full refund at Guest&apos;s choice, regardless of the rate booked.</li>
          </ul>
        </section>

        <section>
          <h2 className="text-xl font-display mb-3">9. Dispute Resolution</h2>
          <ul className="list-disc list-inside space-y-2 text-sm">
            <li>Any disputes arising from a booking shall first be addressed directly between Guest and Host via the messaging system.</li>
            <li>If a resolution cannot be reached within 14 days, either party may pursue mediation or small claims court in the jurisdiction where the property is located.</li>
          </ul>
        </section>

        <section>
          <h2 className="text-xl font-display mb-3">10. Modifications</h2>
          <ul className="list-disc list-inside space-y-2 text-sm">
            <li>Host may update these terms at any time. Changes apply only to bookings made after the update.</li>
            <li>The terms in effect at the time of booking govern that booking. The version you accepted is recorded with your booking.</li>
          </ul>
        </section>

        <section className="rule pt-6">
          <p className="text-xs text-ink/40">
            Version {TERMS_VERSION}. By completing a booking on {SITE.name}, you acknowledge that you have read, understood, and agree to these Terms &amp; Conditions.
          </p>
        </section>
      </div>
    </div>
  );
}
