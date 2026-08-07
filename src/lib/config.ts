// Single place to rebrand the site — name, colors live in tailwind.config.ts.
export const SITE = {
  name: process.env.NEXT_PUBLIC_SITE_NAME || "Marrow & Pine Stays",
  url: process.env.NEXT_PUBLIC_SITE_URL || "http://localhost:3000",
  supportEmail: process.env.NOTIFY_EMAIL || "owner@example.com",
  paymentsEnabled: Boolean(process.env.STRIPE_SECRET_KEY)
};
