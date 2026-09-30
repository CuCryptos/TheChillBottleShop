import "server-only";
import { createClient, type SupabaseClient } from "@supabase/supabase-js";
import { randomBytes } from "node:crypto";
import type { SignupInput } from "./validate";

export type SaveResult =
  | { status: "created"; referralCode: string }
  | { status: "duplicate" }
  | { status: "error" };

let client: SupabaseClient | null = null;

function supabase(): SupabaseClient | null {
  const url = process.env.SUPABASE_URL;
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!url || !key) return null;
  client ??= createClient(url, key, { auth: { persistSession: false } });
  return client;
}

// Local development without Supabase: keep signups in memory so the form works.
const devSignups = new Map<string, string>();

export async function saveSignup(input: SignupInput): Promise<SaveResult> {
  const db = supabase();

  if (!db) {
    if (process.env.NODE_ENV === "production") {
      console.error("waitlist: SUPABASE_URL / SUPABASE_SERVICE_ROLE_KEY are not set");
      return { status: "error" };
    }
    if (devSignups.has(input.email)) return { status: "duplicate" };
    const referralCode = randomBytes(4).toString("hex");
    devSignups.set(input.email, referralCode);
    console.info("waitlist (dev, not persisted):", { ...input, referralCode });
    return { status: "created", referralCode };
  }

  const row = {
    email: input.email,
    first_name: input.firstName,
    date_of_birth: input.dateOfBirth,
    island: input.island,
    postal_code: input.postalCode,
    wants_founding: input.wantsFounding,
    heard_from: input.heardFrom,
    referred_by_code: input.referredBy,
  };

  let { data, error } = await db.from("waitlist_signups").insert(row).select("referral_code").single();

  // Unknown referral code (foreign key violation): keep the signup, drop the code.
  if (error?.code === "23503" && input.referredBy) {
    ({ data, error } = await db
      .from("waitlist_signups")
      .insert({ ...row, referred_by_code: null })
      .select("referral_code")
      .single());
  }

  if (error?.code === "23505") return { status: "duplicate" };
  if (error || !data) {
    console.error("waitlist insert failed:", error);
    return { status: "error" };
  }
  return { status: "created", referralCode: data.referral_code };
}

// Records that the confirmation email went out, so unsent ones can be re-sent later.
export async function markConfirmationSent(referralCode: string): Promise<void> {
  const db = supabase();
  if (!db) return;
  const { error } = await db
    .from("waitlist_signups")
    .update({ confirmation_sent_at: new Date().toISOString() })
    .eq("referral_code", referralCode);
  if (error) console.error("waitlist: could not record confirmation email:", error);
}
