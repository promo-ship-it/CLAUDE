"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { formatCents } from "@/lib/format";
import ImageUploader from "./ImageUploader";

export type DamageClaimView = {
  id: string;
  amount: number;
  description: string;
  photoUrls: string[];
  status: "NOTICE_SENT" | "CHARGING" | "CHARGED" | "PAYMENT_LINK_SENT" | "PAID" | "CANCELLED";
  fromDepositAmount: number;
  chargeAfter: string;
  failureReason: string | null;
};

const STATUS_TEXT: Record<DamageClaimView["status"], string> = {
  NOTICE_SENT: "Guest notified",
  CHARGING: "Charging…",
  CHARGED: "Charged to card",
  PAYMENT_LINK_SENT: "Payment link sent",
  PAID: "Paid by guest",
  CANCELLED: "Withdrawn"
};

/** Admin: damage claims for one completed booking (Terms §5). */
export default function DamageClaims({
  bookingId,
  claims,
  eligibleReason,
  capRemaining,
  hasCard,
  cardRequested,
  paymentsEnabled,
  noticeHours
}: {
  bookingId: string;
  claims: DamageClaimView[];
  eligibleReason: string | null;
  capRemaining: number;
  hasCard: boolean;
  cardRequested: boolean;
  paymentsEnabled: boolean;
  noticeHours: number;
}) {
  const router = useRouter();
  const [open, setOpen] = useState(false);
  const [busy, setBusy] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [message, setMessage] = useState<string | null>(null);
  const [amount, setAmount] = useState("");
  const [description, setDescription] = useState("");
  const textareaId = `damage-photos-${bookingId}`;

  const post = async (url: string, body?: object) => {
    const res = await fetch(url, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: body ? JSON.stringify(body) : undefined
    });
    const data = await res.json().catch(() => ({}));
    if (!res.ok) throw new Error(data.error || "Something went wrong");
    return data;
  };

  const run = async (key: string, fn: () => Promise<string | void>) => {
    setBusy(key);
    setError(null);
    setMessage(null);
    try {
      const msg = await fn();
      if (msg) setMessage(msg);
      router.refresh();
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setBusy(null);
    }
  };

  const submitClaim = (e: React.FormEvent) => {
    e.preventDefault();
    const photos = (document.getElementById(textareaId) as HTMLTextAreaElement | null)?.value.split("\n") ?? [];
    run("new", async () => {
      await post("/api/admin/damage-claims", { bookingId, amount: Number(amount), description, photoUrls: photos });
      setOpen(false);
      setAmount("");
      setDescription("");
      return `Notice emailed to the guest. You can charge after the ${noticeHours}-hour notice period.`;
    });
  };

  const now = Date.now();

  return (
    <div className="mt-3 border-t border-line pt-3 text-xs">
      <div className="flex items-center justify-between gap-3 flex-wrap">
        <span className="font-medium text-ink/70">Damages</span>
        <span className="text-ink/50">
          Card on file: {hasCard ? "yes" : "no"}
          {paymentsEnabled && (
            <button
              className="ml-2 text-brick hover:underline disabled:opacity-40"
              disabled={busy !== null}
              onClick={() =>
                run("card", async () => {
                  await post(`/api/admin/bookings/${bookingId}/request-card`);
                  return "Emailed the guest a secure link to save a card.";
                })
              }
            >
              {hasCard ? "Ask guest for a new card" : cardRequested ? "Re-send card request" : "Ask guest to save a card"}
            </button>
          )}
        </span>
      </div>

      {claims.map((c) => {
        const ready = new Date(c.chargeAfter).getTime() <= now;
        return (
          <div key={c.id} className="ledger-card p-3 mt-2">
            <div className="flex justify-between gap-3">
              <span className="font-mono">{formatCents(c.amount)}</span>
              <span className={c.status === "CHARGED" || c.status === "PAID" ? "text-sage" : "text-ink/60"}>
                {STATUS_TEXT[c.status]}
              </span>
            </div>
            {c.fromDepositAmount > 0 && (
              <p className="text-ink/50 mt-1">{formatCents(c.fromDepositAmount)} taken from the security hold</p>
            )}
            <p className="text-ink/70 mt-1 whitespace-pre-line">{c.description}</p>
            <p className="mt-1">
              {c.photoUrls.map((u, i) => (
                <a key={u} href={u} target="_blank" rel="noreferrer" className="text-brick hover:underline mr-2">
                  Photo {i + 1}
                </a>
              ))}
            </p>
            {c.failureReason && c.status !== "CHARGED" && c.status !== "PAID" && (
              <p className="text-ink/50 mt-1">Note: {c.failureReason}</p>
            )}
            {c.status === "NOTICE_SENT" && (
              <div className="flex gap-3 mt-2 items-center">
                <button
                  className="bg-ink text-paper px-3 py-1.5 rounded-card disabled:opacity-40"
                  disabled={!ready || busy !== null}
                  onClick={() =>
                    run(c.id, async () => {
                      const r = await post(`/api/admin/damage-claims/${c.id}/charge`);
                      return r.outcome === "CHARGED"
                        ? `Charged ${formatCents(c.amount)} to the guest's card.`
                        : `Couldn't charge the card for the rest (${r.reason}). The guest was emailed a payment link.`;
                    })
                  }
                >
                  {busy === c.id ? "Charging…" : `Charge ${formatCents(c.amount)}`}
                </button>
                {!ready && <span className="text-ink/50">Available {new Date(c.chargeAfter).toLocaleString()}</span>}
              </div>
            )}
            {(c.status === "NOTICE_SENT" || c.status === "PAYMENT_LINK_SENT") && (
              <button
                className="text-ink/50 hover:text-ink mt-2"
                disabled={busy !== null}
                onClick={() => {
                  if (!confirm("Withdraw this claim? The guest will be told nothing will be charged.")) return;
                  run(`x${c.id}`, async () => {
                    await post(`/api/admin/damage-claims/${c.id}/cancel`);
                    return "Claim withdrawn.";
                  });
                }}
              >
                Withdraw claim
              </button>
            )}
          </div>
        );
      })}

      {eligibleReason === null && !open && capRemaining > 0 && (
        <button className="text-brick hover:underline mt-2" onClick={() => setOpen(true)}>
          + Report damage
        </button>
      )}

      {open && (
        <form onSubmit={submitClaim} className="ledger-card p-3 mt-2 space-y-2">
          <p className="text-ink/60">
            The guest is emailed this description and the photos now. The card can be charged {noticeHours} hours later.
            Up to {formatCents(capRemaining)} can be claimed for this stay.
          </p>
          <label className="block">
            Amount (USD)
            <input
              type="number"
              step="0.01"
              min="1"
              max={capRemaining / 100}
              required
              value={amount}
              onChange={(e) => setAmount(e.target.value)}
              className="input text-xs mt-1"
            />
          </label>
          <label className="block">
            What was damaged, and how you arrived at the amount
            <textarea
              required
              minLength={10}
              rows={3}
              value={description}
              onChange={(e) => setDescription(e.target.value)}
              className="input text-xs mt-1"
            />
          </label>
          <div>
            Photos (required)
            <ImageUploader targetId={textareaId} hint="Uploaded photos are added to the list below. You can also paste image links, one per line." />
            <textarea id={textareaId} rows={2} placeholder="https://… (one per line)" className="input text-xs mt-1" />
          </div>
          <div className="flex gap-3">
            <button type="submit" disabled={busy !== null} className="bg-brick text-paper px-3 py-1.5 rounded-card disabled:opacity-40">
              {busy === "new" ? "Sending…" : "Send notice to guest"}
            </button>
            <button type="button" onClick={() => setOpen(false)} className="text-ink/50">
              Cancel
            </button>
          </div>
        </form>
      )}

      {message && <p className="text-sage mt-2">{message}</p>}
      {error && <p className="text-brick mt-2">{error}</p>}
    </div>
  );
}
