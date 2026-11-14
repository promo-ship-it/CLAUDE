import { formatCents } from "@/lib/format";
import type { Quote } from "@/lib/quote";

/** Renders a server-computed quote. Never recalculates — what's shown is what's charged. */
export default function PriceBreakdown({ quote, compact = false }: { quote: Quote; compact?: boolean }) {
  const groups = Object.entries(
    quote.nightlyRates.reduce((acc: Record<number, number>, r) => ((acc[r] = (acc[r] || 0) + 1), acc), {})
  )
    .map(([rate, count]) => ({ rate: Number(rate), count: count as number }))
    .sort((a, b) => b.rate - a.rate);

  return (
    <div className="text-sm space-y-1 font-mono">
      {groups.map((g) => (
        <div key={g.rate} className="flex justify-between text-ink/60">
          <span>
            {formatCents(g.rate)} × {g.count} night{g.count > 1 ? "s" : ""}
          </span>
          <span>{formatCents(g.rate * g.count)}</span>
        </div>
      ))}
      {groups.length > 1 && (
        <div className="flex justify-between">
          <span className="text-ink/60">Nightly subtotal ({quote.nights} nights)</span>
          <span>{formatCents(quote.baseSubtotal)}</span>
        </div>
      )}
      {quote.discountAmount > 0 && (
        <div className="flex justify-between text-sage">
          <span>{quote.discountLabel}</span>
          <span>−{formatCents(quote.discountAmount)}</span>
        </div>
      )}
      {quote.cleaningFee > 0 && (
        <div className="flex justify-between text-ink/60">
          <span>Cleaning fee</span>
          <span>{formatCents(quote.cleaningFee)}</span>
        </div>
      )}
      {quote.taxTotal > 0 && (
        <div className="flex justify-between text-ink/60">
          <span>Taxes</span>
          <span>{formatCents(quote.taxTotal)}</span>
        </div>
      )}
      <div className="flex justify-between pt-2 rule font-semibold">
        <span>Total</span>
        <span>{formatCents(quote.total)}</span>
      </div>

      {quote.schedule && !compact && (
        <div className="pt-3 mt-2 rule space-y-1">
          <p className="text-[11px] text-ink/50 uppercase tracking-wide">Payment schedule</p>
          {quote.schedule.map((p) => (
            <div key={p.label} className="flex justify-between text-xs text-ink/70 gap-4">
              <span>
                {p.label} <span className="text-ink/40">· {p.due === "At booking" ? "at booking" : `on ${p.due}`}</span>
              </span>
              <span>{formatCents(p.amount)}</span>
            </div>
          ))}
        </div>
      )}
      {quote.schedule && compact && (
        <p className="text-xs text-ink/50 pt-1">
          Billed monthly: {formatCents(quote.schedule[0].amount)} today, then {quote.schedule.length - 1} more payment
          {quote.schedule.length - 1 === 1 ? "" : "s"}.
        </p>
      )}
    </div>
  );
}
