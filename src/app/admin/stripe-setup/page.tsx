import Link from "next/link";

export default function StripeSetupPage() {
  return (
    <div className="max-w-2xl">
      <h1 className="text-2xl mb-4">Stripe Payment Setup</h1>
      <p className="text-sm text-ink/60 mb-8">
        Follow the instructions below to connect Stripe and enable online payments.
        You can also download the guide as a document.
      </p>

      <a
        href="/stripe-setup-instructions.md"
        download="Stripe-Setup-Instructions.md"
        className="btn-primary inline-flex mb-10"
      >
        Download Setup Instructions
      </a>

      <div className="ledger-card p-6 space-y-6 text-sm">
        <div>
          <h2 className="font-display text-lg mb-2">Quick Summary</h2>
          <ol className="list-decimal list-inside space-y-2 text-ink/70">
            <li>Create a Stripe account at <a href="https://dashboard.stripe.com/register" target="_blank" className="text-brick hover:underline">dashboard.stripe.com</a></li>
            <li>Go to <strong>Developers → API keys</strong> and copy your Secret key and Publishable key</li>
            <li>Go to <strong>Developers → Webhooks → Add endpoint</strong>:
              <ul className="list-disc list-inside ml-4 mt-1 text-xs text-ink/50">
                <li>URL: <code className="bg-sand px-1">your-site.vercel.app/api/webhooks/stripe</code></li>
                <li>Events: checkout.session.completed, invoice.paid, invoice.payment_failed, customer.subscription.deleted</li>
              </ul>
            </li>
            <li>Copy the webhook <strong>Signing secret</strong> (starts with whsec_)</li>
            <li>Add all 3 keys to Vercel → Settings → Environment Variables:
              <ul className="list-disc list-inside ml-4 mt-1 text-xs text-ink/50">
                <li>STRIPE_SECRET_KEY</li>
                <li>STRIPE_PUBLISHABLE_KEY</li>
                <li>STRIPE_WEBHOOK_SECRET</li>
              </ul>
            </li>
            <li>Redeploy (edit README on GitHub)</li>
          </ol>
        </div>

        <div className="rule pt-4">
          <h3 className="font-medium mb-2">Test Card Number</h3>
          <p className="text-ink/60">Use this with TEST keys to simulate a payment:</p>
          <code className="block bg-sand p-3 rounded-card mt-2 font-mono">
            4242 4242 4242 4242
          </code>
          <p className="text-xs text-ink/40 mt-1">Any future expiry date, any 3-digit CVC</p>
        </div>
      </div>
    </div>
  );
}
