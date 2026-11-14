// Shared by middleware (Edge runtime) and server code — no Node-only imports.
// In production a real SESSION_SECRET is mandatory: without it anyone could
// forge an admin session, so admin access is refused instead of falling back
// to a guessable default.
export function getSessionSecret(): Uint8Array | null {
  const secret = process.env.SESSION_SECRET;
  if (secret && secret.length >= 32) return new TextEncoder().encode(secret);
  if (process.env.NODE_ENV !== "production") {
    return new TextEncoder().encode(secret || "local-dev-only-session-secret-not-for-production");
  }
  console.error("[auth] SESSION_SECRET is missing or shorter than 32 characters — admin login disabled.");
  return null;
}
