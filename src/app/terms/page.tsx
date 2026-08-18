import { SITE } from "@/lib/config";

export default function TermsPage() {
  return (
    <div className="max-w-3xl mx-auto px-6 py-16">
      <p className="label-eyebrow mb-3">Legal</p>
      <h1 className="text-3xl md:text-4xl mb-10">Terms & Conditions</h1>

      <div className="prose prose-sm text-ink/80 space-y-8">
        <section>
          <h2 className="text-xl font-display mb-3">1. Booking & Payment</h2>
          <ul className="list-disc list-inside space-y-2 text-sm">
            <li>By completing a booking, you ("Guest") enter into a rental agreement with {SITE.name} ("Host") for the specified property and dates.</li>
            <li>All prices are displayed in USD and include applicable taxes and fees unless otherwise stated.</li>
            <li>For stays under 30 nights, full payment is collected at the time of booking.</li>
            <li>For stays of 30 nights or more, payment is collected monthly via automatic recurring charges to the payment method on file. By booking, you authorize these recurring charges for the duration of your stay.</li>
            <li>A cleaning fee is charged once per stay and is non-refundable after confirmation.</li>
            <li>Bookings are confirmed only after successful payment (or host approval in Request-to-Book mode).</li>
          </ul>
        </section>

        <section>
          <h2 className="text-xl font-display mb-3">2. Cancellation Policy</h2>
          <ul className="list-disc list-inside space-y-2 text-sm">
            <li><strong>More than 14 days before check-in:</strong> Full refund minus a $50 processing fee.</li>
            <li><strong>7–14 days before check-in:</strong> 50% refund of the nightly rate; cleaning fee non-refundable.</li>
            <li><strong>Less than 7 days before check-in:</strong> No refund.</li>
            <li><strong>Monthly stays:</strong> Guest may cancel with 30 days written notice. Payments already charged are non-refundable. The remaining billing cycle will not be charged.</li>
            <li>If the Host cancels, Guest receives a full refund.</li>
          </ul>
        </section>

        <section>
          <h2 className="text-xl font-display mb-3">3. Check-In & Check-Out</h2>
          <ul className="list-disc list-inside space-y-2 text-sm">
            <li>Check-in time: 3:00 PM (or as specified in the property listing).</li>
            <li>Check-out time: 11:00 AM (or as specified in the property listing).</li>
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
          <h2 className="text-xl font-display mb-3">5. Property Care & Damages</h2>
          <ul className="list-disc list-inside space-y-2 text-sm">
            <li>Guest agrees to treat the property and its contents with reasonable care.</li>
            <li>Guest is responsible for any damage to the property, furnishings, appliances, or linens beyond normal wear and tear.</li>
            <li>If damage is discovered after check-out, Guest authorizes Host to charge the payment method on file for the reasonable cost of repair or replacement, up to a maximum of $2,500.</li>
            <li>Guest agrees to report any damage or maintenance issues immediately via the messaging system or by contacting the Host directly.</li>
            <li>Smoking inside any property is strictly prohibited. A $500 cleaning surcharge will be assessed if evidence of smoking is found.</li>
            <li>Unauthorized pets may result in a $250 cleaning surcharge.</li>
          </ul>
        </section>

        <section>
          <h2 className="text-xl font-display mb-3">6. Liability & Safety</h2>
          <ul className="list-disc list-inside space-y-2 text-sm">
            <li>Host provides the property in a clean, safe, and habitable condition. Guest acknowledges that they use the property at their own risk.</li>
            <li>Host is not liable for personal injury, illness, theft, or loss of personal belongings during the stay.</li>
            <li>Guest is responsible for supervising children and ensuring the safety of all members of their party.</li>
            <li>Guest should familiarize themselves with emergency exits, fire extinguishers, and first-aid supplies upon arrival.</li>
          </ul>
        </section>

        <section>
          <h2 className="text-xl font-display mb-3">7. Privacy & Communication</h2>
          <ul className="list-disc list-inside space-y-2 text-sm">
            <li>Guest information (name, email, phone) is collected solely for booking management and communication purposes.</li>
            <li>Guest may receive booking-related emails including confirmations, reminders, and post-stay follow-ups.</li>
            <li>Guest information is never sold to third parties.</li>
            <li>The messaging feature is for stay-related communication only.</li>
          </ul>
        </section>

        <section>
          <h2 className="text-xl font-display mb-3">8. Force Majeure</h2>
          <ul className="list-disc list-inside space-y-2 text-sm">
            <li>Neither party shall be liable for failure to perform due to circumstances beyond their reasonable control, including natural disasters, government actions, pandemics, or utility failures.</li>
            <li>In such cases, Host will offer either alternative dates or a full refund at Guest's choice.</li>
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
            <li>Host reserves the right to update these terms at any time. Changes take effect for bookings made after the update date.</li>
            <li>The terms in effect at the time of booking govern that booking.</li>
          </ul>
        </section>

        <section className="rule pt-6">
          <p className="text-xs text-ink/40">
            Last updated: August 2026. By completing a booking on {SITE.name}, you acknowledge that you have read, understood, and agree to these Terms & Conditions.
          </p>
        </section>
      </div>
    </div>
  );
}
