import { SITE } from "@/lib/config";

export default function Footer() {
  return (
    <footer id="contact" className="border-t border-line mt-24">
      <div className="max-w-6xl mx-auto px-6 py-12 flex flex-col md:flex-row justify-between gap-6 text-sm">
        <div>
          <p className="font-display text-lg mb-1">{SITE.name}</p>
          <p className="text-ink/60">Booking direct means no platform fees — just us.</p>
        </div>
        <div className="text-ink/60">
          <p>Questions before you book?</p>
          <a href={`mailto:${SITE.supportEmail}`} className="text-brick hover:underline">
            {SITE.supportEmail}
          </a>
        </div>
      </div>
      <div className="rule">
        <p className="max-w-6xl mx-auto px-6 py-4 text-xs text-ink/40 font-mono">
          © {new Date().getFullYear()} {SITE.name}
        </p>
      </div>
    </footer>
  );
}
