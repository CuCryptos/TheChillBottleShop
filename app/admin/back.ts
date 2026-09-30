import "server-only";
import { redirect } from "next/navigation";

/** Ends a server action by returning to an admin page with a message to show. */
export function back(path: string, kind: "ok" | "error", message: string): never {
  const sep = path.includes("?") ? "&" : "?";
  redirect(`${path}${sep}${kind}=${encodeURIComponent(message)}`);
}
