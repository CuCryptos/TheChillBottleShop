// Validation for waitlist signups. Pure functions only: this file is shared by
// the server action and the node:test suite.

export const ISLANDS = {
  oahu: "Oʻahu",
  maui: "Maui",
  hawaii: "Hawaiʻi Island",
  kauai: "Kauaʻi",
  molokai: "Molokaʻi",
  lanai: "Lānaʻi",
} as const;
export type Island = keyof typeof ISLANDS;

export const HEARD_FROM = {
  hopgrail: "hopgrail.com",
  instagram: "Instagram",
  friend: "A friend",
  brewery: "A brewery or bar",
  other: "Somewhere else",
} as const;

export const MINIMUM_AGE = 21;

export type SignupInput = {
  email: string;
  firstName: string;
  dateOfBirth: string; // YYYY-MM-DD
  island: Island;
  postalCode: string;
  wantsFounding: boolean;
  heardFrom: keyof typeof HEARD_FROM | null;
  referredBy: string | null;
};

export type FieldErrors = Partial<Record<"email" | "firstName" | "dateOfBirth" | "island" | "postalCode" | "consent", string>>;

export type ParseResult = { ok: true; data: SignupInput } | { ok: false; errors: FieldErrors };

const EMAIL = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
const HAWAII_ZIP = /^96[78]\d{2}$/;
const REFERRAL = /^[a-f0-9]{8}$/;

/** Today's calendar date in Hawaiʻi as YYYY-MM-DD (servers run in UTC, which is a day ahead each evening). */
export function hawaiiToday(now: Date = new Date()): string {
  return new Intl.DateTimeFormat("en-CA", { timeZone: "Pacific/Honolulu" }).format(now);
}

/** True if someone born on `dob` is at least 21 on `today` (both YYYY-MM-DD calendar dates). */
export function isOfAge(dob: string, today: string = hawaiiToday()): boolean {
  const m = /^(\d{4})-(\d{2})-(\d{2})$/.exec(dob);
  if (!m) return false;
  const [y, mo, d] = [Number(m[1]), Number(m[2]), Number(m[3])];
  const born = new Date(Date.UTC(y, mo - 1, d));
  if (born.getUTCFullYear() !== y || born.getUTCMonth() !== mo - 1 || born.getUTCDate() !== d) return false;
  const [ty, tm, td] = today.split("-").map(Number);
  const t = { y: ty, m: tm, d: td };
  let age = t.y - y;
  if (t.m < mo || (t.m === mo && t.d < d)) age -= 1;
  return age >= MINIMUM_AGE && age < 120;
}

function str(v: FormDataEntryValue | null | undefined): string {
  return typeof v === "string" ? v.trim() : "";
}

export function parseSignup(form: { get(name: string): FormDataEntryValue | null }, today: string = hawaiiToday()): ParseResult {
  const errors: FieldErrors = {};

  const email = str(form.get("email")).toLowerCase();
  if (!EMAIL.test(email) || email.length > 254) errors.email = "Enter a valid email address.";

  const firstName = str(form.get("firstName"));
  if (!firstName || firstName.length > 80) errors.firstName = "Tell us what to call you.";

  const dateOfBirth = str(form.get("dateOfBirth"));
  if (!dateOfBirth) errors.dateOfBirth = "Enter your date of birth.";
  else if (!isOfAge(dateOfBirth, today)) errors.dateOfBirth = "You must be 21 or older to join.";

  const island = str(form.get("island"));
  if (!(island in ISLANDS)) errors.island = "Choose your island.";

  const postalCode = str(form.get("postalCode"));
  if (!HAWAII_ZIP.test(postalCode)) errors.postalCode = "We're Hawaiʻi-only for now. Enter a 967xx or 968xx ZIP.";

  if (str(form.get("consent")) !== "yes") errors.consent = "Please agree to receive drop emails so we can reach you.";

  const heard = str(form.get("heardFrom"));
  const ref = str(form.get("ref")).toLowerCase();

  if (Object.keys(errors).length > 0) return { ok: false, errors };
  return {
    ok: true,
    data: {
      email,
      firstName,
      dateOfBirth,
      island: island as Island,
      postalCode,
      wantsFounding: str(form.get("wantsFounding")) === "yes",
      heardFrom: heard in HEARD_FROM ? (heard as keyof typeof HEARD_FROM) : null,
      referredBy: REFERRAL.test(ref) ? ref : null,
    },
  };
}
