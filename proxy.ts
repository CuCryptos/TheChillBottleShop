import { NextResponse, type NextRequest } from "next/server";
import { ADMIN_COOKIE, adminConfig, verifySession } from "@/lib/admin-session";

// First line of defense for staff pages. Every admin page, server action and
// route handler checks the session again itself (lib/admin-auth.ts).
export function proxy(request: NextRequest) {
  const { pathname } = request.nextUrl;
  if (pathname === "/admin/login") return NextResponse.next();

  const config = adminConfig(process.env);
  const token = request.cookies.get(ADMIN_COOKIE)?.value;
  if (config && verifySession(token, config.secret, Date.now())) return NextResponse.next();

  if (pathname.endsWith(".csv")) return new NextResponse("Unauthorized", { status: 401 });
  return NextResponse.redirect(new URL("/admin/login", request.url));
}

export const config = {
  matcher: ["/admin", "/admin/:path*"],
};
