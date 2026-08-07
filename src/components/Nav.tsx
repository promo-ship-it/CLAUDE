import Link from "next/link";
import { SITE } from "@/lib/config";

export default function Nav() {
  return (
    <header className="border-b border-line bg-paper/95 backdrop-blur sticky top-0 z-40">
      <div className="max-w-6xl mx-auto px-6 py-5 flex items-center justify-between">
        <Link href="/" className="font-display text-xl tracking-tight">
          {SITE.name}
        </Link>
        <nav className="flex items-center gap-8 text-sm">
          <Link href="/#stays" className="hover:text-brick transition-colors">
            Stays
          </Link>
          <Link href="/#contact" className="hover:text-brick transition-colors">
            Contact
          </Link>
        </nav>
      </div>
    </header>
  );
}
