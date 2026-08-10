"use client";

import { useEffect, useRef, useState } from "react";

type Message = {
  id: string;
  sender: "GUEST" | "HOST";
  text: string;
  createdAt: string;
};

export default function AdminMessages({ bookingId }: { bookingId: string }) {
  const [messages, setMessages] = useState<Message[]>([]);
  const [newMessage, setNewMessage] = useState("");
  const [sending, setSending] = useState(false);
  const [loading, setLoading] = useState(true);
  const [expanded, setExpanded] = useState(false);
  const bottomRef = useRef<HTMLDivElement>(null);

  const fetchMessages = async () => {
    try {
      const res = await fetch(`/api/messages/${bookingId}`);
      if (res.ok) {
        const data = await res.json();
        setMessages(data.messages);
      }
    } catch {
      // silently fail
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    if (expanded) {
      fetchMessages();
      const interval = setInterval(fetchMessages, 10000);
      return () => clearInterval(interval);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [bookingId, expanded]);

  useEffect(() => {
    if (expanded) {
      bottomRef.current?.scrollIntoView({ behavior: "smooth" });
    }
  }, [messages, expanded]);

  const handleSend = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!newMessage.trim()) return;
    setSending(true);

    try {
      const res = await fetch(`/api/messages/${bookingId}`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ text: newMessage.trim(), sender: "HOST" })
      });
      if (res.ok) {
        setNewMessage("");
        await fetchMessages();
      }
    } catch {
      // silently fail
    } finally {
      setSending(false);
    }
  };

  const formatTime = (dateStr: string) => {
    const d = new Date(dateStr);
    return d.toLocaleDateString("en-US", { month: "short", day: "numeric" }) +
      " " +
      d.toLocaleTimeString("en-US", { hour: "numeric", minute: "2-digit" });
  };

  if (!expanded) {
    return (
      <button
        onClick={() => setExpanded(true)}
        className="text-xs text-brick hover:underline mt-1"
      >
        Messages
      </button>
    );
  }

  return (
    <div className="mt-3 border border-line rounded-card overflow-hidden">
      <div className="p-3 bg-sand/50 flex items-center justify-between">
        <span className="text-xs font-medium">Messages</span>
        <button onClick={() => setExpanded(false)} className="text-xs text-ink/50 hover:text-ink">
          Close
        </button>
      </div>

      <div className="h-48 overflow-y-auto p-3 space-y-2 bg-paper">
        {loading && <p className="text-xs text-ink/50">Loading…</p>}
        {!loading && messages.length === 0 && (
          <p className="text-xs text-ink/40">No messages yet</p>
        )}
        {messages.map((msg) => (
          <div
            key={msg.id}
            className={`flex flex-col ${msg.sender === "HOST" ? "items-end" : "items-start"}`}
          >
            <div
              className={`max-w-[80%] px-3 py-1.5 rounded-card text-xs ${
                msg.sender === "HOST"
                  ? "bg-ink text-paper"
                  : "bg-line text-ink"
              }`}
            >
              {msg.text}
            </div>
            <span className="text-[10px] text-ink/40 mt-0.5">
              {msg.sender === "HOST" ? "You" : "Guest"} · {formatTime(msg.createdAt)}
            </span>
          </div>
        ))}
        <div ref={bottomRef} />
      </div>

      <form onSubmit={handleSend} className="p-2 border-t border-line flex gap-2">
        <input
          type="text"
          value={newMessage}
          onChange={(e) => setNewMessage(e.target.value)}
          placeholder="Reply to guest…"
          className="flex-1 text-xs border border-line rounded-card px-2 py-1.5"
          disabled={sending}
        />
        <button
          type="submit"
          disabled={sending || !newMessage.trim()}
          className="text-xs bg-ink text-paper px-3 py-1.5 rounded-card disabled:opacity-40"
        >
          Send
        </button>
      </form>
    </div>
  );
}
