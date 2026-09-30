// Staff session tokens: "<expiry ms>.<HMAC-SHA256>". Pure functions (no
// "server-only") so node:test can import them; callers pass the secret and time.
import { createHash, createHmac, timingSafeEqual } from "node:crypto";

export const ADMIN_COOKIE = "cbs_admin";
export const SESSION_TTL_MS = 12 * 60 * 60 * 1000;
export const MIN_SECRET_LENGTH = 32;

export type AdminConfig = { password: string; secret: string };

/** Both env vars set (and the secret long enough), or null: the admin is disabled. */
export function adminConfig(env: Record<string, string | undefined>): AdminConfig | null {
  const password = env.ADMIN_PASSWORD ?? "";
  const secret = env.ADMIN_SESSION_SECRET ?? "";
  if (!password || secret.length < MIN_SECRET_LENGTH) return null;
  return { password, secret };
}

function sha256(value: string): Buffer {
  return createHash("sha256").update(value, "utf8").digest();
}

function signature(expires: number, secret: string): Buffer {
  return createHmac("sha256", secret).update(`admin-session.${expires}`).digest();
}

/** Constant-time password check: compares fixed-length hashes, never the raw strings. */
export function passwordMatches(input: string, expected: string): boolean {
  if (!expected) return false;
  return timingSafeEqual(sha256(input), sha256(expected));
}

export function signSession(secret: string, now: number): string {
  const expires = now + SESSION_TTL_MS;
  return `${expires}.${signature(expires, secret).toString("base64url")}`;
}

export function verifySession(token: string | undefined, secret: string, now: number): boolean {
  if (!token || secret.length < MIN_SECRET_LENGTH) return false;
  const m = /^(\d{13,16})\.([A-Za-z0-9_-]{43})$/.exec(token);
  if (!m) return false;
  const expires = Number(m[1]);
  if (!(expires > now) || expires > now + SESSION_TTL_MS) return false;
  const given = Buffer.from(m[2], "base64url");
  const expected = signature(expires, secret);
  return given.length === expected.length && timingSafeEqual(given, expected);
}
