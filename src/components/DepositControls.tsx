"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { formatCents } from "@/lib/format";

type Status = "SCHEDULED" | "PLACING" | "HELD" | "RENEWING" | "CAPTURING" | "FAILED" | "CAPTURED" | "RELEASED";

/** Admin: one line showing the booking's security hold, with release/retry buttons. */
export default function DepositControls(props: {
  bookingId: string;
  amount: number;
  status: Status;
  heldUntil: string | null;
  placeFrom: string;
  releaseAt: string;
  captured: number;
  note: string | null;
}) {
  const router = useRouter();
  const [busy, setBusy] = useState(false);
  const [msg, setMsg] = useState<string | null>(null);

  const act = async (action: "release" | "retry") => {
    setBusy(true);
    setMsg(null);
    try {
      const res = await fetch(`/api/admin/bookings/${props.bookingId}/deposit`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ action })
      });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) setMsg(data.error || "Something went wrong");
      else setMsg(data.result === "HELD" ? "Hold placed." : data.result === "FAILED" ? "The card still couldn't be authorized." : "Hold released.");
      router.refresh();
    } finally {
      setBusy(false);
    }
  };

  const d = (iso: string | null) => (iso ? new Date(iso).toLocaleDateString() : "");
  const text: Record<Status, string> = {
    SCHEDULED: `scheduled for ${d(props.placeFrom)}`,
    PLACING: "being placed…",
    HELD: `held — released ${d(props.releaseAt)} unless damage is reported`,
    RENEWING: "renewing…",
    CAPTURING: "being used for damages…",
    FAILED: "couldn't be placed — guest asked for a working card",
    CAPTURED: `${formatCents(props.captured)} used for damages`,
    RELEASED: "released"
  };

  return (
    <div className="mt-2 text-xs text-ink/60 flex flex-wrap items-center gap-x-3 gap-y-1">
      <span>
        Security hold {formatCents(props.amount)}:{" "}
        <span className={props.status === "FAILED" ? "text-brick" : props.status === "HELD" ? "text-sage" : ""}>{text[props.status]}</span>
      </span>
      {props.note && props.status !== "RELEASED" && <span className="text-ink/40">({props.note.replace(/^(FAILED|RENEWAL FAILED): /, "")})</span>}
      {props.status === "HELD" && (
        <button disabled={busy} onClick={() => act("release")} className="text-brick hover:underline disabled:opacity-40">
          Release now
        </button>
      )}
      {props.status === "FAILED" && (
        <button disabled={busy} onClick={() => act("retry")} className="text-brick hover:underline disabled:opacity-40">
          Retry hold
        </button>
      )}
      {msg && <span className="text-ink">{msg}</span>}
    </div>
  );
}
