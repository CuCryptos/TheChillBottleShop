// Postgres enum values used by the admin forms (see supabase/migrations/).

export const DROP_STATUSES = ["draft", "announced", "open", "closed", "inbound", "received", "fulfilling", "complete", "cancelled"] as const;
export type DropStatus = (typeof DROP_STATUSES)[number];

export const ALLOCATION_MODES = ["first_come", "draw"] as const;
export type AllocationMode = (typeof ALLOCATION_MODES)[number];

export const PO_STATUSES = ["draft", "submitted", "confirmed", "shipped", "received", "cancelled"] as const;
export type PoStatus = (typeof PO_STATUSES)[number];

export const MEMBERSHIP_STATUSES = ["pending", "active", "past_due", "cancelled", "expired"] as const;
export type MembershipStatus = (typeof MEMBERSHIP_STATUSES)[number];

export function label(value: string): string {
  const s = value.replace(/_/g, " ");
  return s[0].toUpperCase() + s.slice(1);
}
