import { NextRequest, NextResponse } from "next/server";
import { jwtVerify } from "jose";

// Protects everything under /admin (dashboard pages) and /api/admin (admin
// API routes) except the login page/endpoint itself.
export async function middleware(req: NextRequest) {
  const path = req.nextUrl.pathname;
  if (path === "/admin/login" || path === "/api/admin/login") return NextResponse.next();

  const token = req.cookies.get("admin_session")?.value;
  const isApiRoute = path.startsWith("/api/");

  if (!token) {
    if (isApiRoute) return NextResponse.json({ error: "Not authorized" }, { status: 401 });
    return NextResponse.redirect(new URL("/admin/login", req.url));
  }

  try {
    const secret = new TextEncoder().encode(process.env.SESSION_SECRET || "dev-secret-change-me");
    await jwtVerify(token, secret);
    return NextResponse.next();
  } catch {
    if (isApiRoute) return NextResponse.json({ error: "Not authorized" }, { status: 401 });
    return NextResponse.redirect(new URL("/admin/login", req.url));
  }
}

export const config = {
  matcher: ["/admin/:path*", "/api/admin/:path*"]
};
