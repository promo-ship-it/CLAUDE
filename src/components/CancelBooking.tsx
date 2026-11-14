"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { formatCents } from "@/lib/format";

type Preview = { allowed: boolean; reason?: string; refund: number; shortfall: number; explanation: string };

/**
 * Cancel flow with a refund preview. Guests pass their booking token; in the
 * admin dashboard (no token) the host also gets a "full refund" option.
 */
export default function CancelBooking({ bookingId, token, admin = false }: { bookingId: string; token?: string; admin?: boolean }) {
  const router = useRouter();
  const [open, setOpen] = useState(false);
  const [loading, setLoading] = useState(false);
  const [preview, setPreview] = useState<{ policy: Preview; hostFullRefund?: Preview } | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [done, setDone] = useState<string | null>(null);

  const qs = token ? `?t=${encodeURIComponent(token)}` : "";

  const loadPreview = async () => {
    setOpen(true);
    setError(null);
    setLoading(true);
    try {
      const res = await fetch(`/api/bookings/${bookingId}/cancel${qs}`);
      const data = await res.json();
      if (!res.ok) setError(data.error || "Couldn't load cancellation details.");
      else setPreview(data);
    } catch {
      setError("Couldn't load cancellation details.");
    } finally {
      setLoading(false);
    }
  };

  const confirm = async (hostFullRefund: boolean) => {
    setLoading(true);
    setError(null);
    try {
      const res = await fetch(`/api/bookings/${bookingId}/cancel`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ t: token, hostFullRefund })
      });
      const data = await res.json();
      if (!res.ok) setError(data.error || "Cancellation failed.");
      else {
        setDone(`Cancelled. Refund: ${formatCents(data.refunded)}.${data.note ? ` ${data.note}` : ""}`);
        router.refresh();
      }
    } catch {
      setError("Cancellation failed. Please try again.");
    } finally {
      setLoading(false);
    }
  };

  if (done) return <p className="text-sm text-sage">{done}</p>;

  if (!open) {
    return (
      <button onClick={loadPreview} className={admin ? "text-xs text-brick hover:underline" : "btn-secondary text-sm"}>
        Cancel booking
      </button>
    );
  }

  const option = (p: Preview, label: string, hostFull: boolean) => (
    <div className="ledger-card p-4 text-left">
      <p className="text-sm font-medium">{label}</p>
      {p.allowed ? (
        <>
          <p className="text-sm mt-1">
            Refund: <span className="font-mono">{formatCents(p.refund)}</span>
            {p.shortfall > 0 && (
              <span className="text-brick"> · notice-period balance owed: {formatCents(p.shortfall)}</span>
            )}
          </p>
          <p className="text-xs text-ink/60 mt-1">{p.explanation}</p>
          <button
            onClick={() => confirm(hostFull)}
            disabled={loading}
            className="mt-3 bg-brick text-paper text-sm px-4 py-2 rounded-card hover:bg-brick/80 disabled:opacity-40"
          >
            {loading ? "Working…" : "Confirm cancellation"}
          </button>
        </>
      ) : (
        <p className="text-xs text-ink/60 mt-1">{p.reason}</p>
      )}
    </div>
  );

  return (
    <div className="space-y-3 text-left">
      {loading && !preview && <p className="text-sm text-ink/50">Calculating refund…</p>}
      {preview && option(preview.policy, admin ? "Cancel per the guest's policy" : "Cancel this booking", false)}
      {preview?.hostFullRefund && option(preview.hostFullRefund, "Cancel as host (full refund)", true)}
      {error && <p className="text-sm text-brick">{error}</p>}
      <button onClick={() => setOpen(false)} className="text-xs text-ink/50 hover:text-ink">
        Keep booking
      </button>
    </div>
  );
}
