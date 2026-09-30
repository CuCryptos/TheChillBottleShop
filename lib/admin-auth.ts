import "server-only";
import { cookies } from "next/headers";
import { redirect } from "next/navigation";
import { ADMIN_COOKIE, SESSION_TTL_MS, adminConfig, signSession, verifySession } from "./admin-session";

export function adminEnabled(): boolean {
  return adminConfig(process.env) !== null;
}

// Reads the cookie before anything else so admin routes always render per request.
export async function hasAdminSession(): Promise<boolean> {
  const token = (await cookies()).get(ADMIN_COOKIE)?.value;
  const config = adminConfig(process.env);
  return config !== null && verifySession(token, config.secret, Date.now());
}

/** Call first in every admin page, server action and route handler. */
export async function requireAdmin(): Promise<void> {
  if (!(await hasAdminSession())) redirect("/admin/login");
}

export async function startAdminSession(): Promise<void> {
  const config = adminConfig(process.env);
  if (!config) throw new Error("admin is disabled");
  (await cookies()).set(ADMIN_COOKIE, signSession(config.secret, Date.now()), {
    httpOnly: true,
    secure: process.env.NODE_ENV === "production",
    sameSite: "lax",
    path: "/admin",
    maxAge: SESSION_TTL_MS / 1000,
  });
}

export async function endAdminSession(): Promise<void> {
  (await cookies()).set(ADMIN_COOKIE, "", {
    httpOnly: true,
    secure: process.env.NODE_ENV === "production",
    sameSite: "lax",
    path: "/admin",
    maxAge: 0,
  });
}
