import { SignJWT, jwtVerify } from "jose";
import { cookies } from "next/headers";
import bcrypt from "bcryptjs";
import { getSessionSecret } from "./session-secret";

export const COOKIE_NAME = "admin_session";

export async function createAdminSession() {
  const secret = getSessionSecret();
  if (!secret) throw new Error("SESSION_SECRET is not configured");
  const token = await new SignJWT({ role: "admin" })
    .setProtectedHeader({ alg: "HS256" })
    .setIssuedAt()
    .setExpirationTime("7d")
    .sign(secret);

  (await cookies()).set(COOKIE_NAME, token, {
    httpOnly: true,
    secure: process.env.NODE_ENV === "production",
    sameSite: "lax",
    path: "/",
    maxAge: 60 * 60 * 24 * 7
  });
}

export async function clearAdminSession() {
  (await cookies()).delete(COOKIE_NAME);
}

export async function isAdminAuthed(): Promise<boolean> {
  const token = (await cookies()).get(COOKIE_NAME)?.value;
  const secret = getSessionSecret();
  if (!token || !secret) return false;
  try {
    await jwtVerify(token, secret);
    return true;
  } catch {
    return false;
  }
}

/**
 * Second line of defense for admin pages (the first is src/middleware.ts).
 * Call at the top of every admin server page.
 */
export async function requireAdminPage() {
  if (!(await isAdminAuthed())) {
    const { redirect } = await import("next/navigation");
    redirect("/admin/login");
  }
}

export async function verifyAdminCredentials(email: string, password: string): Promise<boolean> {
  const validEmail = process.env.ADMIN_EMAIL;
  const validHash = process.env.ADMIN_PASSWORD_HASH;
  if (!validEmail || !validHash) return false;
  if (email.trim().toLowerCase() !== validEmail.trim().toLowerCase()) return false;
  return bcrypt.compare(password, validHash);
}
