import { redirect } from "next/navigation";
import { adminEnabled, hasAdminSession } from "@/lib/admin-auth";
import { login } from "../auth-actions";

export default async function Login({ searchParams }: { searchParams: Promise<{ error?: string | string[] }> }) {
  if (await hasAdminSession()) redirect("/admin");
  const { error } = await searchParams;
  const enabled = adminEnabled();

  return (
    <main className="admin-login">
      <div className="card">
        <p className="wordmark wordmark-dark">The Chill Bottle Shop</p>
        <h1>Staff sign in</h1>
        {enabled ? (
          <form action={login} className="form">
            {error && <p className="notice notice-error" role="alert">That password isn&apos;t right.</p>}
            <div className="field">
              <label htmlFor="password">Password</label>
              <input id="password" name="password" type="password" autoComplete="current-password" required autoFocus />
            </div>
            <button className="button" type="submit">Sign in</button>
          </form>
        ) : (
          <p className="notice notice-error" role="alert">
            The staff admin is disabled. Set <code>ADMIN_PASSWORD</code> and <code>ADMIN_SESSION_SECRET</code> (at
            least 32 characters) on the server to turn it on.
          </p>
        )}
      </div>
    </main>
  );
}
