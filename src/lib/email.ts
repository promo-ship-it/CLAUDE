import { Resend } from "resend";
import { SITE } from "./config";

const resend = process.env.RESEND_API_KEY ? new Resend(process.env.RESEND_API_KEY) : null;

/** Sender address. Override with EMAIL_FROM once your domain is verified in Resend. */
function fromAddress() {
  if (process.env.EMAIL_FROM) return process.env.EMAIL_FROM;
  return `${SITE.name} <bookings@${new URL(SITE.url).hostname}>`;
}

async function send(to: string, subject: string, text: string) {
  if (!resend) {
    // No email provider configured — log so nothing is silently lost.
    console.log(`[email → ${to}] ${subject}\n${text}`);
    return;
  }
  try {
    await resend.emails.send({ from: fromAddress(), to, subject, text });
  } catch (err) {
    // Never let an email failure break a booking or payment.
    console.error(`[email] failed to send "${subject}" to ${to}`, err);
  }
}

type BookingEmail = {
  guestEmail: string;
  guestName: string;
  guestPhone?: string | null;
  propertyName: string;
  checkIn: string;
  checkOut: string;
  total: string;
  policyName: string;
  policySummary: string;
  manageUrl: string;
  schedule?: { label: string; due: string; amount: string }[] | null;
  depositLine?: string | null;
};

export async function sendBookingEmails(p: BookingEmail & { status: "PENDING" | "CONFIRMED" }) {
  const confirmed = p.status === "CONFIRMED";
  const subject = confirmed ? `Booking confirmed — ${p.propertyName}` : `Request received — ${p.propertyName}`;
  const schedule = p.schedule?.length
    ? `\n\nPayment schedule:\n${p.schedule.map((s) => `  • ${s.label} — ${s.amount} (${s.due})`).join("\n")}`
    : "";

  const guestBody =
    `Hi ${p.guestName},\n\n` +
    (confirmed
      ? `Your stay at ${p.propertyName} is confirmed for ${p.checkIn} to ${p.checkOut}. Total: ${p.total}.`
      : `Thanks for requesting to book ${p.propertyName} (${p.checkIn} to ${p.checkOut}). We'll confirm within 24 hours. Estimated total: ${p.total}.`) +
    schedule +
    `\n\nCancellation policy (${p.policyName}): ${p.policySummary}` +
    (p.depositLine ? `\n\n${p.depositLine}` : "") +
    `\n\nView your booking, message us, or cancel here:\n${p.manageUrl}` +
    `\n\nSee you soon!`;

  const ownerBody =
    `New ${confirmed ? "booking" : "booking request"} for ${p.propertyName}\n` +
    `Guest: ${p.guestName} (${p.guestEmail}${p.guestPhone ? `, ${p.guestPhone}` : ""})\n` +
    `Dates: ${p.checkIn} → ${p.checkOut}\nTotal: ${p.total}\nPolicy: ${p.policyName}` +
    schedule;

  await send(p.guestEmail, subject, guestBody);
  await send(SITE.supportEmail, `[${SITE.name}] ${subject}`, ownerBody);
}

export async function sendCancellationEmails(p: {
  guestEmail: string;
  guestName: string;
  propertyName: string;
  checkIn: string;
  checkOut: string;
  refund: string;
  explanation: string;
  cancelledBy: "GUEST" | "HOST";
  note?: string | null;
}) {
  const subject = `Booking cancelled — ${p.propertyName}`;
  const guestBody =
    `Hi ${p.guestName},\n\nYour stay at ${p.propertyName} (${p.checkIn} to ${p.checkOut}) has been cancelled` +
    (p.cancelledBy === "HOST" ? " by the host" : "") +
    `.\n\nRefund: ${p.refund}\n${p.explanation}\n\nRefunds usually reach your card within 5–10 business days.`;
  const ownerBody =
    `Booking cancelled (${p.cancelledBy === "HOST" ? "by host" : "by guest"}): ${p.propertyName}\n` +
    `Guest: ${p.guestName} (${p.guestEmail})\nDates: ${p.checkIn} → ${p.checkOut}\n` +
    `Refund issued: ${p.refund}\n${p.explanation}${p.note ? `\n\nNOTE: ${p.note}` : ""}`;
  await send(p.guestEmail, subject, guestBody);
  await send(SITE.supportEmail, `[${SITE.name}] ${subject}`, ownerBody);
}

/** Alert the host about something that needs manual attention (e.g. a failed payment). */
export async function sendOwnerAlert(subject: string, body: string) {
  await send(SITE.supportEmail, `[${SITE.name}] ${subject}`, body);
}

/** Plain email to the guest (damage notices, payment links, card requests). */
export async function sendGuestEmail(to: string, subject: string, body: string) {
  await send(to, subject, body);
}
