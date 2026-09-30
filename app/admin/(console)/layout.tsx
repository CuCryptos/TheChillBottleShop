import Link from "next/link";
import { requireAdmin } from "@/lib/admin-auth";
import { logout } from "../auth-actions";

const NAV = [
  { href: "/admin", label: "Overview" },
  { href: "/admin/drops", label: "Drops" },
  { href: "/admin/purchasing", label: "Purchasing" },
  { href: "/admin/members", label: "Members" },
  { href: "/admin/finance", label: "Finance" },
];

export default async function Console({ children }: { children: React.ReactNode }) {
  await requireAdmin();

  return (
    <>
      <header className="admin-header">
        <div className="admin-wrap admin-header-inner">
          <Link href="/admin" className="wordmark">Chill Bottle · Staff</Link>
          <nav className="admin-nav" aria-label="Admin">
            {NAV.map((n) => <Link key={n.href} href={n.href}>{n.label}</Link>)}
            <form action={logout}>
              <button type="submit" className="admin-logout">Log out</button>
            </form>
          </nav>
        </div>
      </header>
      <main className="admin-wrap admin-main">{children}</main>
    </>
  );
}
