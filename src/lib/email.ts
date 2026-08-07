import { Resend } from "resend";
import { SITE } from "./config";

const resend = process.env.RESEND_API_KEY ? new Resend(process.env.RESEND_API_KEY) : null;

export async function sendBookingEmails(params: {
  guestEmail: string;
  guestName: string;
  propertyName: string;
  checkIn: string;
  checkOut: string;
  total: string;
  status: "PENDING" | "CONFIRMED";
}) {
  const subjectGuest =
    params.status === "CONFIRMED"
      ? `Booking confirmed — ${params.propertyName}`
      : `Request received — ${params.propertyName}`;

  const guestBody =
    params.status === "CONFIRMED"
      ? `Hi ${params.guestName},\n\nYour stay at ${params.propertyName} is confirmed for ${params.checkIn} to ${params.checkOut}. Total: ${params.total}.\n\nSee you soon!`
      : `Hi ${params.guestName},\n\nThanks for requesting to book ${params.propertyName} (${params.checkIn} to ${params.checkOut}). We'll confirm within 24 hours. Estimated total: ${params.total}.`;

  const ownerBody = `New ${params.status === "CONFIRMED" ? "booking" : "booking request"} for ${params.propertyName}\nGuest: ${params.guestName} (${params.guestEmail})\nDates: ${params.checkIn} → ${params.checkOut}\nTotal: ${params.total}`;

  if (!resend) {
    // No email provider configured — log so nothing is silently lost.
    console.log("[email:guest]", subjectGuest, guestBody);
    console.log("[email:owner]", ownerBody);
    return;
  }

  await resend.emails.send({
    from: `${SITE.name} <bookings@${new URL(SITE.url).hostname}>`,
    to: params.guestEmail,
    subject: subjectGuest,
    text: guestBody
  });

  await resend.emails.send({
    from: `${SITE.name} <bookings@${new URL(SITE.url).hostname}>`,
    to: SITE.supportEmail,
    subject: `[${SITE.name}] ${subjectGuest}`,
    text: ownerBody
  });
}
