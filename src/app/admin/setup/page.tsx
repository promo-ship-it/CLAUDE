"use client";

import { useState } from "react";

export default function SetupPage() {
  const [status, setStatus] = useState<"idle" | "loading" | "done" | "error">("idle");
  const [result, setResult] = useState<any>(null);

  const handleSetup = async () => {
    setStatus("loading");
    try {
      const res = await fetch("/api/admin/setup-smart-pricing", { method: "POST" });
      const data = await res.json();
      if (res.ok) {
        setStatus("done");
        setResult(data);
      } else {
        setStatus("error");
        setResult(data);
      }
    } catch {
      setStatus("error");
      setResult({ error: "Something went wrong" });
    }
  };

  return (
    <div className="max-w-xl">
      <h1 className="text-2xl mb-4">Quick Setup</h1>
      <p className="text-sm text-ink/60 mb-8">
        One-click configuration for smart pricing. This will update ALL properties with:
      </p>

      <div className="ledger-card p-5 mb-8">
        <div className="space-y-2 text-sm font-mono">
          <div className="flex justify-between">
            <span className="text-ink/60">Base rate</span>
            <span>$90/night</span>
          </div>
          <div className="flex justify-between">
            <span className="text-ink/60">Price floor</span>
            <span>$75/night</span>
          </div>
          <div className="flex justify-between">
            <span className="text-ink/60">Price ceiling</span>
            <span>$180/night</span>
          </div>
          <div className="pt-3 rule mt-3 space-y-1">
            <p className="text-ink/60 text-xs mb-2">Smart pricing rules:</p>
            <div className="flex justify-between">
              <span className="text-ink/60">Weekend (Fri/Sat)</span>
              <span className="text-brick">+15%</span>
            </div>
            <div className="flex justify-between">
              <span className="text-ink/60">Last minute (≤5 days)</span>
              <span className="text-sage">-10%</span>
            </div>
            <div className="flex justify-between">
              <span className="text-ink/60">Far-out (90+ days)</span>
              <span className="text-sage">-5%</span>
            </div>
            <div className="flex justify-between">
              <span className="text-ink/60">High demand (70%+ booked)</span>
              <span className="text-brick">+20%</span>
            </div>
            <div className="flex justify-between">
              <span className="text-ink/60">Low demand (&lt;20% booked)</span>
              <span className="text-sage">-15%</span>
            </div>
          </div>
        </div>
      </div>

      {status === "idle" && (
        <button onClick={handleSetup} className="btn-primary">
          Apply smart pricing to all properties
        </button>
      )}

      {status === "loading" && (
        <p className="text-sm text-ink/50">Setting up…</p>
      )}

      {status === "done" && (
        <div className="bg-sage/10 border border-sage/30 rounded-card p-4">
          <p className="text-sage font-medium text-sm mb-2">Done!</p>
          <p className="text-xs text-ink/60">{result?.message}</p>
        </div>
      )}

      {status === "error" && (
        <div className="bg-brick/10 border border-brick/30 rounded-card p-4">
          <p className="text-brick font-medium text-sm mb-2">Error</p>
          <p className="text-xs text-ink/60">{result?.error}</p>
        </div>
      )}
    </div>
  );
}
