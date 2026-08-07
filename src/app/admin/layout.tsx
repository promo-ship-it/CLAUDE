import Link from "next/link";
import { logoutAction } from "@/lib/actions";

export default function AdminLayout({ children }: { children: React.ReactNode }) {
  return (
    <div className="min-h-screen bg-paper">
      <header className="border-b border-line bg-ink text-paper">
        <div className="max-w-6xl mx-auto px-6 py-4 flex items-center justify-between">
          <div className="flex items-center gap-8">
            <Link href="/admin" className="font-display text-lg">
              Admin
            </Link>
            <nav className="flex items-center gap-6 text-sm text-paper/70">
              <Link href="/admin/properties" className="hover:text-paper">
                Properties
              </Link>
              <Link href="/admin/bookings" className="hover:text-paper">
                Bookings
              </Link>
              <Link href="/" className="hover:text-paper">
                View site
              </Link>
            </nav>
          </div>
          <form action={logoutAction}>
            <button className="text-sm text-paper/70 hover:text-paper">Sign out</button>
          </form>
        </div>
      </header>
      <div className="max-w-6xl mx-auto px-6 py-10">{children}</div>
    </div>
  );
}
