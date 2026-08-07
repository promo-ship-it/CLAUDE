// Client-safe formatting helpers — no server-only imports (Prisma etc),
// so this can be imported from both client and server components.
export function formatCents(cents: number): string {
  return (cents / 100).toLocaleString("en-US", {
    style: "currency",
    currency: "USD",
    maximumFractionDigits: 0
  });
}
