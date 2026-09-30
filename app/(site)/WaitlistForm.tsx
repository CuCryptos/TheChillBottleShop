"use client";

import { useActionState, useState } from "react";
import { joinWaitlist, type JoinState } from "./actions";
import { HEARD_FROM, ISLANDS } from "@/lib/validate";

const initial: JoinState = { status: "idle" };

export function WaitlistForm({ referredBy, siteUrl }: { referredBy: string | null; siteUrl: string }) {
  const [state, action, pending] = useActionState(joinWaitlist, initial);

  if (state.status === "joined") return <Joined state={state} siteUrl={siteUrl} />;

  const errors = state.status === "invalid" ? state.errors : {};
  const v = "values" in state ? state.values : {};

  return (
    <form action={action} className="form" noValidate>
      {state.status === "duplicate" && (
        <p className="notice" role="status">
          That email is already on the list. We&apos;ll be in touch before the first drop.
        </p>
      )}
      {state.status === "error" && (
        <p className="notice notice-error" role="alert">
          Something went wrong on our end. Please try again in a minute.
        </p>
      )}

      <div className="row">
        <Field label="First name" name="firstName" error={errors.firstName}>
          <input id="firstName" name="firstName" defaultValue={v.firstName} autoComplete="given-name" required maxLength={80} />
        </Field>
        <Field label="Email" name="email" error={errors.email}>
          <input id="email" name="email" defaultValue={v.email} type="email" autoComplete="email" required />
        </Field>
      </div>

      <div className="row">
        <Field label="Date of birth" name="dateOfBirth" error={errors.dateOfBirth} hint="21+ only">
          <input id="dateOfBirth" name="dateOfBirth" defaultValue={v.dateOfBirth} type="date" autoComplete="bday" required />
        </Field>
        <Field label="Island" name="island" error={errors.island}>
          <select id="island" name="island" defaultValue={v.island ?? "oahu"} required>
            {Object.entries(ISLANDS).map(([value, label]) => (
              <option key={value} value={value}>{label}</option>
            ))}
          </select>
        </Field>
        <Field label="ZIP" name="postalCode" error={errors.postalCode}>
          <input id="postalCode" name="postalCode" defaultValue={v.postalCode} inputMode="numeric" autoComplete="postal-code"
                 pattern="96[78][0-9]{2}" maxLength={5} placeholder="968xx" required />
        </Field>
      </div>

      <Field label="How did you hear about us?" name="heardFrom">
        <select id="heardFrom" name="heardFrom" defaultValue={v.heardFrom ?? ""}>
          <option value="">Choose one (optional)</option>
          {Object.entries(HEARD_FROM).map(([value, label]) => (
            <option key={value} value={value}>{label}</option>
          ))}
        </select>
      </Field>

      <label className="check check-feature">
        <input type="checkbox" name="wantsFounding" value="yes" defaultChecked={v.wantsFounding === "yes"} />
        <span>
          <strong>I&apos;m interested in a Founding Membership.</strong> We&apos;ll open 100 founding
          spots first, with the earliest access to every drop. No payment now.
        </span>
      </label>

      <label className="check">
        <input type="checkbox" name="consent" value="yes" defaultChecked={v.consent === "yes"}
               aria-invalid={!!errors.consent} aria-describedby={errors.consent ? "consent-error" : undefined} />
        <span>Email me about launch and upcoming drops. Unsubscribe anytime.</span>
      </label>
      {errors.consent && <p className="error" id="consent-error">{errors.consent}</p>}

      {/* Honeypot */}
      <div className="hp" aria-hidden="true">
        <label>Company <input name="company" tabIndex={-1} autoComplete="off" /></label>
      </div>
      {referredBy && <input type="hidden" name="ref" value={referredBy} />}

      <button type="submit" className="button" disabled={pending}>
        {pending ? "Saving your spot…" : "Join the waitlist"}
      </button>
      <p className="fine">
        Nothing is sold or reserved through this site yet. See our <a href="/privacy">privacy note</a>.
      </p>
    </form>
  );
}

function Field({ label, name, error, hint, children }: {
  label: string; name: string; error?: string; hint?: string; children: React.ReactNode;
}) {
  return (
    <div className={`field${error ? " field-invalid" : ""}`}>
      <label htmlFor={name}>
        {label} {hint && <span className="hint">{hint}</span>}
      </label>
      {children}
      {error && <p className="error" id={`${name}-error`}>{error}</p>}
    </div>
  );
}

function Joined({ state, siteUrl }: { state: Extract<JoinState, { status: "joined" }>; siteUrl: string }) {
  const [copied, setCopied] = useState(false);
  const link = state.referralCode ? `${siteUrl}/?ref=${state.referralCode}` : null;

  return (
    <div className="joined" role="status">
      <p className="eyebrow">You&apos;re on the list</p>
      <h3>Mahalo, {state.firstName}.</h3>
      <p>
        We&apos;ll email you when memberships open and before the first drop ships. Founding
        spots go to the earliest signups and the people who bring friends.
      </p>
      {link && (
        <div className="share">
          <p className="share-label">Your invite link</p>
          <div className="share-row">
            <code>{link}</code>
            <button type="button" className="button button-small" onClick={async () => {
              try { await navigator.clipboard.writeText(link); setCopied(true); } catch { /* ignore */ }
            }}>
              {copied ? "Copied" : "Copy"}
            </button>
          </div>
        </div>
      )}
    </div>
  );
}
