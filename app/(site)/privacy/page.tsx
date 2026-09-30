import type { Metadata } from "next";

export const metadata: Metadata = { title: "Privacy — The Chill Bottle Shop" };

// Plain-language draft. Have counsel review before launch.
export default function Privacy() {
  return (
    <main className="prose">
      <a href="/" className="back">← Back</a>
      <h1>Privacy</h1>
      <p>Last updated October 1, 2026.</p>

      <h2>What we collect</h2>
      <p>
        When you join the waitlist we collect your first name, email address, date of birth, island
        and ZIP code, whether you&apos;re interested in a Founding Membership, how you heard about
        us, and the invite link you used (if any).
      </p>

      <h2>Why</h2>
      <ul>
        <li>Date of birth: to confirm you&apos;re 21 or older.</li>
        <li>Island and ZIP: to plan pickup and delivery areas in Hawaiʻi.</li>
        <li>Email: to tell you about launch, memberships and upcoming drops.</li>
        <li>Invite links: to credit people who bring friends when offering Founding spots.</li>
      </ul>

      <h2>What we don&apos;t do</h2>
      <p>
        We don&apos;t sell your information. We share it only with service providers that help us
        run the waitlist (such as our database and email providers), and only for that purpose.
      </p>

      <h2>Your choices</h2>
      <p>
        Every email we send includes an unsubscribe link. To see or delete your waitlist information, reply to any
        email from us and we&apos;ll take care of it.
      </p>
    </main>
  );
}
