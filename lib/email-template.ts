// Waitlist confirmation email. Pure functions only: shared by the server-side
// sender and the node:test suite.

export type ConfirmationInput = {
  firstName: string;
  inviteUrl: string;
  wantsFounding: boolean;
};

export type RenderedEmail = { subject: string; html: string; text: string };

const escapeHtml = (s: string) =>
  s.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;").replace(/'/g, "&#39;");

export function renderConfirmation({ firstName, inviteUrl, wantsFounding }: ConfirmationInput): RenderedEmail {
  const subject = "You're on the list — The Chill Bottle Shop";

  const founding = wantsFounding
    ? "You told us you're interested in a Founding Membership. We'll offer the 100 Founding spots to the waitlist before anyone else, starting with the earliest signups and the people who bring friends."
    : "When memberships open, waitlist members hear first. If you'd like a Founding spot, just reply to this email and we'll note it.";

  const text = [
    `Aloha ${firstName},`,
    "",
    "You're on the waitlist for The Chill Bottle Shop, a members-first bottle shop for Hawaiʻi where limited beer drops are reserved before they land.",
    "",
    founding,
    "",
    "Your invite link:",
    inviteUrl,
    "Every friend who joins with it moves you toward the front of the line for Founding spots.",
    "",
    "What happens next: we're finishing our Hawaiʻi retail liquor license, and nothing is sold until it's issued. There's nothing to pay now. We'll email you when memberships open and before the first drop.",
    "",
    "Didn't sign up? Reply to this email and we'll remove you.",
    "",
    "Mahalo,",
    "The Chill Bottle Shop",
    "Honolulu, Hawaiʻi · Must be 21 or older",
  ].join("\n");

  const name = escapeHtml(firstName);
  const url = escapeHtml(inviteUrl);
  const p = "margin:0 0 16px;font-size:16px;line-height:1.6;color:#33505a;";

  const html = `<!doctype html>
<html lang="en">
<head><meta charset="utf-8"><meta name="viewport" content="width=device-width, initial-scale=1"><title>${escapeHtml(subject)}</title></head>
<body style="margin:0;padding:0;background:#f7f4ee;">
  <table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="background:#f7f4ee;">
    <tr><td align="center" style="padding:32px 16px;">
      <table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="max-width:560px;background:#ffffff;border:1px solid #d9d2c5;border-radius:16px;font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',Roboto,Helvetica,Arial,sans-serif;">
        <tr><td style="background:#0e2a33;border-radius:16px 16px 0 0;padding:24px 28px;">
          <p style="margin:0;font-family:Georgia,serif;font-size:20px;font-weight:600;color:#f7f4ee;">The Chill Bottle Shop</p>
        </td></tr>
        <tr><td style="padding:28px;">
          <p style="margin:0 0 8px;font-size:12px;font-weight:700;letter-spacing:.14em;text-transform:uppercase;color:#e8633a;">You're on the list</p>
          <h1 style="margin:0 0 16px;font-family:Georgia,serif;font-size:28px;line-height:1.2;color:#0e2a33;">Aloha ${name},</h1>
          <p style="${p}">You're on the waitlist for The Chill Bottle Shop, a members-first bottle shop for Hawaiʻi where limited beer drops are reserved before they land.</p>
          <p style="${p}">${escapeHtml(founding)}</p>
          <table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="margin:0 0 16px;background:#d9f0f2;border-radius:12px;">
            <tr><td style="padding:16px 18px;">
              <p style="margin:0 0 6px;font-size:14px;font-weight:700;color:#0e2a33;">Your invite link</p>
              <p style="margin:0 0 6px;font-size:15px;word-break:break-all;"><a href="${url}" style="color:#0e2a33;">${url}</a></p>
              <p style="margin:0;font-size:14px;color:#33505a;">Every friend who joins with it moves you toward the front of the line for Founding spots.</p>
            </td></tr>
          </table>
          <p style="${p}"><strong style="color:#0e2a33;">What happens next:</strong> we're finishing our Hawaiʻi retail liquor license, and nothing is sold until it's issued. There's nothing to pay now. We'll email you when memberships open and before the first drop.</p>
          <p style="margin:0;font-size:16px;line-height:1.6;color:#33505a;">Mahalo,<br>The Chill Bottle Shop</p>
        </td></tr>
        <tr><td style="padding:18px 28px;border-top:1px solid #ece6db;font-size:12px;line-height:1.6;color:#5f7780;">
          Didn't sign up? Reply to this email and we'll remove you.<br>Honolulu, Hawaiʻi · Must be 21 or older
        </td></tr>
      </table>
    </td></tr>
  </table>
</body>
</html>`;

  return { subject, html, text };
}
