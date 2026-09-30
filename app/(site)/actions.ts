"use server";

import { after } from "next/server";
import { parseSignup, type FieldErrors } from "@/lib/validate";
import { markConfirmationSent, saveSignup } from "@/lib/waitlist";
import { sendConfirmation } from "@/lib/email";

const siteUrl = process.env.NEXT_PUBLIC_SITE_URL ?? "http://localhost:3000";

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
    const { email, firstName, wantsFounding } = parsed.data;
    const { referralCode } = result;
    // Send after the response so a slow or failing email provider never delays the signup.
    after(async () => {
      const sent = await sendConfirmation(
        email,
        { firstName, wantsFounding, inviteUrl: `${siteUrl}/?ref=${referralCode}` },
        `waitlist-confirmation/${referralCode}`,
      );
      if (sent === "sent") await markConfirmationSent(referralCode);
    });
    return { status: "joined", firstName, referralCode };
  }
  return { status: result.status, values: valuesOf(form) };
}
