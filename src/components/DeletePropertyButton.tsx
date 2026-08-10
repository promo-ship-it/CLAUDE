"use client";

import { useState } from "react";

export default function DeletePropertyButton({ action }: { action: () => void }) {
  const [confirming, setConfirming] = useState(false);

  if (!confirming) {
    return (
      <button
        onClick={() => setConfirming(true)}
        className="btn-secondary border-brick text-brick hover:bg-brick hover:text-paper text-sm"
      >
        Delete this property permanently
      </button>
    );
  }

  return (
    <div className="ledger-card p-4 border-brick">
      <p className="text-sm text-brick font-medium mb-2">Are you sure?</p>
      <p className="text-xs text-ink/60 mb-4">
        This will permanently delete this property and all its bookings, blocked dates, price rules,
        and calendar sources. This cannot be undone.
      </p>
      <div className="flex gap-3">
        <form action={action}>
          <button className="bg-brick text-paper text-sm px-4 py-2 rounded-card hover:bg-brick/80">
            Yes, delete permanently
          </button>
        </form>
        <button
          onClick={() => setConfirming(false)}
          className="btn-secondary text-sm px-4 py-2"
        >
          Cancel
        </button>
      </div>
    </div>
  );
}
