import { NextRequest, NextResponse } from "next/server";
import { jwtVerify } from "jose";
import { getSessionSecret } from "@/lib/session-secret";

// Protects everything under /admin (dashboard pages) and /api/admin (admin
// API routes) except the login page/endpoint itself.
export async function middleware(req: NextRequest) {
  const path = req.nextUrl.pathname;
  if (path === "/admin/login" || path === "/api/admin/login") return NextResponse.next();

  const isApiRoute = path.startsWith("/api/");
  const deny = () =>
    isApiRoute
      ? NextResponse.json({ error: "Not authorized" }, { status: 401 })
      : NextResponse.redirect(new URL("/admin/login", req.url));

  const token = req.cookies.get("admin_session")?.value;
  const secret = getSessionSecret();
  if (!token || !secret) return deny();

  try {
    await jwtVerify(token, secret);
    return NextResponse.next();
  } catch {
    return deny();
  }
}

export const config = {
  matcher: ["/admin/:path*", "/api/admin/:path*"]
};
