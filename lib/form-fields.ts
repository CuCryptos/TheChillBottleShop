// Small readers for admin form fields. Pure; everything from a form is untrusted.

type Form = { get(name: string): FormDataEntryValue | null };

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

export function text(form: Form, name: string, max = 200): string {
  const v = form.get(name);
  return typeof v === "string" ? v.trim().slice(0, max) : "";
}

export function optionalText(form: Form, name: string, max = 200): string | null {
  return text(form, name, max) || null;
}

export function uuid(form: Form, name: string): string | null {
  const v = text(form, name, 36);
  return UUID.test(v) ? v.toLowerCase() : null;
}

/** A whole number within [min, max], or null. */
export function int(form: Form, name: string, min = 0, max = 1_000_000): number | null {
  const v = text(form, name, 12);
  if (!/^-?\d+$/.test(v)) return null;
  const n = Number(v);
  return n >= min && n <= max ? n : null;
}

/** A calendar date "YYYY-MM-DD" that exists, or null. */
export function date(form: Form, name: string): string | null {
  const v = text(form, name, 10);
  if (!/^\d{4}-\d{2}-\d{2}$/.test(v)) return null;
  const d = new Date(`${v}T00:00:00Z`);
  return !Number.isNaN(d.getTime()) && d.toISOString().slice(0, 10) === v ? v : null;
}

export function oneOf<T extends string>(form: Form, name: string, options: readonly T[]): T | null {
  const v = text(form, name, 40);
  return (options as readonly string[]).includes(v) ? (v as T) : null;
}
