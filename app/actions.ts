"use server";

import { parseSignup, type FieldErrors } from "@/lib/validate";
import { saveSignup } from "@/lib/waitlist";

export type JoinState =
  | { status: "idle" }
  | { status: "invalid"; errors: FieldErrors; values: Values }
  | { status: "joined"; firstName: string; referralCode: string }
  | { status: "duplicate"; values: Values }
  | { status: "error"; values: Values };

type Values = Record<string, string>;

// Echo the answers back: React resets the form after an action completes.
function valuesOf(form: FormData): Values {
  const values: Values = {};
  for (const [key, value] of form.entries()) {
    if (typeof value === "string" && key !== "company") values[key] = value;
  }
  return values;
}

export async function joinWaitlist(_prev: JoinState, form: FormData): Promise<JoinState> {
  // Honeypot: real people never see or fill this field.
  if (typeof form.get("company") === "string" && form.get("company") !== "") {
    return { status: "joined", firstName: "friend", referralCode: "" };
  }

  const parsed = parseSignup(form);
  if (!parsed.ok) return { status: "invalid", errors: parsed.errors, values: valuesOf(form) };

  const result = await saveSignup(parsed.data);
  if (result.status === "created") {
    return { status: "joined", firstName: parsed.data.firstName, referralCode: result.referralCode };
  }
  return { status: result.status, values: valuesOf(form) };
}
