import { SignJWT, jwtVerify } from "jose";
import { cookies } from "next/headers";
import bcrypt from "bcryptjs";

const COOKIE_NAME = "admin_session";
const secretKey = () => new TextEncoder().encode(process.env.SESSION_SECRET || "dev-secret-change-me");

export async function createAdminSession() {
  const token = await new SignJWT({ role: "admin" })
    .setProtectedHeader({ alg: "HS256" })
    .setIssuedAt()
    .setExpirationTime("7d")
    .sign(secretKey());

  cookies().set(COOKIE_NAME, token, {
    httpOnly: true,
    secure: process.env.NODE_ENV === "production",
    sameSite: "lax",
    path: "/",
    maxAge: 60 * 60 * 24 * 7
  });
}

export async function clearAdminSession() {
  cookies().delete(COOKIE_NAME);
}

export async function isAdminAuthed(): Promise<boolean> {
  const token = cookies().get(COOKIE_NAME)?.value;
  if (!token) return false;
  try {
    await jwtVerify(token, secretKey());
    return true;
  } catch {
    return false;
  }
}

export async function verifyAdminCredentials(email: string, password: string): Promise<boolean> {
  const validEmail = process.env.ADMIN_EMAIL;
  const validHash = process.env.ADMIN_PASSWORD_HASH;
  if (!validEmail || !validHash) return false;
  if (email.trim().toLowerCase() !== validEmail.trim().toLowerCase()) return false;
  return bcrypt.compare(password, validHash);
}
