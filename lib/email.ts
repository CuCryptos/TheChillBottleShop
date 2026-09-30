import "server-only";
import { renderConfirmation, type ConfirmationInput } from "./email-template.ts";

export type SendResult = "sent" | "skipped" | "failed";

// Sends the waitlist confirmation through Resend's HTTP API. Never throws: a
// failed email must not undo or hide a successful signup.
export async function sendConfirmation(
  to: string,
  input: ConfirmationInput,
  idempotencyKey: string,
): Promise<SendResult> {
  const apiKey = process.env.RESEND_API_KEY;
  const from = process.env.EMAIL_FROM;
  const email = renderConfirmation(input);

  if (!apiKey || !from) {
    if (process.env.NODE_ENV === "production") {
      console.warn("confirmation email skipped: RESEND_API_KEY / EMAIL_FROM are not set");
    } else {
      console.info(`confirmation email (dev, not sent) to ${to}:\n${email.text}`);
    }
    return "skipped";
  }

  try {
    const res = await fetch("https://api.resend.com/emails", {
      method: "POST",
      headers: {
        Authorization: `Bearer ${apiKey}`,
        "Content-Type": "application/json",
        // Resend drops repeats with the same key, so a retry can't double-send.
        "Idempotency-Key": idempotencyKey,
      },
      body: JSON.stringify({
        from,
        to: [to],
        reply_to: process.env.EMAIL_REPLY_TO || undefined,
        subject: email.subject,
        html: email.html,
        text: email.text,
      }),
    });
    if (!res.ok) {
      console.error("confirmation email failed:", res.status, await res.text());
      return "failed";
    }
    return "sent";
  } catch (err) {
    console.error("confirmation email failed:", err);
    return "failed";
  }
}
