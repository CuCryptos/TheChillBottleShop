// Turns Postgres / PostgREST errors into messages staff can act on.

export type DbError = { code?: string | null; message?: string | null; details?: string | null };

const CONSTRAINTS: Record<string, string> = {
  drops_window: "Reservations must close after they open.",
  drops_slug_key: "Another drop already uses that slug.",
  drops_pickup_hold_days_check: "Pickup hold must be at least 1 day.",
  drop_items_drop_id_product_id_key: "That product is already in this drop.",
  drop_items_no_oversell: "That would allocate more units than the item has.",
  purchase_orders_po_number_key: "Another purchase order already uses that PO number.",
  memberships_one_live: "That member already has another pending, active or past-due membership.",
};

export function friendlyDbError(error: DbError | null | undefined, action: string): string {
  const raw = (error?.message ?? "").trim();
  const constraint = Object.keys(CONSTRAINTS).find((c) => raw.includes(c) || error?.details?.includes(c));
  let reason: string;
  if (constraint) reason = CONSTRAINTS[constraint];
  else if (error?.code === "P0001" && raw) reason = raw[0].toUpperCase() + raw.slice(1) + (/[.!?]$/.test(raw) ? "" : ".");
  else if (error?.code === "23505") reason = "That already exists.";
  else if (error?.code === "23503") reason = "It refers to something that no longer exists.";
  else if (error?.code === "23514" || error?.code === "22P02" || error?.code === "22007") reason = "One of the values isn't allowed.";
  else if (error?.code === "PGRST202" || error?.code === "42883") reason = "The database function is missing. Apply the latest migrations.";
  else if (error?.code === "42P01" || error?.code === "PGRST205") reason = "A table is missing. Apply the latest migrations.";
  else reason = "Something went wrong. Check the server logs.";
  return `Couldn't ${action}: ${reason}`;
}
