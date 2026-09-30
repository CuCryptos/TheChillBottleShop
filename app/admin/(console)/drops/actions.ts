"use server";

import { requireAdmin } from "@/lib/admin-auth";
import { friendlyDbError } from "@/lib/admin-errors";
import { db } from "@/lib/db";
import { ALLOCATION_MODES, DROP_STATUSES, label } from "@/lib/db-enums";
import { int, oneOf, optionalText, text, uuid } from "@/lib/form-fields";
import { hawaiiLocalToUtc } from "@/lib/hawaii-time";
import { parseDollars } from "@/lib/money";
import { back } from "../../back";

const PAGE = "/admin/drops";
const SLUG = /^[a-z0-9]+(?:-[a-z0-9]+)*$/;

async function client() {
  await requireAdmin();
  return db() ?? back(PAGE, "error", "Database not configured.");
}

export async function createDrop(form: FormData) {
  const supabase = await client();
  const title = text(form, "title", 120);
  const slug = text(form, "slug", 80).toLowerCase();
  const mode = oneOf(form, "allocation_mode", ALLOCATION_MODES);
  const opens = hawaiiLocalToUtc(text(form, "opens_at", 20));
  const closes = hawaiiLocalToUtc(text(form, "closes_at", 20));
  const holdDays = int(form, "pickup_hold_days", 1, 60);
  const po = text(form, "purchase_order_id") ? uuid(form, "purchase_order_id") : null;

  if (!title) back(PAGE, "error", "Give the drop a title.");
  if (!SLUG.test(slug)) back(PAGE, "error", "Slug must be lowercase letters, numbers and dashes, e.g. hazy-ipa-oct.");
  if (!mode) back(PAGE, "error", "Choose an allocation mode.");
  if (!opens || !closes) back(PAGE, "error", "Enter when reservations open and close (Hawaiʻi time).");
  if (closes <= opens) back(PAGE, "error", "Reservations must close after they open.");
  if (holdDays === null) back(PAGE, "error", "Pickup hold must be 1 to 60 days.");
  if (text(form, "purchase_order_id") && !po) back(PAGE, "error", "Choose a valid purchase order.");

  const { error } = await supabase.from("drops").insert({
    title, slug, allocation_mode: mode, reservation_opens_at: opens, reservation_closes_at: closes,
    pickup_hold_days: holdDays, purchase_order_id: po,
  });
  if (error) back(PAGE, "error", friendlyDbError(error, "create the drop"));
  back(PAGE, "ok", `Created “${title}” as a draft.`);
}

export async function addItem(form: FormData) {
  const supabase = await client();
  const dropId = uuid(form, "drop_id");
  const plannedQty = int(form, "planned_qty", 0, 100_000);
  const price = parseDollars(text(form, "price", 20));
  const limitRaw = text(form, "per_member_limit");
  const limit = limitRaw ? int(form, "per_member_limit", 1, 100) : null;

  if (!dropId) back(PAGE, "error", "Unknown drop.");
  if (plannedQty === null) back(PAGE, "error", "Planned quantity must be a whole number, 0 or more.");
  if (price === null) back(PAGE, "error", "Enter the price in dollars, e.g. 24.00.");
  if (limitRaw && limit === null) back(PAGE, "error", "Per-member limit must be 1 to 100, or blank for the tier default.");

  let productId = text(form, "product_id") ? uuid(form, "product_id") : null;
  let created = false;
  if (!productId) {
    const brewery = text(form, "brewery", 120);
    const name = text(form, "name", 120);
    const pkg = text(form, "package", 80);
    const abvRaw = text(form, "abv", 6);
    const abv = abvRaw ? Number(abvRaw) : null;
    if (!brewery || !name || !pkg) back(PAGE, "error", "Pick an existing product, or enter brewery, name and package for a new one.");
    if (abvRaw && (!/^\d{1,2}(\.\d{1,2})?$/.test(abvRaw) || abv === null || abv > 70)) back(PAGE, "error", "ABV must be a number like 6.5.");
    const { data, error } = await supabase.from("products")
      .insert({ brewery, name, package: pkg, style: optionalText(form, "style", 80), abv })
      .select("id").single();
    if (error || !data) back(PAGE, "error", friendlyDbError(error, "create the product"));
    productId = data.id as string;
    created = true;
  }

  const { error } = await supabase.from("drop_items").insert({
    drop_id: dropId, product_id: productId, planned_qty: plannedQty, price_cents: price, per_member_limit: limit,
  });
  if (error) {
    if (created) await supabase.from("products").delete().eq("id", productId);
    back(PAGE, "error", friendlyDbError(error, "add the item"));
  }
  back(PAGE, "ok", "Item added.");
}

export async function setDropStatus(form: FormData) {
  const supabase = await client();
  const dropId = uuid(form, "drop_id");
  const status = oneOf(form, "status", DROP_STATUSES);
  if (!dropId || !status) back(PAGE, "error", "Choose a status.");
  const { error } = await supabase.from("drops").update({ status }).eq("id", dropId);
  if (error) back(PAGE, "error", friendlyDbError(error, "change the status"));
  back(PAGE, "ok", `Drop is now ${label(status).toLowerCase()}.`);
}

export async function runDraw(form: FormData) {
  const supabase = await client();
  const dropId = uuid(form, "drop_id");
  if (!dropId) back(PAGE, "error", "Unknown drop.");
  const { data, error } = await supabase.rpc("run_draw", { p_drop_id: dropId });
  if (error) back(PAGE, "error", friendlyDbError(error, "run the draw"));
  back(PAGE, "ok", `Draw complete: ${Number(data)} units allocated. Everyone else is waitlisted in draw order.`);
}

export async function receiveItem(form: FormData) {
  const supabase = await client();
  const itemId = uuid(form, "drop_item_id");
  const qty = int(form, "received_qty", 0, 100_000);
  if (!itemId) back(PAGE, "error", "Unknown item.");
  if (qty === null) back(PAGE, "error", "Received quantity must be a whole number, 0 or more.");
  const { error } = await supabase.rpc("receive_drop_item", { p_drop_item_id: itemId, p_received_qty: qty });
  if (error) back(PAGE, "error", friendlyDbError(error, "receive the shipment"));
  back(PAGE, "ok", `Received ${qty} units and reconciled allocations.`);
}

export async function forfeitUnclaimed(form: FormData) {
  const supabase = await client();
  const itemId = uuid(form, "drop_item_id");
  if (!itemId) back(PAGE, "error", "Unknown item.");
  const { data, error } = await supabase.rpc("forfeit_unclaimed", { p_drop_item_id: itemId });
  if (error) back(PAGE, "error", friendlyDbError(error, "forfeit unclaimed orders"));
  back(PAGE, "ok", Number(data) > 0 ? `Forfeited ${Number(data)} unclaimed units; refunds recorded and the waitlist promoted.` : "Nothing is past its pickup hold yet.");
}
