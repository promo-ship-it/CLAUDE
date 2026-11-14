import { SITE } from "@/lib/config";

const EVENTS = [
  "checkout.session.completed",
  "checkout.session.expired",
  "invoice.paid",
  "invoice.payment_failed",
  "customer.subscription.deleted"
];

export default function StripeSetupPage() {
  return (
    <div className="max-w-2xl">
      <h1 className="text-2xl mb-4">Stripe Payment Setup</h1>
      <p className="text-sm text-ink/60 mb-2">
        Connect Stripe to take payments online. This also turns on the non-refundable rate and automatic monthly billing for
        stays of 30+ nights. Until then the site runs in &ldquo;Request to Book&rdquo; mode.
      </p>
      <p className="text-sm mb-8">
        Status:{" "}
        <strong className={SITE.paymentsEnabled ? "text-sage" : "text-brick"}>
          {SITE.paymentsEnabled ? "Stripe connected" : "Not connected"}
        </strong>
      </p>

      <a href="/stripe-setup-instructions.md" download="Stripe-Setup-Instructions.md" className="btn-primary inline-flex mb-10">
        Download Setup Instructions
      </a>

      <div className="ledger-card p-6 space-y-6 text-sm">
        <div>
          <h2 className="font-display text-lg mb-2">Quick Summary</h2>
          <ol className="list-decimal list-inside space-y-2 text-ink/70">
            <li>
              Create a Stripe account at{" "}
              <a href="https://dashboard.stripe.com/register" target="_blank" rel="noreferrer" className="text-brick hover:underline">
                dashboard.stripe.com
              </a>{" "}
              (start in Test mode).
            </li>
            <li>
              Go to <strong>Developers → API keys</strong> and copy your Secret key and Publishable key.
            </li>
            <li>
              Go to <strong>Developers → Webhooks → Add endpoint</strong>:
              <ul className="list-disc list-inside ml-4 mt-1 text-xs text-ink/50">
                <li>
                  URL: <code className="bg-sand px-1">{SITE.url}/api/webhooks/stripe</code>
                </li>
                <li>Events: {EVENTS.join(", ")}</li>
              </ul>
            </li>
            <li>
              Copy the webhook <strong>Signing secret</strong> (starts with whsec_). It&apos;s required — unsigned webhooks are rejected.
            </li>
            <li>
              Add all three to your host&apos;s environment variables: <code>STRIPE_SECRET_KEY</code>,{" "}
              <code>STRIPE_PUBLISHABLE_KEY</code>, <code>STRIPE_WEBHOOK_SECRET</code>.
            </li>
            <li>Redeploy.</li>
          </ol>
        </div>

        <div className="rule pt-4">
          <h3 className="font-medium mb-2">Test Card Number</h3>
          <p className="text-ink/60">Use this with TEST keys to simulate a payment:</p>
          <code className="block bg-sand p-3 rounded-card mt-2 font-mono">4242 4242 4242 4242</code>
          <p className="text-xs text-ink/40 mt-1">Any future expiry date, any 3-digit CVC</p>
        </div>

        <div className="rule pt-4">
          <h3 className="font-medium mb-2">Damage charges</h3>
          <p className="text-ink/60">
            Every guest&apos;s card is saved at checkout. After a stay, use <strong>Report damage</strong> on the booking in{" "}
            <a href="/admin/bookings" className="text-brick hover:underline">Bookings</a>: the guest is emailed the description and
            photos, and after 48 hours you can charge the saved card. If it can&apos;t be charged, the guest gets a payment link. For
            bookings without a card, use <strong>Ask guest to save a card</strong>. No extra webhook events are needed.
          </p>
        </div>
      </div>
    </div>
  );
}
