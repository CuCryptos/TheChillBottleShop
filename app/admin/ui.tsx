import { formatCents } from "@/lib/money";

export type SearchParams = Promise<Record<string, string | string[] | undefined>>;

export function param(params: Record<string, string | string[] | undefined>, name: string): string {
  const v = params[name];
  return typeof v === "string" ? v.slice(0, 500) : "";
}

/** Result of a form action, passed back in the query string (rendered as text). */
export function Flash({ params }: { params: Record<string, string | string[] | undefined> }) {
  const ok = param(params, "ok");
  const error = param(params, "error");
  if (error) return <p className="notice notice-error" role="alert">{error}</p>;
  if (ok) return <p className="notice" role="status">{ok}</p>;
  return null;
}

export function DbMissing() {
  return (
    <p className="notice notice-error" role="alert">
      <strong>Database not configured.</strong> Set <code>SUPABASE_URL</code> and{" "}
      <code>SUPABASE_SERVICE_ROLE_KEY</code> on the server to use the admin.
    </p>
  );
}

export function LoadError({ what, error }: { what: string; error: { message?: string } | null | undefined }) {
  if (error) console.error(`admin: could not load ${what}:`, error);
  return (
    <p className="notice notice-error" role="alert">
      Couldn&apos;t load {what}. {error?.message ? `(${error.message})` : ""} Check that the latest migrations are applied.
    </p>
  );
}

export function Money({ cents, className }: { cents: number | null | undefined; className?: string }) {
  return <span className={`num ${className ?? ""}`}>{formatCents(cents)}</span>;
}

export function Flag({ ok, yes = "Yes", no = "No" }: { ok: boolean; yes?: string; no?: string }) {
  return <span className={`badge ${ok ? "badge-ok" : "badge-warn"}`}>{ok ? yes : no}</span>;
}
