// Client-safe formatting helpers — no server-only imports (Prisma etc),
// so this can be imported from both client and server components.
// The one place currency formatting happens. Whole dollars show as "$90";
// anything with cents shows them ("$68.85") so charges and refunds are exact.
export function formatCents(cents: number): string {
  const whole = Math.round(cents) % 100 === 0;
  return (Math.round(cents) / 100).toLocaleString("en-US", {
    style: "currency",
    currency: "USD",
    minimumFractionDigits: whole ? 0 : 2,
    maximumFractionDigits: whole ? 0 : 2
  });
}
