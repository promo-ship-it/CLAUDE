"use client";

import { useEffect, useRef, useState } from "react";

type Message = {
  id: string;
  sender: "GUEST" | "HOST";
  text: string;
  createdAt: string;
};

export default function GuestMessages({
  bookingId,
  messageToken
}: {
  bookingId: string;
  messageToken: string;
}) {
  const [messages, setMessages] = useState<Message[]>([]);
  const [newMessage, setNewMessage] = useState("");
  const [sending, setSending] = useState(false);
  const [loading, setLoading] = useState(true);
  const bottomRef = useRef<HTMLDivElement>(null);

  const fetchMessages = async () => {
    try {
      const res = await fetch(`/api/messages/${bookingId}?token=${messageToken}`);
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
    fetchMessages();
    // Poll every 10 seconds for new messages
    const interval = setInterval(fetchMessages, 10000);
    return () => clearInterval(interval);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [bookingId, messageToken]);

  useEffect(() => {
    bottomRef.current?.scrollIntoView({ behavior: "smooth" });
  }, [messages]);

  const handleSend = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!newMessage.trim()) return;
    setSending(true);

    try {
      const res = await fetch(`/api/messages/${bookingId}?token=${messageToken}`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ text: newMessage.trim(), sender: "GUEST" })
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

  return (
    <div className="ledger-card mt-10 text-left">
      <div className="p-4 border-b border-line">
        <h3 className="font-display text-lg">Messages</h3>
        <p className="text-xs text-ink/50">Chat with your host about your stay</p>
      </div>

      <div className="h-64 overflow-y-auto p-4 space-y-3">
        {loading && <p className="text-sm text-ink/50">Loading messages…</p>}
        {!loading && messages.length === 0 && (
          <p className="text-sm text-ink/40">No messages yet — send one below!</p>
        )}
        {messages.map((msg) => (
          <div
            key={msg.id}
            className={`flex flex-col ${msg.sender === "GUEST" ? "items-end" : "items-start"}`}
          >
            <div
              className={`max-w-[80%] px-3 py-2 rounded-card text-sm ${
                msg.sender === "GUEST"
                  ? "bg-ink text-paper"
                  : "bg-sand text-ink"
              }`}
            >
              {msg.text}
            </div>
            <span className="text-[10px] text-ink/40 mt-1">
              {msg.sender === "HOST" ? "Host" : "You"} · {formatTime(msg.createdAt)}
            </span>
          </div>
        ))}
        <div ref={bottomRef} />
      </div>

      <form onSubmit={handleSend} className="p-4 border-t border-line flex gap-2">
        <input
          type="text"
          value={newMessage}
          onChange={(e) => setNewMessage(e.target.value)}
          placeholder="Type a message…"
          className="input flex-1"
          disabled={sending}
        />
        <button
          type="submit"
          disabled={sending || !newMessage.trim()}
          className="btn-primary px-4"
        >
          {sending ? "…" : "Send"}
        </button>
      </form>
    </div>
  );
}
